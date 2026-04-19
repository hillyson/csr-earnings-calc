const KNOWN_NAMES: Record<string, string> = {}

const cache = new Map<string, string>()
const pending = new Map<string, Promise<string>>()

export function getCachedName(symbol: string): string | undefined {
  return KNOWN_NAMES[symbol] || cache.get(symbol)
}

export async function lookupStockName(symbol: string, market: string): Promise<string> {
  const cached = getCachedName(symbol)
  if (cached) return cached

  const existing = pending.get(symbol)
  if (existing) return existing

  const promise = fetchName(symbol, market).then(name => {
    cache.set(symbol, name)
    pending.delete(symbol)
    return name
  })
  pending.set(symbol, promise)
  return promise
}

async function fetchName(symbol: string, market: string): Promise<string> {
  try {
    if (market === 'SEHK' || market === '-') {
      const code = symbol.padStart(5, '0')
      const resp = await fetch(
        `https://query1.finance.yahoo.com/v1/finance/search?q=${code}.HK&quotesCount=1&newsCount=0`,
      )
      if (resp.ok) {
        const data = await resp.json()
        const quote = data.quotes?.[0]
        if (quote?.shortname || quote?.longname) {
          return quote.shortname || quote.longname
        }
      }
    }

    if (market === 'US') {
      const resp = await fetch(
        `https://query1.finance.yahoo.com/v1/finance/search?q=${symbol}&quotesCount=1&newsCount=0`,
      )
      if (resp.ok) {
        const data = await resp.json()
        const quote = data.quotes?.[0]
        if (quote?.shortname || quote?.longname) {
          return quote.shortname || quote.longname
        }
      }
    }
  } catch {
    // Network errors are expected in offline/restricted environments
  }
  return symbol
}

export async function lookupAllNames(
  symbols: Array<{ symbol: string; market: string }>,
): Promise<Map<string, string>> {
  const unique = new Map<string, string>()
  for (const s of symbols) {
    unique.set(s.symbol, s.market)
  }

  await Promise.allSettled(
    Array.from(unique.entries()).map(([sym, mkt]) => lookupStockName(sym, mkt)),
  )

  const result = new Map<string, string>()
  for (const sym of unique.keys()) {
    result.set(sym, getCachedName(sym) || sym)
  }
  return result
}
