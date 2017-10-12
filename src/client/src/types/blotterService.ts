import { Observable } from 'rxjs/Rx'
import { ServiceStatus } from './serviceStatus'
import { TradesUpdate } from './tradesUpdate'

export interface BlotterService {
  serviceStatusStream: Observable<ServiceStatus>
  getTradesStream: () => TradesUpdate[]
}
