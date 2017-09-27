import { CurrencyPair } from './'

export interface CurrencyPairPosition {
  symbol: string
  basePnl: number
  baseTradedAmount: number
  currencyPair: CurrencyPair
  basePnlName: string
  baseTradedAmountName: string
}
