import { Observable } from 'rxjs/Observable'
import { cold, expectObservable, getGlobalTestScheduler } from '../../test-utils/marble-testing'
import '../../system/service/serviceObservableExtensions'

let globalTestScheduler

describe('DebounceOnMissedHeartbeat', () => {

  beforeEach(() => {
    globalTestScheduler = getGlobalTestScheduler()
  })

  test('should add debounce on missed heartbeat to each individual service', () => {
    const MOCKED_OBSERVABLE = 'mockedObservable'
    const delayInMillis: number = 10
    const itemSelector: Function = (key) => key
    const innerObservable = { debounceWithSelector: (dueTime, itemSelector, scheduler) => MOCKED_OBSERVABLE }
    const innerObservableSpy = jest.spyOn(innerObservable, 'debounceWithSelector')

    const source = cold('---a---a---a|', { a: innerObservable })
    const expected = '---b---b---b|'

    const testing = source.debounceOnMissedHeartbeat(delayInMillis, itemSelector, globalTestScheduler)

    expectObservable(testing).toBe(expected, { b: MOCKED_OBSERVABLE })
    globalTestScheduler.flush()
    expect(innerObservableSpy).toHaveBeenCalledTimes(3)
  })
})

describe('getServiceWithMinLoad', () => {
  const sampleLastValueObservableDictionary = {
    values: {
      'analytics.5348': {
        latestValue: {
          serviceType: 'analytics',
          serviceId: 'analytics.5348',
          serviceLoad: 0,
          isConnected: false
        },
        stream: Observable.interval(10, globalTestScheduler).take(1)
      },
      'reference.5348': {
        latestValue: {
          serviceType: 'reference',
          serviceId: 'reference.5348',
          serviceLoad: 0.5,
          isConnected: true
        },
        stream: Observable.interval(10, globalTestScheduler).take(1)
      },
      'pricing.5348': {
        latestValue: {
          serviceType: 'pricing',
          serviceId: 'pricing.5348',
          serviceLoad: 0.1,
          isConnected: true
        },
        stream: Observable.interval(10, globalTestScheduler).take(1)
      }
    },
    version: 1
  }

  beforeEach(() => {
    globalTestScheduler = getGlobalTestScheduler()
  })

  test('should get LastValue of the least loaded service', () => {
    const source = cold('--a----|', { a: sampleLastValueObservableDictionary })
    const expected = '--m----'
    const expectedLastValue = {
      serviceType: 'pricing',
      serviceId: 'pricing.5348',
      serviceLoad: 0.1,
      isConnected: true
    }

    const testing = source.getServiceWithMinLoad()
    expectObservable(testing).toBe(expected, { m: expectedLastValue })

    globalTestScheduler.flush()
  })

  test('should throw error if no service is available and wait flag is false', (done) => {
    const source = cold('--a----|')
    const expected = 'Error: No service available'
    let result = ''
    source.getServiceWithMinLoad(false).subscribe(
      () => null,
      (e) => {
        result = e.toString()
        done()
      },
      c => null)

    globalTestScheduler.flush()
    expect(result).toBe(expected)
  })
})

describe('Debounce with selector', () => {

  beforeEach(() => {
    globalTestScheduler = getGlobalTestScheduler()
  })

  const delayInMillis: number = 10
  const itemSelector: Function = () => 'v'

  test('should emit item created by calling itemSelector after delay as soon as subscribed as well as for each ' +
    'other item emitted from the original source thereafter', () => {
    const source = cold('---a---b---c|')
    const expected = '-v-av--bv--c|'

    const testing = source.refactoredDebounceWithSelector(delayInMillis, itemSelector, globalTestScheduler)
    expectObservable(testing).toBe(expected)

    globalTestScheduler.flush()
  })
})
