/**
 * Flow Candle Engine — extracted from BOZOK_PRO
 * Builds delta candles from time-bucketed or volume-bucketed trade flow.
 * Each candle captures buy/sell notional, delta, pressure [-100,+100], and strength.
 */

import type { Side } from '../../types'

// ── Types ────────────────────────────────────────────────

export type FlowMode = 'time' | 'volume'

export interface FlowBucket {
  startTs: number
  openPrice: number
  high: number
  low: number
  closePrice: number
  buy: number
  sell: number
  activity: number
  liquidations: number
  absorption: boolean
}

export interface FlowCandle {
  ts: number
  pressureOpen: number
  pressureHigh: number
  pressureLow: number
  pressureClose: number
  buy: number
  sell: number
  delta: number
  activity: number
  strength: number
  priceOpen: number
  priceHigh: number
  priceLow: number
  priceClose: number
  liquidations: number
  absorption: boolean
}

export interface FlowEngineConfig {
  mode: FlowMode
  timeframeMs: number
  volumeTarget: number
  maxCandles: number
}

export interface FlowTrade {
  price: number
  notional: number
  side: Side
  ts: number
}

// ── Utilities ─────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

// ── FlowEngine ────────────────────────────────────────────

export class FlowEngine {
  private candles: FlowCandle[] = []
  private bucket: FlowBucket | null = null
  private config: FlowEngineConfig
  private listeners: Map<string, Set<Function>> = new Map()

  constructor(config?: Partial<FlowEngineConfig>) {
    this.config = {
      mode: 'time',
      timeframeMs: 5000,
      volumeTarget: 1_000_000,
      maxCandles: 80,
      ...config
    }
  }

  /** Subscribe to 'flow:update' events */
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

  /** Feed a normalized trade into the engine. */
  updateBucket(trade: FlowTrade): void {
    const nowTs = Date.now()

    if (!this.bucket) {
      this.startBucket(trade, nowTs)
    }

    const bucket = this.bucket
    if (!bucket) return

    if (this.config.mode === 'time' && nowTs - bucket.startTs >= this.config.timeframeMs) {
      this.closeBucket()
    }
    if (this.bucket && this.config.mode === 'volume' && this.bucket.activity >= this.config.volumeTarget) {
      this.closeBucket()
    }

    if (this.bucket) {
      if (trade.side === 'buy') {
        this.bucket.buy += trade.notional
      } else {
        this.bucket.sell += trade.notional
      }
      this.bucket.activity += trade.notional
      this.bucket.high = Math.max(this.bucket.high, trade.price)
      this.bucket.low = Math.min(this.bucket.low, trade.price)
    }
  }

  /** Called periodically (e.g. every 250ms) to check bucket expiry. */
  tick(lastPrice: number, recentLiquidationCount: number = 0): void {
    if (!this.bucket) return

    this.bucket.closePrice = lastPrice
    this.bucket.liquidations = recentLiquidationCount

    const nowTs = Date.now()
    if (this.config.mode === 'time' && nowTs - this.bucket.startTs >= this.config.timeframeMs) {
      this.closeBucket()
    }
    if (this.config.mode === 'volume' && this.bucket.activity >= this.config.volumeTarget) {
      this.closeBucket()
    }
  }

  private startBucket(trade: FlowTrade, ts: number): void {
    this.bucket = {
      startTs: ts,
      openPrice: trade.price,
      high: trade.price,
      low: trade.price,
      closePrice: trade.price,
      buy: 0,
      sell: 0,
      activity: 0,
      liquidations: 0,
      absorption: false
    }
  }

  private closeBucket(): void {
    if (!this.bucket || this.bucket.activity <= 0) {
      this.bucket = null
      return
    }

    const b = this.bucket
    const delta = b.buy - b.sell
    const pressure = clamp((delta / b.activity) * 100, -100, 100)
    const strength = clamp(Math.abs(delta) / (b.activity || 1) * 100, 0, 100)

    // Absorpsiyon: büyük hacme rağmen fiyat hareket etmiyor
    const priceChange = Math.abs(b.closePrice - b.openPrice) / (b.openPrice || 1)
    const avgActivity = this.candles.length
      ? this.candles.slice(-10).reduce((a, c) => a + c.activity, 0) / Math.min(10, this.candles.length)
      : b.activity
    const absorption = priceChange < 0.0008 && b.activity > avgActivity * 2
    b.absorption = absorption

    const candle: FlowCandle = {
      ts: b.startTs,
      pressureOpen: this.candles.length
        ? this.candles[this.candles.length - 1].pressureClose
        : 0,
      pressureHigh: pressure,
      pressureLow: pressure,
      pressureClose: pressure,
      buy: b.buy,
      sell: b.sell,
      delta,
      activity: b.activity,
      strength,
      priceOpen: b.openPrice,
      priceHigh: b.high,
      priceLow: b.low,
      priceClose: b.closePrice,
      liquidations: b.liquidations,
      absorption
    }

    this.candles.push(candle)
    if (this.candles.length > this.config.maxCandles) {
      this.candles.shift()
    }

    this.emit('flow:update', candle)
    this.bucket = null
  }

  /** Getters */
  getCandles(): FlowCandle[] {
    return this.candles
  }

  getLastCandle(): FlowCandle | null {
    return this.candles.length ? this.candles[this.candles.length - 1] : null
  }

  updateConfig(cfg: Partial<FlowEngineConfig>): void {
    this.config = { ...this.config, ...cfg }
  }

  /** Reset state (e.g. on symbol change). */
  reset(): void {
    this.candles = []
    this.bucket = null
  }
}
