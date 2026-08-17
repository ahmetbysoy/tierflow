/**
 * Trade Plan Generator & Micro Position Optimizer — extracted from BOZOK_PRO
 * Converts confluence signals into actionable trade plans with Entry/SL/TP/RR.
 * Includes Kelly criterion micro-optimizer for position sizing.
 */

import type { Signal } from '../../types'
import type { BookLevel } from '../book/orderBookDiff'

// ── Types ────────────────────────────────────────────────

export type PlanDirection = 'LONG' | 'SHORT' | 'NEUTRAL'
export type SignalBias = 'bullish' | 'bearish' | 'warning'

export interface MicroSignal {
  id: string
  type: string
  bias: SignalBias
  confidence: number
  description: string
  price: number
  evidence: Record<string, unknown>
  ts: number
  decay: number
  expiresAt: number
}

export interface TradePlan {
  direction: PlanDirection
  confidence: number
  entry?: number
  stop?: number
  tp1?: number
  tp2?: number
  rr?: number
  ts: number
  reason?: string
  walls?: { strongWallBid?: WallEntry; strongWallAsk?: WallEntry }
}

export interface PositionSize {
  riskPct: number
  qty: number
  notional: number
  margin: number
  leverage: number
  fee: number
  breakEven: number
  liqPrice: number
  maxRiskUSD: number
  rr: number
}

export interface WallEntry {
  price: number
  qty: number
  notional: number
  persistence: number
}

export interface TradePlanConfig {
  minRR: number
  kellyFraction: number
  balance: number
  riskPct: number
  maxLeverage: number
  feeRateBps: number
  minConfidence: number
}

// ── Utilities ─────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

function mean(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
}

// ── TradePlanGenerator ────────────────────────────────────

export class TradePlanGenerator {
  private signals: MicroSignal[] = []
  private plan: TradePlan | null = null
  private positionSize: PositionSize | null = null
  private config: TradePlanConfig
  private listeners: Map<string, Set<Function>> = new Map()
  private signalIdCounter = 0

