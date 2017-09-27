import { CurrencyPair } from './'

export interface TradeRaw {
  TradeId: number
  TraderName: string
  CurrencyPair: CurrencyPair
  Notional: number
  DealtCurrency: string
  Direction: any
  SpotRate: number
  TradeDate: Date
  ValueDate: Date
  Status: any
}
