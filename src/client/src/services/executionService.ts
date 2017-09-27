import { Observable, Subscription, Scheduler } from 'rxjs/Rx'
import {
  createExecuteTradeResponse,
  createExecuteTradeResponseForError
} from '../types/executeTradeResponse'
import { TradeMapper } from './mappers'
import { logger } from '../system'
import { streamify } from '../system/service'
import { ServiceConst } from '../types'

const log = logger.create('ExecutionService')
const EXECUTION_CLIENT_TIMEOUT_MS = 2000
const EXECUTION_REQUEST_TIMEOUT_MS = 30000

export default function executionService(
  connection,
  referenceDataService,
  openFin
): Object {
  const service = {
    connection,
    serviceType: ServiceConst.ExecutionServiceKey
  }
  const serviceClient = streamify(service)
  return {
    serviceStatusStream: serviceClient.serviceStatusStream,
    executeTrade(executeTradeRequest) {
      return Observable.create(o => {
        log.info('executing: ', executeTradeRequest)
        const disposables = new Subscription()

        disposables.add(
          openFin
            .checkLimit(
              executeTradeRequest.SpotRate,
              executeTradeRequest.Notional,
              executeTradeRequest.CurrencyPair
            )
            .take(1)
            .subscribe(limitCheckResult => {
              if (limitCheckResult) {
                const request = serviceClient
                  .createRequestResponseOperation(
                    'executeTrade',
                    executeTradeRequest
                  )
                  .publish()
                  .refCount()
                disposables.add(
                  Observable.merge(
                    request
                      .map(dto => {
                        const trade = TradeMapper.mapTrade(
                          referenceDataService,
                          dto.Trade
                        )
                        log.info(
                          `execute response received for: ${executeTradeRequest}. Status: ${trade.status}`,
                          dto
                        )
                        return createExecuteTradeResponse(trade)
                      })
                      // if we never receive a response, mark request as complete
                      .timeout(
                        EXECUTION_REQUEST_TIMEOUT_MS,
                        Scheduler.asap.schedule(() =>
                          createExecuteTradeResponseForError(
                            'Trade execution timeout exceeded',
                            executeTradeRequest
                          )
                        )
                      ),
                    // show timeout error if request is taking longer than expected
                    Observable.timer(EXECUTION_CLIENT_TIMEOUT_MS)
                      .map(() =>
                        createExecuteTradeResponseForError(
                          'Trade execution timeout exceeded',
                          executeTradeRequest
                        )
                      )
                      .takeUntil(request)
                  ).subscribe(o)
                )
              } else {
                o.next(
                  createExecuteTradeResponseForError(
                    'Credit limit exceeded',
                    executeTradeRequest
                  )
                )
              }
            })
        )
        return disposables
      })
    }
  }
}