  constructor(config?: Partial<TradePlanConfig>) {
    this.config = {
      minRR: 2.5,
      kellyFraction: 0.35,
      balance: 1000,
      riskPct: 2,
      maxLeverage: 20,
      feeRateBps: 4,
      minConfidence: 60,
      ...config
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

  /** Add a microstructure signal from the detector suite. */
  addSignal(sig: Omit<MicroSignal, 'id' | 'ts' | 'decay' | 'expiresAt'>): void {
    const ts = Date.now()

    // Dedup: same type within 10s and < 0.05% price distance
    const dedup = this.signals.find(
      s => s.type === sig.type
        && ts - s.ts < 10_000
        && Math.abs((s.price || 0) - (sig.price || 0)) / ((sig.price || 1)) < 0.0005
    )
    if (dedup) return

    const signal: MicroSignal = {
      ...sig,
      id: `sig_${++this.signalIdCounter}_${ts}`,
      ts,
      decay: 1,
      expiresAt: ts + 60_000
    }

    this.signals.unshift(signal)
    if (this.signals.length > 100) this.signals.pop()

    this.emit('signal:updated', signal)
  }

  /** Score all recent signals into bull/bear aggregates. */
  scoreSignals(): { bull: number; bear: number; warning: number; recent: MicroSignal[] } {
    const ts = Date.now()
    const recent = this.signals.filter(s => ts - s.ts < 30_000)
    let bull = 0
    let bear = 0
    let warning = 0
    for (const s of recent) {
      const w = s.confidence * (s.decay || 1)
      if (s.bias === 'bullish') bull += w
      else if (s.bias === 'bearish') bear += w
      else warning += w * 0.5
    }
    return { bull, bear, warning, recent }
  }

  /** Generate a trade plan from current signal confluence. */
  generateTradePlan(
    price: number,
    spread: number,
    walls?: { bid: WallEntry[]; ask: WallEntry[] },
    performance?: { trades: number; wins: number }
  ): TradePlan | null {
    if (!price) return null

    const score = this.scoreSignals()
    const buffer = Math.max(spread * 2, price * 0.0002)
    const atr = Math.max(spread * 5, price * 0.0015)

    const strongWallBid = walls?.bid?.sort((a, b) => b.notional - a.notional)[0]
    const strongWallAsk = walls?.ask?.sort((a, b) => b.notional - a.notional)[0]

    let direction: PlanDirection = 'NEUTRAL'
    let confidence = 0

    const bullCount = score.recent.filter(s => s.bias === 'bullish').length
    const bearCount = score.recent.filter(s => s.bias === 'bearish').length
    const bullAvg = bullCount ? score.bull / bullCount : 0
    const bearAvg = bearCount ? score.bear / bearCount : 0
    // Normalize: 10 zayıf (avg 10) 1 güçlü (avg 90) karşısında ezilmesin
    if (score.bull > score.bear + 30 && bullAvg > bearAvg + 8 && score.bull > this.config.minConfidence) {
      direction = 'LONG'
      confidence = clamp(50 + (bullAvg - bearAvg) * 1.2 + Math.min(10, bullCount), 50, 95)
    } else if (score.bear > score.bull + 30 && bearAvg > bullAvg + 8 && score.bear > this.config.minConfidence) {
      direction = 'SHORT'
      confidence = clamp(50 + (bearAvg - bullAvg) * 1.2 + Math.min(10, bearCount), 50, 95)
    }

    if (direction === 'NEUTRAL') {
      this.plan = { direction: 'NEUTRAL', confidence: 0, ts: Date.now() }
      this.positionSize = null
      this.emit('plan:update', this.plan)
      return this.plan
    }

    let entry: number, stop: number, tp1: number, tp2: number

    if (direction === 'LONG') {
      entry = price + buffer
      stop = strongWallBid
        ? Math.min(entry - atr * 1.4, strongWallBid.price - spread * 2)
        : entry - atr * 1.4
      tp1 = strongWallAsk
        ? Math.min(entry + atr * 2, strongWallAsk.price - spread)
        : entry + atr * 2
      tp2 = entry + atr * 3.5
    } else {
      entry = price - buffer
      stop = strongWallAsk
        ? Math.max(entry + atr * 1.4, strongWallAsk.price + spread * 2)
        : entry + atr * 1.4
      tp1 = strongWallBid
        ? Math.max(entry - atr * 2, strongWallBid.price + spread)
        : entry - atr * 2
      tp2 = entry - atr * 3.5
    }

    const risk = Math.abs(entry - stop)
    const reward = Math.abs(tp1 - entry)
    const rr = risk > 0 ? reward / risk : 0

    if (rr < this.config.minRR) {
      this.plan = {
        direction: 'NEUTRAL',
        confidence: 0,
        ts: Date.now(),
        reason: `RR too low (${rr.toFixed(2)} < ${this.config.minRR})`
      }
      this.positionSize = null
      this.emit('plan:update', this.plan)
      return this.plan
    }

    this.plan = {
      direction,
      confidence,
      entry,
      stop,
      tp1,
      tp2,
      rr,
      ts: Date.now(),
      reason: score.recent.slice(0, 3).map(s => s.description).join(' + '),
      walls: { strongWallBid, strongWallAsk }
    }

    this.emit('plan:update', this.plan)
    this.calculateMicroOptimizer(performance)

    return this.plan
  }

  /** Kelly criterion position sizing. */
  calculateMicroOptimizer(performance?: { trades: number; wins: number }): PositionSize | null {
    const plan = this.plan
    if (!plan || plan.direction === 'NEUTRAL') {
      this.positionSize = null
      return null
    }

    const { balance, riskPct, maxLeverage, feeRateBps, kellyFraction } = this.config
    const maxRisk = balance * (riskPct / 100)
    const entry = plan.entry!
    const stop = plan.stop!
    const riskPerUnit = Math.abs(entry - stop)
    if (!riskPerUnit) return null

    let qty = maxRisk / riskPerUnit
    const notional = qty * entry
    let leverage = clamp(notional / balance, 1, maxLeverage)
    const margin = notional / leverage
    const fee = notional * (feeRateBps / 10_000) * 2
    const breakEven = fee / qty
    const mmr = 0.004
    const liqPrice =
      plan.direction === 'LONG'
        ? entry * (1 - 1 / leverage + mmr)
        : entry * (1 + 1 / leverage - mmr)

    // Kelly sizing - use real winRate from tracker, conservative cold start
    let winRate: number
    if (performance?.trades && performance.trades >= 5) {
      winRate = performance.wins / performance.trades
    } else if (performance?.trades) {
      const raw = performance.wins / performance.trades
      const prior = 0.42
      const weight = Math.min(1, performance.trades / 20)
      winRate = raw * weight + prior * (1 - weight)
    } else {
      winRate = 0.42 // cold start, not 0.5 aggressive
    }
    const rr = plan.rr ?? 2.5
    const kelly = clamp(
      winRate - (1 - winRate) / Math.max(rr, 0.1),
      0,
      0.25
    )
    qty = qty * Math.max(0.1, Math.min(1, kellyFraction * (kelly / 0.25 + 0.2)))

    this.positionSize = {
      riskPct,
      qty,
      notional: qty * entry,
      margin,
      leverage,
      fee,
      breakEven,
      liqPrice,
      maxRiskUSD: maxRisk,
      rr
    }

    this.emit('microoptimizer:update', this.positionSize)
    return this.positionSize
  }

  /** Decay signal confidences over time. Call periodically (e.g. every 5s). */
  decaySignals(currentPrice: number): void {
    const ts = Date.now()
    for (const s of this.signals) {
      const age = ts - s.ts
      const dist = Math.max(
        0.0001,
        Math.abs((currentPrice || s.price) - (s.price || currentPrice)) /
          (s.price || currentPrice || 1)
      )
      s.decay = Math.exp(-age / 60_000) * Math.exp(-dist * 8)
      s.confidence = Math.round(clamp((s.confidence || 0) * s.decay, 0, 100))
    }
    this.signals = this.signals.filter(s => ts < s.expiresAt && s.confidence > 5)
  }

  /** Generate a narrative string from current signals. */
  getNarrative(): string {
    const ts = Date.now()
    const recent = this.signals.filter(s => ts - s.ts < 60_000).slice(0, 10)
    const bullish = recent.filter(s => s.bias === 'bullish')
    const bearish = recent.filter(s => s.bias === 'bearish')

    if (bullish.length > bearish.length + 2) {
      return 'Güçlü alım akışı: ' + bullish.slice(0, 3).map(s => s.description).join(' | ')
    }
    if (bearish.length > bullish.length + 2) {
      return 'Güçlü satım baskısı: ' + bearish.slice(0, 3).map(s => s.description).join(' | ')
    }
    if (bullish.length && bearish.length) {
      return 'Çelişkili akış: hem alım hem satım sinyalleri aktif. Bekle-gör modu.'
    }
    return 'Piyasa sakin, belirgin bir yön yok. Veri biriktiriliyor...'
  }

  /** Getters */
  getPlan(): TradePlan | null { return this.plan }
  getPositionSize(): PositionSize | null { return this.positionSize }
  getSignals(): MicroSignal[] { return this.signals }

  updateConfig(cfg: Partial<TradePlanConfig>): void {
    this.config = { ...this.config, ...cfg }
  }

  /** Reset state (e.g. on symbol change). */
  reset(): void {
    this.signals = []
    this.plan = null
    this.positionSize = null
    this.signalIdCounter = 0
  }
}
