import * as _ from 'lodash'
import { createAction } from 'redux-actions'

import { regionsSettings } from '../../regions/regionsOperations'
import { ACTION_TYPES as REF_ACTION_TYPES } from '../../referenceOperations'

export const ACTION_TYPES = {
  BLOTTER_SERVICE: '@ReactiveTraderCloud/BLOTTER_SERVICE'
}

export const fetchBlotter = createAction(ACTION_TYPES.BLOTTER_SERVICE)

export const blotterServiceEpic = blotterService$ => action$ => {
  return action$
    .ofType(REF_ACTION_TYPES.REFERENCE_SERVICE)
    .do(x => {
      debugger
      console.log(`action in epic: ${JSON.stringify(x)}`)
    })
    .flatMapTo(blotterService$.getTradesStream())
    .do(x => console.log(`In the epic here: ${JSON.stringify(x)}`))
    .map(fetchBlotter)
    .do(x =>
      console.log(`In the epic, post fetchBlotter: ${JSON.stringify(x)}`)
    )
}

export const blotterRegionsSettings = regionsSettings(
  'Blotter',
  850,
  250,
  false
)

export const blotterServiceReducer = (state: any = {}, action) => {
  switch (action.type) {
    case ACTION_TYPES.BLOTTER_SERVICE:
      const newState = state
      const payloadTrades = action.payload.trades

      // removing the existing key for a single trade
      if (payloadTrades.length === 1) {
        const tradeKey = payloadTrades[0]['tradeId']
        if (state.trades[tradeKey]) {
          newState.trades = _.omit(state.trades, tradeKey)
        }
      }
      const trades = _.mapKeys(_.values(payloadTrades), 'tradeId')
      return {
        trades: { ...trades, ...newState.trades }
      }
    default:
      return state
  }
}
