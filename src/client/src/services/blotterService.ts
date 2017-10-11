import { Observable, Scheduler } from 'rxjs/Rx'
import { TradeMapper } from './mappers'
import { logger, RetryPolicy } from '../system'
import '../system/observableExtensions/retryPolicyExt'
import { ServiceConst } from '../types'
import { BehaviorSubject } from 'rxjs/BehaviorSubject'
import LastValueObservableDictionary from '../system/service/lastValueObservableDictionary'
import { ServiceStatus } from '../types/serviceStatus'
import * as _ from 'lodash'
import { ConnectionStatus } from '../types/connectionStatus'

const log = logger.create('BlotterService')

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

export default function blotterService(connection, referenceDataService) {
  const HEARTBEAT_TIMEOUT = 3000
  const serviceType = ServiceConst.BlotterServiceKey
  const connectionStatus = connection.connectionStatusStream
    .map(status => status === ConnectionStatus.connected)
    .publish()
    .refCount()
  const errorOnDisconnectStream = connectionStatus
    .filter(isConnected => !isConnected)
    .take(1)
    .flatMap(() => Observable.throw('Underlying connection disconnected'))
  const serviceInstanceDictionaryObservable = connection
    .subscribeToTopic('status')
    .filter(s => s.Type === serviceType)
    .map(status => ({
      serviceType: status.Type,
      serviceId: status.Instance,
      timestamp: status.Timestamp,
      serviceLoad: status.Load,
      isConnected: true
    }))
    // If the underlying connection goes down we error the stream.
    // Do this before the grouping so all grouped streams error.
    .merge(errorOnDisconnectStream)
    // .filter(item => item) // if item is false don't continue
    .groupBy(serviceStatus => serviceStatus.serviceId)
    // add service instance level heartbeat timeouts, i.e. each service instance can disconnect independently
    .debounceOnMissedHeartbeat(
      HEARTBEAT_TIMEOUT,
      serviceId => ({
        serviceType,
        serviceId,
        timestamp: NaN,
        serviceLoad: NaN,
        isConnected: false
      }),
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


  const connectedServiceInstanceObservable = connectionStatus.filter(isConnected => isConnected)
    .take(1)
    // flatMap: since we're just taking one, this effectively just continues the stream by subscribing to serviceInstanceDictionaryStream
    .mergeMap(() => serviceInstanceDictionaryObservable)
    // repeat after disconnects
    .repeat()

  const multicastServiceInstanceDictionaryStream = connectedServiceInstanceObservable.multicast(
    new BehaviorSubject(new LastValueObservableDictionary())
  )
  const serviceStatusStream = multicastServiceInstanceDictionaryStream
    .map(cache => createServiceStatus(cache, serviceType))
    .publish()
    .refCount()

  return {
    serviceStatusStream,
    getTradesStream() {
      const streamOperation = Observable.create(o => {
        log.debug('Subscribing to trade stream')
        multicastServiceInstanceDictionaryStream.connect()
        const topicName = `topic_${serviceType}_${((Math.random() *
          Math.pow(36, 8)) <<
          0).toString(36)}`
        const operationName = 'getTradesStream'

        multicastServiceInstanceDictionaryStream
          .getServiceWithMinLoad()
          .subscribe(
            serviceInstanceStatus => {
              if (!serviceInstanceStatus.isConnected) {
                o.error(
                  new Error(
                    'Service instance is disconnected for stream operation'
                  )
                )
              } else {
                log.debug(
                  `Will use service instance [${serviceInstanceStatus.serviceId}] for stream operation [${operationName}]. IsConnected: [${serviceInstanceStatus.isConnected}]`
                )
                connection.subscribeToTopic(topicName).subscribe(
                  i => o.next(i),
                  err => {
                    o.error(err)
                  },
                  () => {
                    o.complete()
                  }
                )
              }
            },
            err => o.error(err),
            () => o.complete()
          )


        multicastServiceInstanceDictionaryStream.getServiceWithMinLoad().subscribe(
          serviceInstanceStatus => {
            if (!serviceInstanceStatus.isConnected) {
              o.error(
                new Error(
                  'Service instance is disconnected for stream operation'
                )
              )
            } else {
              const remoteProcedure = serviceInstanceStatus.serviceId + '.' + operationName
              connection
                .requestResponse(remoteProcedure, {}, topicName)
                .subscribe(
                  () => {
                    log.debug(
                      `Ack received for RPC hookup as part of stream operation [${operationName}]`
                    )
                  },
                  err => o.error(err),
                  () => {
                  } // noop, nothing to do here, we don't complete the outer observer on ack,
                )
            }
          },
          err => o.error(err),
          () => o.complete()
        )
      })

      return streamOperation
        .retryWithPolicy(
          RetryPolicy.backoffTo10SecondsMax,
          'getTradesStream',
          Scheduler.async
        )
        .map(dto => TradeMapper.mapTradesUpdate(referenceDataService, dto))

    }
  }
}
