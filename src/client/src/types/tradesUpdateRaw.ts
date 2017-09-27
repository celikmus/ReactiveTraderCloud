import { TradeRaw } from '.'

export interface TradesUpdateRaw {
  readonly IsStateOfTheWorld: boolean
  readonly IsStale: boolean
  readonly Trades: TradeRaw[]
}
