import {
  Trade,
  TradeRaw,
  Direction,
  TradeStatus,
  TradesUpdate,
  TradesUpdateRaw,
  ReferenceDataService
} from '../../types/'

function mapTradesUpdate(
  referenceDataService: ReferenceDataService,
  tradesData: TradesUpdateRaw
): TradesUpdate {
  const receivedTrades = tradesData.Trades
  const trades = receivedTrades.map(trade =>
    mapTrade(referenceDataService, trade)
  )
  return {
    trades,
    isStateOfTheWorld: tradesData.IsStateOfTheWorld,
    isStale: tradesData.IsStale
  }
}

function mapTrade(
  referenceDataService: ReferenceDataService,
  trade: TradeRaw
): Trade {
  const direction = mapDirection(trade.Direction)
  const status = mapTradeStatus(trade.Status)
  const currencyPair = referenceDataService.getCurrencyPair(trade.CurrencyPair)

  return {
    status,
    direction,
    currencyPair,
    tradeId: trade.TradeId,
    traderName: trade.TraderName,
    notional: trade.Notional,
    dealtCurrency: trade.DealtCurrency,
    spotRate: trade.SpotRate,
    tradeDate: new Date(trade.TradeDate),
    valueDate: new Date(trade.ValueDate)
  }
}

function mapDirection(direction: string) {
  switch (direction) {
    case Direction.Buy:
      return Direction.Buy
    case Direction.Sell:
      return Direction.Sell
    default:
      throw new Error(`Unknown direction ${direction}`)
  }
}

function mapTradeStatus(status: string) {
  switch (status.toLowerCase()) {
    case TradeStatus.Pending:
      return TradeStatus.Pending
    case TradeStatus.Done:
      return TradeStatus.Done
    case TradeStatus.Rejected:
      return TradeStatus.Rejected
    default:
      throw new Error(`Unknown trade status ${status}`)
  }
}

export default {
  mapTradesUpdate,
  mapTrade
}
