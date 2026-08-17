/**
 * Cross-Exchange Polling — extracted from BOZOK_PRO
 * Polls Binance, Bybit, OKX, MEXC for bid/ask every N seconds.
 * Provides arbitrage spread and cross-exchange liquidity context.
 */

// ── Types ────────────────────────────────────────────────

export type ExchangeId = 'binance' | 'bybit' | 'okx' | 'mexc'
export type ExchangeStatus = 'disconnected' | 'live' | 'error'

export interface ExchangeQuote {
  bid: number
  ask: number
  mid: number
  ts: number
  status: ExchangeStatus
}

export interface CrossExchangeState {
  binance: ExchangeQuote
  bybit: ExchangeQuote
  okx: ExchangeQuote
  mexc: ExchangeQuote
}

export interface CrossExchangeConfig {
  /** Poll interval in ms */
  intervalMs: number
  /** Request timeout in ms */
  timeoutMs: number
  /** Which exchanges to poll */
  enabled: ExchangeId[]
}

// ── CrossExchangePoller ───────────────────────────────────

export class CrossExchangePoller {
  private state: CrossExchangeState
  private config: CrossExchangeConfig
  private timer: ReturnType<typeof setInterval> | null = null
  private listeners: Map<string, Set<Function>> = new Map()
  private symbol = 'BTCUSDT'

  constructor(config?: Partial<CrossExchangeConfig>) {
    this.config = {
      intervalMs: 3000,
      timeoutMs: 5000,
      enabled: ['bybit', 'okx', 'mexc'],
      ...config
    }
    this.state = {
      binance: { bid: 0, ask: 0, mid: 0, ts: 0, status: 'disconnected' },
      bybit: { bid: 0, ask: 0, mid: 0, ts: 0, status: 'disconnected' },
      okx: { bid: 0, ask: 0, mid: 0, ts: 0, status: 'disconnected' },
      mexc: { bid: 0, ask: 0, mid: 0, ts: 0, status: 'disconnected' }
    }
  }

  on(event: string, fn: Function): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    this.listeners.get(event)!.add(fn)
    return () => this.listeners.get(event)?.delete(fn)
  }

  private emit(event: string, data?: unknown): void {
    const set = this.listeners.get(event)
    if (!set) return
    for (const fn of [...set]) {
      try { fn(data) } catch (e) { console.error(e) }
    }
  }

  /** Start polling for the given symbol. */
  start(symbol: string): void {
    this.stop()
    this.symbol = symbol
    this.tick() // immediate first poll
    this.timer = setInterval(() => this.tick(), this.config.intervalMs)
  }

  /** Stop polling. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  private async tick(): Promise<void> {
    const promises = this.config.enabled.map(key =>
      this.pollExchange(key).catch(() => {
        this.state[key].status = 'error'
      })
    )
    await Promise.allSettled(promises)
    this.emit('crossExchange:update', this.state)
  }

  private async pollExchange(key: ExchangeId): Promise<void> {
    // Önce Vercel proxy'yi dene (CORS bypass), olmazsa direkt fetch'e fallback
    const proxyUrl = `/api/cross-exchange?exchange=${key}&symbol=${this.symbol}`
    try {
      const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(this.config.timeoutMs) })
      if (res.ok) {
        const data = await res.json()
        if (data.bid && data.ask) {
          this.state[key] = {
            bid: +data.bid,
            ask: +data.ask,
            mid: ( +data.bid + +data.ask) / 2,
            ts: Date.now(),
            status: 'live'
          }
          return
        }
      }
    } catch {}
    // Fallback: direkt borsa REST (bazı borsalar CORS verir, bazıları vermez)
    try {
      const url = this.buildUrl(key)
      if (!url) return
      const res = await fetch(url, { signal: AbortSignal.timeout(this.config.timeoutMs) })
      const data = await res.json()
      let bid = 0
      let ask = 0

      if (key === 'bybit' && data.result?.list?.[0]) {
        bid = +data.result.list[0].bid1Price
        ask = +data.result.list[0].ask1Price
      } else if (key === 'okx' && data.data?.[0]) {
        bid = +data.data[0].bidPx
        ask = +data.data[0].askPx
      } else if (key === 'mexc' && data.data) {
        bid = +data.data.buyOne
        ask = +data.data.sellOne
      }

      if (bid && ask) {
        this.state[key] = {
          bid,
          ask,
          mid: (bid + ask) / 2,
          ts: Date.now(),
          status: 'live'
        }
        return
      }
    } catch {}
    // Her iki yol da başarısız ise error
    this.state[key].status = 'error'
  }

  private buildUrl(key: ExchangeId): string {
    const sym = this.symbol
    switch (key) {
      case 'bybit':
        return `https://api.bybit.com/v5/market/tickers?category=linear&symbol=${sym}`
      case 'okx':
        return `https://www.okx.com/api/v5/market/ticker?instId=${sym.replace('USDT', '-USDT-SWAP')}`
      case 'mexc':
        return `https://contract.mexc.com/api/v1/contract/ticker?symbol=${sym}`
      default:
        return ''
    }
  }

  /** Getters */
  getState(): CrossExchangeState {
    return this.state
  }

  /** Compute max arbitrage spread across all live exchanges. */
  getMaxSpread(): { spread: number; high: ExchangeId | null; low: ExchangeId | null } {
    let high: ExchangeId | null = null
    let low: ExchangeId | null = null
    let maxSpread = 0

    const keys: ExchangeId[] = ['binance', 'bybit', 'okx', 'mexc']
    for (const k of keys) {
      if (this.state[k].status !== 'live') continue
      if (!high || this.state[k].ask > this.state[high].ask) high = k
      if (!low || this.state[k].bid < this.state[low].bid) low = k
    }

    if (high && low) {
      maxSpread = this.state[high].ask - this.state[low].bid
    }

    return { spread: maxSpread, high, low }
  }

  updateConfig(cfg: Partial<CrossExchangeConfig>): void {
    this.config = { ...this.config, ...cfg }
    // Restart timer if interval changed
    if (this.timer && cfg.intervalMs) {
      this.start(this.symbol)
    }
  }

  /** Reset state. */
  reset(): void {
    this.stop()
    this.state = {
      binance: { bid: 0, ask: 0, mid: 0, ts: 0, status: 'disconnected' },
      bybit: { bid: 0, ask: 0, mid: 0, ts: 0, status: 'disconnected' },
      okx: { bid: 0, ask: 0, mid: 0, ts: 0, status: 'disconnected' },
      mexc: { bid: 0, ask: 0, mid: 0, ts: 0, status: 'disconnected' }
    }
  }
}
