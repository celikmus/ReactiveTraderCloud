import { Observable } from 'rxjs/Rx'
import LastValueObservableDictionary from '../system/service/lastValueObservableDictionary'

export interface ReferenceDataService {
  serviceStatusStream: Observable<Observable<LastValueObservableDictionary>>
  getCurrencyPair: Function
  getCurrencyPairUpdatesStream: Function
}
