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
import LastValueObservableDictionary from '../system/service/lastValueObservableDictionary'
import { Service } from '../types/service'

const log = logger.create('BlotterService')

function createServiceStatus(cache: LastValueObservableDictionary, serviceType: string): ServiceStatus {
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
  const service: Service = { connection, serviceType }
  const multicastServiceInstanceDictionaryStream: ConnectableObservable<LastValueObservableDictionary> = createMulticastDictionaryStream(service)
  const serviceStatusStream: Observable<ServiceStatus> = multicastServiceInstanceDictionaryStream
    .map(cache => createServiceStatus(cache, serviceType))
    .share()
  return {
    serviceStatusStream,
    getTradesStream(): TradesUpdate[] {
      log.debug('Subscribing to trade stream')
      multicastServiceInstanceDictionaryStream.connect()
      const topicName = `topic_${serviceType}_${((Math.random() *
        Math.pow(36, 8)) <<
        0).toString(36)}`
      const operationName = 'getTradesStream'

      return (multicastServiceInstanceDictionaryStream as any)
        .getServiceWithMinLoad()
        .mergeMap(serviceInstanceStatus => {
          if (!serviceInstanceStatus.isConnected) {
            throw new Error('Service instance is disconnected for stream operation')
          }
          log.debug(`Will use service instance [${serviceInstanceStatus.serviceId}] for stream operation [${operationName}]. IsConnected: [${serviceInstanceStatus.isConnected}]`)
          const remoteProcedure = `${serviceInstanceStatus.serviceId}.${operationName}`
          return Observable.merge(
            connection.subscribeToTopic(topicName),
            connection.requestResponse(remoteProcedure, {}, topicName).do(() => log.debug(
              `Ack received for RPC hookup as part of stream operation [${operationName}]`
            )).ignoreElements()
          )
        })
        .retryWithPolicy(
          RetryPolicy.backoffTo10SecondsMax,
          'getTradesStream',
          Scheduler.async
        )
        .map(dto => TradeMapper.mapTradesUpdate(referenceDataService, dto))
    }
  }
}
