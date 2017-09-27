import { BehaviorSubject, Observable, Scheduler, Subscription } from 'rxjs/Rx'
import 'rxjs/add/observable/of'
import 'rxjs/add/operator/map'
import 'rxjs/add/operator/repeat'
import 'rxjs/add/operator/mergeMapTo'

import * as _ from 'lodash'
import logger from '../logger'
import Guard from '../guard'
import {
  ConnectionStatus,
  ServiceStatus,
  ServiceInstanceStatus
} from '../../types/'
import LastValueObservableDictionary from './lastValueObservableDictionary'
// Importing ServiceObservableExtensions to add functions to Rx prototype
import '../../../src/system/service/serviceObservableExtensions'
import '../observableExtensions/retryPolicyExt'

const HEARTBEAT_TIMEOUT = 3000
export default function streamify(service) {
  const disposables = new Subscription()
  const { serviceType, connection } = service
  let isConnected = false
  Guard.stringIsNotEmpty(
    serviceType,
    'serviceType required and should not be empty'
  )
  Guard.isDefined(connection, 'connection required')
  const log = logger.create(`ServiceClient:${serviceType}`)
  // create a connectible observable that yields a dictionary of connection status for
  // each service we're getting heartbeats from .
  // The dictionary support querying by service load, handy when we kick off new operations.
  const serviceInstanceDictionaryStream = createServiceInstanceDictionaryStream().multicast(
    new BehaviorSubject(new LastValueObservableDictionary())
  )

  if (!isConnected) {
    isConnected = true
    const disposable = serviceInstanceDictionaryStream.connect()
    const prevProto = Object.getPrototypeOf(disposable)
    prevProto.dispose = prevProto.unsubscribe
    disposables.add(disposable)
  }

  /**
   * Multiplexes the underlying connection status stream by service instance heartbeats, then wraps these up as
   * an observable dictionary which can be queried (for connection status and min load) on a per operation basis.
   * For example, first we listen to an underlying connection status of bool, when true, we subscribe
   * for service heartbeats, we group service heartbeats by serviceId and add service level heartbeat timeouts/debounce, finally
   * we wrap all the service instance streams into a dictionary like structure. This structure can be queried at subscribe
   * time to determine which service instance is connected and has minimum load for a given operation.
   * @returns {Observable}
   * @private
   */
  function createServiceInstanceDictionaryStream() {
    return Observable.create(o => {
      const connectionStatus = connection.connectionStatusStream
        .map(status => status === ConnectionStatus.connected)
        .publish()
        .refCount()
      const isConnectedStream = connectionStatus.filter(
        isConnected => isConnected
      )
      const errorOnDisconnectStream = connectionStatus
        .filter(isConnected => !isConnected)
        .take(1)
        .flatMap(() => Observable.throw('Underlying connection disconnected'))
      const serviceInstanceDictionaryStream = connection
        .subscribeToTopic('status')
        .filter(s => s.Type === serviceType)
        .map(status =>
          createServiceInstanceForConnected(
            status.Type,
            status.Instance,
            status.TimeStamp,
            status.Load
          )
        )
        // If the underlying connection goes down we error the stream.
        // Do this before the grouping so all grouped streams error.
        .merge(errorOnDisconnectStream)
        // .filter(item => item) // if item is false don't continue
        .groupBy(serviceStatus => serviceStatus.serviceId)
        // add service instance level heartbeat timeouts, i.e. each service instance can disconnect independently
        .debounceOnMissedHeartbeat(
          HEARTBEAT_TIMEOUT,
          serviceId =>
            createServiceInstanceForDisconnected(serviceType, serviceId),
          Scheduler.async
        )
        // create a hash of properties which represent significant change in a status, we'll use this to filter out duplicates
        .distinctUntilChangedGroup(
          (status, statusNew) =>
            status.isConnected === statusNew.isConnected &&
            status.serviceLoad === statusNew.serviceLoad
        )
        // flattens all our service instances stream into an observable dictionary so we query the service with the least load on a per-subscribe basis
        .toServiceStatusObservableDictionary(
          serviceStatus => serviceStatus.serviceId
        )
        // catch the disconnect error of the outer stream and continue with an empty (thus disconnected) dictionary
        .catch(() => Observable.of(new LastValueObservableDictionary()))
      return (
        isConnectedStream
          .take(1)
          // flatMap: since we're just taking one, this effectively just continues the stream by subscribing to serviceInstanceDictionaryStream
          .mergeMap(() => serviceInstanceDictionaryStream)
          // repeat after disconnects
          .repeat()
          .subscribe(o)
      )
    })
  }
  /**
   * Gets a request-response observable that will act against a service which currently has the min load
   *
   * @param operationName
   * @param request
   * @param waitForSuitableService if true, will wait for a service to become available before requesting, else will error the stream
   * @returns {Observable}
   */
  function createRequestResponseOperation(
    operationName,
    request,
    waitForSuitableService = false
  ) {
    return Observable.create(o => {
      log.debug(`Creating request response operation for [${operationName}]`)
      const disposables = new Subscription()
      let hasSubscribed = false
      disposables.add(
        serviceInstanceDictionaryStream
          .getServiceWithMinLoad(waitForSuitableService)
          .subscribe(
            serviceInstanceStatus => {
              if (!serviceInstanceStatus.isConnected) {
                o.error(
                  new Error(
                    'Service instance is disconnected for request response operation'
                  )
                )
              } else if (!hasSubscribed) {
                hasSubscribed = true
                log.debug(
                  `Will use service instance [${serviceInstanceStatus.serviceId}] for request/response operation [${operationName}]. IsConnected: [${serviceInstanceStatus.isConnected}]`
                )
                const remoteProcedure =
                  serviceInstanceStatus.serviceId + '.' + operationName
                disposables.add(
                  connection
                    .requestResponse(remoteProcedure, request)
                    .subscribe(
                      response => {
                        log.debug(
                          `Response received for stream operation [${operationName}]`
                        )
                        o.next(response)
                      },
                      err => o.error(err),
                      () => o.complete()
                    )
                )
              }
            },
            err => o.error(err),
            () => o.complete()
          )
      )
      return disposables
    })
  }

  /**
   * Gets a request-responses observable that will act against a service which currently has the min load
   *
   * @param operationName
   * @param request
   * @returns {Observable}
   */
  function createStreamOperation(operationName, request) {
    return Observable.create(o => {
      log.debug(`Creating stream operation for [${operationName}]`)
      const disposables = new Subscription()
      // The backend has a different contract for streams (i.e. request-> n responses) as it does with request-response (request->single response) thus
      // the different method here to support this.
      // It works like this: client creates a temp topic, we perform a RPC to then tell the backend to push to this topic.
      // TBH this is a bit odd as the server needs to handle fanout and we don't have any really control over the attributes of the topic, however it's sufficient for our needs now.
      // What's important here for now is we can bury this logic deep in the client, expose a consistent API which could be swapped out later.
      // An alternative could be achieved by having well known endpoints for pub-sub, and request-response, const the server manage them.
      // Server could push to these with a filter, or routing key allowing the infrastructure to handle fanout, persistence, all the usual messaging middleware concerns.
      // Another approach we can incorporate would be to wrap all messages in a wrapper envelope.
      // Such an envelope could denote if the message stream should terminate, this would negate the need to distinguish between
      // request-response and stream operations as is currently the case.
      const topicName = `topic_${serviceType}_${((Math.random() *
        Math.pow(36, 8)) <<
        0).toString(36)}`
      let hasSubscribed = false
      disposables.add(
        serviceInstanceDictionaryStream.getServiceWithMinLoad().subscribe(
          serviceInstanceStatus => {
            if (!serviceInstanceStatus.isConnected) {
              o.error(
                new Error(
                  'Service instance is disconnected for stream operation'
                )
              )
            } else if (!hasSubscribed) {
              hasSubscribed = true
              log.debug(
                `Will use service instance [${serviceInstanceStatus.serviceId}] for stream operation [${operationName}]. IsConnected: [${serviceInstanceStatus.isConnected}]`
              )
              disposables.add(
                connection.subscribeToTopic(topicName).subscribe(
                  i => o.next(i),
                  err => {
                    o.error(err)
                  },
                  () => {
                    o.complete()
                  }
                )
              )
              const remoteProcedure =
                serviceInstanceStatus.serviceId + '.' + operationName
              disposables.add(
                connection
                  .requestResponse(remoteProcedure, request, topicName)
                  .subscribe(
                    () => {
                      log.debug(
                        `Ack received for RPC hookup as part of stream operation [${operationName}]`
                      )
                    },
                    err => o.error(err),
                    () => {} // noop, nothing to do here, we don't complete the outer observer on ack,
                  )
              )
            }
          },
          err => o.error(err),
          () => o.complete()
        )
      )
      return disposables
    })
  }
  return {
    ...service,
    isConnected,
    createServiceInstanceDictionaryStream,
    createRequestResponseOperation,
    createStreamOperation,
    /**
   * Sits on top of our underlying dictionary stream exposing a summary of the connection and services instance for this service client
   *
   * @returns {Observable<T>}
   */
    get serviceStatusStream() {
      return serviceInstanceDictionaryStream
        .map(cache => createServiceStatus(cache, serviceType))
        .publish()
        .refCount()
    }
  }
}

