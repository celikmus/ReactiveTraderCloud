import { Observable } from 'rxjs/Observable'
import { cold, expectObservable, getGlobalTestScheduler } from '../../test-utils/marble-testing'
import '../../system/service/serviceObservableExtensions'
import * as _ from 'lodash'
import LastValueObservable from "./lastValueObservable";
import LastValueObservableDictionary from "./lastValueObservableDictionary";

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

    const testing = source.refactoredDebounceOnMissedHeartbeat(delayInMillis, itemSelector, globalTestScheduler)

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

describe('DistinctUntilChangedGroup', () => {

  beforeEach(() => {
    globalTestScheduler = getGlobalTestScheduler()
  })

  test('should apply distincUntilChanged semantics to an observable of observables', () => {

    const comparisonFunction = (item1, item2) => item1 === item2
    const observableWithDuplicatedConsegutiveValues = cold('1122211')
    const source = cold('---a---a---', { a: observableWithDuplicatedConsegutiveValues })
    const expected = '---b---b---'
    const expectedInnerObservable = cold('1-2--1-')
    const testing = source.refactoredDistinctUntilChangedGroup(comparisonFunction)
    expectObservable(testing).toBe(expected, { b: expectedInnerObservable })

    globalTestScheduler.flush()
  })
})


describe('toServiceStatusObservableDictionary', () => {
  beforeEach(() => {
    globalTestScheduler = getGlobalTestScheduler()
  })

  test('should flatten given observables stream as dictionary stream', () => {
    const keySelector: Function = obj => obj.serviceId
    const innerSourceItem = {
      serviceType: 'reference',
      serviceId: 'reference.4958',
      serviceLoad: 0.04,
      isConnected: true
    }
    const innerSourceStream = cold('a', { a: innerSourceItem })
    const latestValueObservable = new LastValueObservable(innerSourceStream, innerSourceItem)
    const expectedOutputDictionary = new LastValueObservableDictionary()
    expectedOutputDictionary.add(keySelector(innerSourceItem), latestValueObservable)
    const expectedOutputDictionaryStream = cold('e', { e: expectedOutputDictionary })

    const source = cold('--b----', { b: innerSourceStream })
    const expected = '--m'

    const testing = source.toServiceStatusObservableDictionary(keySelector)
    expectObservable(testing).toBe(expected, { m: expectedOutputDictionaryStream })

    globalTestScheduler.flush()
  })
})
