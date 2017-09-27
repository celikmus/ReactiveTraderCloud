import { CurrencyPairUpdateRaw } from '.'

export interface CurrencyPairUpdatesRaw {
  IsStateOfTheWorld: boolean
  IsStale: boolean
  Updates: CurrencyPairUpdateRaw[]
}
