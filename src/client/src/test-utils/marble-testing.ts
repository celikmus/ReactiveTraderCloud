import { TestScheduler } from "rxjs/Rx";
import { observableMatcher } from "./marble-assert";
import { HotObservable } from "rxjs/testing/HotObservable";
import { ColdObservable } from "rxjs/testing/ColdObservable";
import { Observable } from "rxjs/Observable";
import { SubscriptionLog } from "rxjs/testing/SubscriptionLog";
import { observableToBeFn, subscriptionLogsToBeFn } from "rxjs/testing/TestScheduler";

let globalTestScheduler = new TestScheduler(observableMatcher)

export function getGlobalTestScheduler() {
  return globalTestScheduler = new TestScheduler(observableMatcher)
}

export function hot(marbles: string, values?: any, error?: any): HotObservable<any> {
  if (!globalTestScheduler) {
    throw 'tried to use hot() in async test';
  }
  return globalTestScheduler.createHotObservable.apply(globalTestScheduler, arguments);
}

export function cold(marbles: string, values?: any, error?: any): ColdObservable<any> {
  if (!globalTestScheduler) {
    throw 'tried to use cold() in async test';
  }
  return globalTestScheduler.createColdObservable.apply(globalTestScheduler, arguments);
}

export function expectObservable(observable: Observable<any>,
                                 unsubscriptionMarbles: string = null): ({ toBe: observableToBeFn }) {
  if (!globalTestScheduler) {
    throw 'tried to use expectObservable() in async test';
  }
  return globalTestScheduler.expectObservable.apply(globalTestScheduler, arguments);
}

export function expectSubscriptions(actualSubscriptionLogs: SubscriptionLog[]): ({ toBe: subscriptionLogsToBeFn }) {
  if (!globalTestScheduler) {
    throw 'tried to use expectSubscriptions() in async test';
  }
  return globalTestScheduler.expectSubscriptions.apply(globalTestScheduler, arguments);
}

export function time(marbles: string): number {
  if (!globalTestScheduler) {
    throw 'tried to use time() in async test';
  }
  return globalTestScheduler.createTime.apply(globalTestScheduler, arguments);
}
