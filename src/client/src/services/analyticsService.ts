import { Observable, Scheduler } from 'rxjs/Rx'
import { streamify } from '../system/service'
import { PositionsMapper } from './mappers'
import { Guard, logger, RetryPolicy } from '../system'
import '../system/observableExtensions/retryPolicyExt'
import { ServiceConst } from '../types'

const log = logger.create('AnalyticsService')

export default function analyticsService(
  connection,
  referenceDataService
): Object {
  const service = {
    connection,
    serviceType: ServiceConst.AnalyticsServiceKey
  }
  const serviceClient = streamify(service)
  return {
    get serviceStatusStream() {
      return serviceClient.serviceStatusStream
    },
    getAnalyticsStream(analyticsRequest) {
      Guard.isDefined(analyticsRequest, 'analyticsRequest required')
      return Observable.create(o => {
        log.debug('Subscribing to analytics stream')

        return serviceClient
          .createStreamOperation('getAnalytics', analyticsRequest)
          .retryWithPolicy(
            RetryPolicy.backoffTo10SecondsMax,
            'getAnalytics',
            Scheduler.async
          )
          .map(dto =>
            PositionsMapper.mapPositionUpdate(referenceDataService, dto)
          )
          .subscribe(o)
      })
    }
  }
}
