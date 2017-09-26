import { Observable, Scheduler } from 'rxjs/Rx'
import { TradeMapper } from './mappers'
import { streamify } from '../system/service'
import { logger, RetryPolicy } from '../system'
import '../system/observableExtensions/retryPolicyExt'
import { ServiceConst } from '../types'

const log = logger.create('BlotterService')

export default function blotterService(connection, referenceDataService) {
  const service = {
    connection,
    serviceType: ServiceConst.BlotterServiceKey
  }
  const serviceClient = streamify(service)
  return {
    ...serviceClient,
    getTradesStream() {
      const tradeMapper = new TradeMapper(referenceDataService)
      return Observable.create(o => {
        log.debug('Subscribing to trade stream')
        return serviceClient
          .createStreamOperation('getTradesStream', {})
          .retryWithPolicy(
            RetryPolicy.backoffTo10SecondsMax,
            'getTradesStream',
            Scheduler.async
          )
          .map(dto => tradeMapper.mapFromDto(dto))
          .subscribe(o)
      })
    }
  }
}
