import { cold, expectObservable, getGlobalTestScheduler } from "../../test-utils/marble-testing";
import '../../system/service/serviceObservableExtensions'

let globalTestScheduler

describe('DebounceOnMissedHeartbeat', () => {

  beforeEach(() => {
    globalTestScheduler = getGlobalTestScheduler()
  })

  test('should add debounce on missed heartbeat to each individual service', () => {
    const MOCKED_OBSERVABLE = 'mockedObservable';
    const delayInMillis: number = 10
    const itemSelector: Function = (key) => key
    const innerObservable = { debounceWithSelector: (dueTime, itemSelector, scheduler) => MOCKED_OBSERVABLE }
    const innerObservableSpy = jest.spyOn(innerObservable, 'debounceWithSelector')

    const source = cold('---a---a---a|', { a: innerObservable })
    const expected =    '---b---b---b|'

    const testing = source.debounceOnMissedHeartbeat(delayInMillis, itemSelector, globalTestScheduler)

    expectObservable(testing).toBe(expected, { b: MOCKED_OBSERVABLE})
    globalTestScheduler.flush()
    expect(innerObservableSpy).toHaveBeenCalledTimes(3)
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
    const expected =    '-v-av--bv--c|'

    const testing = source.refactoredDebounceWithSelector(delayInMillis, itemSelector, globalTestScheduler)
    expectObservable(testing).toBe(expected)

    globalTestScheduler.flush()
  })
})
