import {
  CurrencyPairPosition,
  CurrencyPairPositionRaw,
  HistoricPosition,
  HistoricPositionRaw,
  PositionUpdates,
  PositionUpdatesRaw,
  ReferenceDataService
} from '../../types'

function mapToTransport(
  ccyPairPosition: CurrencyPairPosition
): CurrencyPairPositionRaw {
  return {
    Symbol: ccyPairPosition.symbol,
    BasePnl: ccyPairPosition.basePnl,
    BaseTradedAmount: ccyPairPosition.baseTradedAmount
  }
}

function mapPositionUpdate(
  referenceDataService: ReferenceDataService,
  positionData: PositionUpdatesRaw
): PositionUpdates {
  const positions = mapCurrentPositions(
    referenceDataService,
    positionData.CurrentPositions
  )
  const history = mapHistoricPosition(positionData.History)
  return {
    history,
    currentPositions: positions
  }
}

function mapCurrentPositions(
  referenceDataService: ReferenceDataService,
  currentPositions: CurrencyPairPositionRaw[]
): CurrencyPairPosition[] {
  return currentPositions.map(currentPosition => {
    return {
      symbol: currentPosition.Symbol,
      basePnl: currentPosition.BasePnl,
      baseTradedAmount: currentPosition.BaseTradedAmount,
      currencyPair: referenceDataService.getCurrencyPair(
        currentPosition.Symbol
      ),
      basePnlName: 'basePnl',
      baseTradedAmountName: 'baseTradedAmount'
    }
  })
}

function mapHistoricPosition(
  historicPositions: HistoricPositionRaw[]
): HistoricPosition[] {
  return historicPositions.map(historicPosition => ({
    timestamp: new Date(historicPosition.Timestamp),
    usdPnl: historicPosition.UsdPnl
  }))
}

export default {
  mapPositionUpdate,
  mapToTransport
}
