import 'jest'
import { Subscription } from 'rxjs/Rx'
import streamify from './streamify'
import { Connection } from '../../../src/system/service/connection'
import StubAutobahnProxy from './autobahnConnectionProxyStub'

let stubAutobahnProxy

let connection
let receivedServiceStatusStream
let serviceClient

describe('streamify', () => {
  beforeEach(() => {
    stubAutobahnProxy = new StubAutobahnProxy()
    connection = new Connection('user', stubAutobahnProxy)
    const service = {
      connection,
      serviceType: 'myServiceType'
    }
    serviceClient = streamify(service)
    receivedServiceStatusStream = []
    serviceClient.serviceStatusStream.subscribe(statusSummary => {
      receivedServiceStatusStream.push(statusSummary)
    })
  })

  test('should not be connected at init', () => {
    assertLastStatusUpdate(1, false)
  })

  test('should be connected when matching service heartbeat is received', () => {
    connect()
    pushServiceHeartbeat('myServiceType', 'myServiceType.1', 0)
    assertLastStatusUpdate(2, true)
  })

  test('should ignore heartbeats for unrelated services', () => {
    connect()
    pushServiceHeartbeat('booking', 'booking.1', 0)
    assertLastStatusUpdate(1, false)
    pushServiceHeartbeat('myServiceType', 'myServiceType.1', 0)
    assertLastStatusUpdate(2, true)
    pushServiceHeartbeat('execution', 'booking.1', 0)
    assertLastStatusUpdate(2, true)
  })

  test('should not push duplicate status updates', () => {
    connect()
    pushServiceHeartbeat('myServiceType', 'myServiceType.1', 0)
    pushServiceHeartbeat('myServiceType', 'myServiceType.1', 0)
    pushServiceHeartbeat('myServiceType', 'myServiceType.1', 0)
    pushServiceHeartbeat('myServiceType', 'myServiceType.1', 0)
    pushServiceHeartbeat('myServiceType', 'myServiceType.1', 0)

    assertLastStatusUpdate(2, true)
  })

  test('should push a status update when load changes', () => {
    connect()
    pushServiceHeartbeat('myServiceType', 'myServiceType.1', 0) // yields
    pushServiceHeartbeat('myServiceType', 'myServiceType.1', 0) // gets ignored
    pushServiceHeartbeat('myServiceType', 'myServiceType.1', 1) // yields
    assertLastStatusUpdate(3, true)
  })

  test('should group heartbeats for service instances by service type', () => {
    connect()
    pushServiceHeartbeat('myServiceType', 'myServiceType.1', 0)
    pushServiceHeartbeat('myServiceType', 'myServiceType.2', 0)
    const instanceCount = receivedServiceStatusStream[2].instanceStatuses.length
    expect(instanceCount).toBe(2)
  })

  test('should disconnect service instance when underlying connection goes down', () => {
    connect()
    pushServiceHeartbeat('myServiceType', 'myServiceType.1', 0)
    pushServiceHeartbeat('myServiceType', 'myServiceType.2', 0)
    assertLastStatusUpdate(3, true)
    stubAutobahnProxy.setIsConnected(false)
    assertLastStatusUpdate(4, false)
    const instanceCount = receivedServiceStatusStream[3].instanceStatuses.length
    expect(instanceCount).toBe(0)
  })

  test('should handle underlying connection bouncing before any heartbeats are received', () => {
    connect()
    stubAutobahnProxy.setIsConnected(false)
    stubAutobahnProxy.setIsConnected(true)
    pushServiceHeartbeat('myServiceType', 'myServiceType.1', 0)
    assertLastStatusUpdate(3, true)
    pushServiceHeartbeat('myServiceType', 'myServiceType.2', 0) // TODO: Do we need this repetition?
    assertLastStatusUpdate(4, true)
  })

  test('disconnects then reconnect new service instance after underlying connection is bounced', () => {
    connect()
    pushServiceHeartbeat('myServiceType', 'myServiceType.1', 0)
    pushServiceHeartbeat('myServiceType', 'myServiceType.2', 0)
    assertLastStatusUpdate(3, true)
    stubAutobahnProxy.setIsConnected(false)
    assertLastStatusUpdate(4, false)
    stubAutobahnProxy.setIsConnected(true)
    pushServiceHeartbeat('myServiceType', 'myServiceType.4', 0)
    assertLastStatusUpdate(5, true)
    const instanceCount = receivedServiceStatusStream[4].instanceStatuses.length
    expect(instanceCount).toBe(1)
  })
})

