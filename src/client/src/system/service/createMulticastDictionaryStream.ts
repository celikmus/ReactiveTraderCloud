import { BehaviorSubject } from 'rxjs/BehaviorSubject'
import LastValueObservableDictionary from './lastValueObservableDictionary'
import { ConnectableObservable, Observable, Scheduler } from 'rxjs'
import { HEARTBEAT_TIMEOUT } from '../../serviceConfigs'
import { ConnectionStatus } from '../../types/connectionStatus'
import { Service } from '../../types/service'

export default function createMulticastDictionaryStream(service: Service): ConnectableObservable<LastValueObservableDictionary> {
  const { connection, serviceType } = service
  const connectionStatus = connection.connectionStatusStream
    .map(status => status === ConnectionStatus.connected)
    .share()

  const errorOnDisconnectStream = connectionStatus
    .filter(isConnected => !isConnected)
    .take(1)
    .flatMap(() => Observable.throw('Underlying connection disconnected'))

  const groupedServiceObservable = connection
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
  const serviceInstanceDictionaryObservable = (groupedServiceObservable as any)
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

  return connectionStatus
    .filter(isConnected => isConnected)
    .take(1)
    // flatMap: since we're just taking one, this effectively just continues the stream by subscribing to serviceInstanceDictionaryStream
    .mergeMap(() => serviceInstanceDictionaryObservable)
    // repeat after disconnects
    .repeat()
    .multicast(
      new BehaviorSubject(new LastValueObservableDictionary())
    ) as ConnectableObservable<LastValueObservableDictionary>
}

