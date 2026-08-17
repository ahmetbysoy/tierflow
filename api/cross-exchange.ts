/**
 * Vercel Edge/Serverless Proxy for Cross-Exchange REST
 * Browser'dan direkt Bybit/OKX/MEXC'e fetch CORS'ta sessizce error'a düşer.
 * Bu proxy Vercel üzerinde çalışıp CORS'u bypass eder.
 * GET /api/cross-exchange?exchange=bybit&symbol=BTCUSDT
 */

export const config = {
  runtime: 'edge'
}

const EXCHANGE_URLS: Record<string, (sym: string) => string> = {
  bybit: (sym) => `https://api.bybit.com/v5/market/tickers?category=linear&symbol=${sym}`,
  okx: (sym) => `https://www.okx.com/api/v5/market/ticker?instId=${sym.replace('USDT', '-USDT-SWAP')}`,
  mexc: (sym) => `https://contract.mexc.com/api/v1/contract/ticker?symbol=${sym}`
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const exchange = url.searchParams.get('exchange') || ''
  const symbol = url.searchParams.get('symbol') || 'BTCUSDT'

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store'
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers })
  }

  if (!EXCHANGE_URLS[exchange]) {
    return new Response(JSON.stringify({ error: 'unsupported exchange', exchange }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } })
  }

  const targetUrl = EXCHANGE_URLS[exchange](symbol)

  try {
    const res = await fetch(targetUrl, { headers: { 'User-Agent': 'tierflow-vercel-proxy/1.0' }, signal: AbortSignal.timeout(4000) })
    const data = await res.json()

    let bid = 0, ask = 0
    if (exchange === 'bybit' && data.result?.list?.[0]) {
      bid = +data.result.list[0].bid1Price
      ask = +data.result.list[0].ask1Price
    } else if (exchange === 'okx' && data.data?.[0]) {
      bid = +data.data[0].bidPx
      ask = +data.data[0].askPx
    } else if (exchange === 'mexc' && data.data) {
      bid = +data.data.buyOne
      ask = +data.data.sellOne
    }

    if (bid && ask) {
      return new Response(JSON.stringify({ exchange, symbol, bid, ask, mid: (bid+ask)/2, ts: Date.now() }), {
        status: 200,
        headers: { ...headers, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ error: 'no bid/ask', raw: data }), { status: 502, headers: { ...headers, 'Content-Type': 'application/json' } })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e), exchange, symbol }), { status: 502, headers: { ...headers, 'Content-Type': 'application/json' } })
  }
}