// describe('createStreamOperation()', () => {
//   let receivedPrices
//   let receivedErrors
//   let onCompleteCount
//   let priceSubscriptionDisposable
//
//   function topicNameGeneratorStub(serviceType) {
//     return `topic_${serviceType}_1`
//   }
//   beforeEach(() => {
//     receivedPrices = []
//     receivedErrors = []
//     onCompleteCount = 0
//     priceSubscriptionDisposable = new Subscription()
//     subscribeToPriceStream()
//   })
//
//   test('publishes payload when underlying session receives payload', () => {
//     const price = 1
//     connectAndPublishPrice(price)
//     expect(receivedPrices.length).toEqual(1)
//     expect(receivedPrices[0]).toEqual(price)
//   })
//
//   function subscribeToPriceStream() {
//     const existing = priceSubscriptionDisposable
//     if (existing) {
//       existing.unsubscribe()
//     }
//     priceSubscriptionDisposable.add(
//       serviceClient.createStreamOperation('getPriceStream', 'EURUSD', topicNameGeneratorStub)
//         .subscribe(
//         price => {
//           console.log(`received price update: ${price}`)
//           receivedPrices.push(price)
//         },
//         err => receivedErrors.push(err),
//         () => return onCompleteCount += 1
//       )
//     )
//   }
  describe('createRequestResponseOperation()', () => {
    let responses
    let receivedErrors
    let onCompleteCount
    let requestSubscriptionDisposable

    beforeEach(() => {
      stubAutobahnProxy.setIsConnected(false)
      responses = []
      receivedErrors = []
      onCompleteCount = 0
      requestSubscriptionDisposable = new Subscription()
    })

    test('should successfully send request and receives response when connection is up', () => {
      connect()
      pushServiceHeartbeat('myServiceType', 'myServiceType.1', 0)
      sendRequest('RequestPayload', false)
      pushSuccessfulResponse('myServiceType.1', 'ResponsePayload')
      expect(responses.length).toEqual(1)
      expect(responses[0]).toEqual('ResponsePayload')
    })
    test('should successfully complete after response received', () => {
      connect()
      pushServiceHeartbeat('myServiceType', 'myServiceType.1', 0)
      sendRequest('RequestPayload', false)
      pushSuccessfulResponse('myServiceType.1', 'ResponsePayload')
      expect(onCompleteCount).toEqual(1)
    })

    test('should error when underlying connection receives error', () => {
      const error = new Error('FakeRPCError')
      connect()
      pushServiceHeartbeat('myServiceType', 'myServiceType.1', 0)
      sendRequest('RequestPayload', false)
      pushErrorResponse('myServiceType.1', error)
      expect(receivedErrors.length).toEqual(1)
      expect(receivedErrors[0]).toEqual(error)
    })

    describe('waitForSuitableService is true', () => {
      test('should wait for service before sending request when connection is down', () => {
        sendRequest('RequestPayload', true)
        expect(receivedErrors.length).toEqual(0)
        connect()
        pushServiceHeartbeat('myServiceType', 'myServiceType.1', 0)
        pushSuccessfulResponse('myServiceType.1', 'ResponsePayload')
        expect(responses.length).toEqual(1)
        expect(responses[0]).toEqual('ResponsePayload')
      })
      test('should wait for service before sending request when connection is up but services are down', () => {
        connect()
        sendRequest('RequestPayload', true)
        expect(receivedErrors.length).toEqual(0)
        pushServiceHeartbeat('myServiceType', 'myServiceType.1', 0)
        pushSuccessfulResponse('myServiceType.1', 'ResponsePayload')
        expect(responses.length).toEqual(1)
        expect(responses[0]).toEqual('ResponsePayload')
      })
    })

    describe('waitForSuitableService is false', () => {
      test('should error when connection is down', () => {
        sendRequest('RequestPayload', false)
        expect(receivedErrors.length).toEqual(1)
        expect(receivedErrors[0]).toEqual(new Error('No service available'))
      })

      test('should error when connection is up but service status is down', () => {
        sendRequest('RequestPayload', false)
        connect()
        expect(receivedErrors.length).toEqual(1)
        expect(receivedErrors[0]).toEqual(new Error('No service available'))
      })
    })
    
    function sendRequest(request, waitForSuitableService) {
      requestSubscriptionDisposable.add(
        serviceClient
          .createRequestResponseOperation(
            'executeTrade',
            request,
            waitForSuitableService
          )
          .subscribe(
            response => {
              responses.push(response)
            },
            err => receivedErrors.push(err),
            () => onCompleteCount += 1
          )
      )
    }

    function pushSuccessfulResponse(serviceId, response) {
      const stubCallResult = stubAutobahnProxy.session.getTopic(
        serviceId + '.executeTrade'
      )
      stubCallResult.onSuccess(response)
    }

    function pushErrorResponse(serviceId, err) {
      const stubCallResult = stubAutobahnProxy.session.getTopic(
        serviceId + '.executeTrade'
      )
      stubCallResult.onReject(err)
    }
  })


  function connectAndPublishPrice(price) {
    connect()
    pushServiceHeartbeat('myServiceType', 'myServiceType.1', 0)
    pushPrice('myServiceType.1', price)
  }

  function pushPrice(serviceId, price) {
    // const replyToTopic = stubAutobahnProxy.session.getTopic(
    //   serviceId + '.getPriceStream'
    // ).dto.replyTo
    const replyToTopic = topicNameGeneratorStub('myServiceType')
    stubAutobahnProxy.session
      .getTopic(replyToTopic)
      .onResults(price)
  }
})

function connect() {
  connection.connect()
  stubAutobahnProxy.setIsConnected(true)
}

function pushServiceHeartbeat(serviceType, serviceId = '', instanceLoad = 0) {
  stubAutobahnProxy.session.getTopic('status').onResults({
    Type: serviceType,
    Instance: serviceId,
    TimeStamp: '',
    Load: instanceLoad
  })
}

function assertLastStatusUpdate(
  expectedCount,
  lastStatusExpectedIsConnectedStatus
) {
  expect(receivedServiceStatusStream.length).toEqual(expectedCount)
  if (expectedCount > 0) {
    expect(receivedServiceStatusStream[expectedCount - 1].isConnected).toEqual(
      lastStatusExpectedIsConnectedStatus
    )
  }
}

function assertServiceInstanceStatus(
  statusUpdateIndex,
  serviceId,
  expectedIsConnectedStatus
) {
  const serviceStatus = receivedServiceStatusStream[statusUpdateIndex]
  expect(serviceStatus).toBeDefined()
}
