import { CurrencyPairPositionRaw, HistoricPositionRaw } from '.'

export interface PositionUpdatesRaw {
  CurrentPositions: CurrencyPairPositionRaw[]
  History: HistoricPositionRaw[]
}
