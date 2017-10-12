import { ConnectableObservable, Observable, Scheduler } from 'rxjs/Rx'
import { TradeMapper } from './mappers'
import { logger, RetryPolicy } from '../system'
import '../system/observableExtensions/retryPolicyExt'
import { ServiceConst } from '../types'
import { ServiceStatus } from '../types/serviceStatus'
import * as _ from 'lodash'
import createMulticastDictionaryStream from '../system/service/createMulticastDictionaryStream'
import { Connection } from '../system/service/connection'
import { ReferenceDataService } from '../types/referenceDataService'
import { BlotterService } from '../types/blotterService'
import { TradesUpdate } from '../types/tradesUpdate'

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

export default function blotterService(connection: Connection, referenceDataService: ReferenceDataService): BlotterService {
  const serviceType = ServiceConst.BlotterServiceKey
  const multicastServiceInstanceDictionaryStream: ConnectableObservable<Observable<any>> = createMulticastDictionaryStream(connection, serviceType)
  const serviceStatusStream: Observable<ServiceStatus> = multicastServiceInstanceDictionaryStream
      .map(cache => createServiceStatus(cache, serviceType))
      .share()
  return {
    serviceStatusStream,
    getTradesStream(): TradesUpdate[] {
      const streamOperation = Observable.create(o => {
        log.debug('Subscribing to trade stream')
        multicastServiceInstanceDictionaryStream.connect()
        const topicName = `topic_${serviceType}_${((Math.random() *
          Math.pow(36, 8)) <<
          0).toString(36)}`
        const operationName = 'getTradesStream';

        (multicastServiceInstanceDictionaryStream as any) // thanks TS, but you shouldn't fail this line
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
                connection
                  .subscribeToTopic(topicName)
                  .subscribe(
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
          );

        (multicastServiceInstanceDictionaryStream as any) // thanks TS, but you shouldn't fail this line
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
