import { cold, expectObservable, globalTestScheduler } from "../../test-utils/marble-testing";
import '../../system/service/serviceObservableExtensions'

describe('Debounce with selector', () => {

  const delayInMillis = 10
  const itemCreator = () => 'v'

  test('should delay the item emitted by source observable by dueTime', () => {
    const source = cold('---a---b---c|')
    const expected =           '-v-av--bv--c|'

    const testing = source.refactoredDebounceWithSelector(delayInMillis, itemCreator, globalTestScheduler)
    expectObservable(testing).toBe(expected)

    globalTestScheduler.flush()
  })
})