function createServiceStatus(cache, serviceType): ServiceStatus {
  const instanceStatuses = _.values(cache.values).map(
    (item: any) => item.latestValue
  )
  const isConnected = _(cache.values).some(
    (item: any) => item.latestValue.isConnected
  )
  return {
    isConnected,
    instanceStatuses,
    serviceType
  }
}

function createServiceInstanceForConnected(
  serviceType: string,
  serviceId: string,
  timestamp: number,
  serviceLoad: number
): ServiceInstanceStatus {
  Guard.stringIsNotEmpty(
    serviceType,
    'serviceType must be as string and not empty'
  )
  Guard.stringIsNotEmpty(serviceId, 'serviceId must be as string and not empty')

  return {
    serviceType,
    serviceId,
    timestamp,
    serviceLoad,
    isConnected: true
  }
}

function createServiceInstanceForDisconnected(
  serviceType: string,
  serviceId: string
): ServiceInstanceStatus {
  Guard.stringIsNotEmpty(
    serviceType,
    'serviceType must be as string and not empty'
  )
  Guard.stringIsNotEmpty(serviceId, 'serviceId must be as string and not empty')

  return {
    serviceType,
    serviceId,
    timestamp: NaN,
    serviceLoad: NaN,
    isConnected: false
  }
}
