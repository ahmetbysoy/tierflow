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
  volumeAtPrice: Map<string, { price: number; buyVol: number; sellVol: number }>
}

export interface VolumeAtPrice {
  price: number
  buyVol: number
  sellVol: number
  delta: number
  total: number
  buyNotional: number
  sellNotional: number
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
  volumeProfile: VolumeAtPrice[]
  pocPrice: number
  absorptionLevels: VolumeAtPrice[]
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

function getTickSize(price: number): number {
  if (price >= 10000) return 0.1
  if (price >= 1000) return 0.1
  if (price >= 100) return 0.01
  if (price >= 10) return 0.01
  if (price >= 1) return 0.001
  if (price >= 0.1) return 0.0001
  if (price >= 0.01) return 0.00001
  if (price >= 0.001) return 0.000001
  return 0.0000001
}

function bucketPrice(price: number): number {
  const tick = getTickSize(price)
  return Math.round(price / tick) * tick
}

function priceToKey(price: number): string {
  const tick = getTickSize(price)
  const decimals = Math.max(0, -Math.log10(tick))
  return price.toFixed(decimals)
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
      // Volume at Price (footprint) - tick bucketed
      const key = priceToKey(bucketPrice(trade.price))
      const existing = this.bucket.volumeAtPrice.get(key)
      if (existing) {
        if (trade.side === 'buy') existing.buyVol += trade.notional
        else existing.sellVol += trade.notional
      } else {
        this.bucket.volumeAtPrice.set(key, {
          price: bucketPrice(trade.price),
          buyVol: trade.side === 'buy' ? trade.notional : 0,
          sellVol: trade.side === 'sell' ? trade.notional : 0
        })
      }
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
      absorption: false,
      volumeAtPrice: new Map()
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

    // Volume Profile (footprint) - her fiyat seviyesinde delta
    const volumeProfile: VolumeAtPrice[] = Array.from(b.volumeAtPrice.entries()).map(([key, v]) => {
      const buyNotional = v.buyVol
      const sellNotional = v.sellVol
      return {
        price: v.price,
        buyVol: v.buyVol,
        sellVol: v.sellVol,
        delta: v.buyVol - v.sellVol,
        total: v.buyVol + v.sellVol,
        buyNotional,
        sellNotional
      }
    }).sort((a, b) => b.price - a.price)

    // POC (Point of Control) - en yüksek hacimli fiyat
    let pocPrice = b.openPrice
    let maxTotal = 0
    for (const vp of volumeProfile) {
      if (vp.total > maxTotal) {
        maxTotal = vp.total
        pocPrice = vp.price
      }
    }

    // Delta Absorption seviyeleri: bir tarafta 3x hacim ama fiyat kırılmıyor
    const absorptionLevels: VolumeAtPrice[] = volumeProfile.filter(vp => {
      const ratio = vp.sellVol > 0 && vp.buyVol > 0 ? Math.max(vp.sellVol / vp.buyVol, vp.buyVol / vp.sellVol) : 0
      return ratio >= 3 && vp.total > avgActivity * 0.3
    })

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
      absorption,
      volumeProfile,
      pocPrice,
      absorptionLevels
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
