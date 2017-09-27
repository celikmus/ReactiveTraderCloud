import {
  CurrencyPair,
  CurrencyPairUpdate,
  CurrencyPairUpdates,
  CurrencyPairUpdateRaw,
  CurrencyPairUpdatesRaw,
  UpdateType
} from '../../types'

function mapCurrencyPairs(
  currencyPairUpdates: CurrencyPairUpdatesRaw
): CurrencyPairUpdates {
  const updates = mapUpdates(currencyPairUpdates.Updates)
  return {
    isStateOfTheWorld: currencyPairUpdates.IsStateOfTheWorld,
    isStale: currencyPairUpdates.IsStale,
    currencyPairUpdates: updates
  }
}

function mapUpdates(
  currencyPairUpdates: CurrencyPairUpdateRaw[]
): CurrencyPairUpdate[] {
  return currencyPairUpdates.map(update => {
    const updateType = mapUpdateType(update.UpdateType)
    const currencyPair = createCurrencyPair(
      update.CurrencyPair.Symbol,
      update.CurrencyPair.RatePrecision,
      update.CurrencyPair.PipsPosition
    )

    return {
      currencyPair,
      updateType
    }
  })
}

function mapUpdateType(updateTypeString: string): UpdateType {
  if (updateTypeString === UpdateType.Added) {
    return UpdateType.Added
  } else if (updateTypeString === UpdateType.Removed) {
    return UpdateType.Removed
  } else {
    throw new Error(`Unknown update type [${updateTypeString}]`)
  }
}

function createCurrencyPair(symbol, ratePrecision, pipsPosition): CurrencyPair {
  return {
    symbol,
    ratePrecision,
    pipsPosition,
    base: symbol.substr(0, 3),
    terms: symbol.substr(3, 3)
  }
}

export default {
  mapCurrencyPairs
}
