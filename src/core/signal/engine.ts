import type { Signal } from '../../types'

export type EngineState = 'IDLE' | 'ARMED' | 'FIRED' | 'COOLDOWN'
// Gelecek için: 'WAITING_CONFIRMATION' eklenecek → XState'e geçişi kolay
// export type EngineState = 'IDLE' | 'ARMED' | 'WAITING_CONFIRMATION' | 'FIRED' | 'COOLDOWN'

export interface Weights {
  w1: number
  w2: number
  w3: number
  w4?: number
  w5?: number
  w6?: number
}

export function normalizeWeights(w: Weights): Weights {
  const sum = (w.w1||0)+(w.w2||0)+(w.w3||0)+(w.w4||0)+(w.w5||0)+(w.w6||0)
  if (sum === 0) return { w1: 0.30, w2: 0.18, w3: 0.13, w4: 0.16, w5: 0.10, w6: 0.13 } as Weights
  return { w1: (w.w1||0)/sum, w2: (w.w2||0)/sum, w3: (w.w3||0)/sum, w4: (w.w4||0)/sum, w5: (w.w5||0)/sum, w6: (w.w6||0)/sum } as Weights
}

export function computeScore(
  cvdZ: number,
  obi: number,
  velocityZ: number,
  weights: Weights,
  divergenceAdj = 0,
  microDev: number = 0,
  vpinAdj: number = 0,
  detectorScore: number = 0
): number {
  const w = normalizeWeights(weights)
  const s = (w.w1||0) * cvdZ + (w.w2||0) * obi + (w.w3||0) * velocityZ + (w.w4||0) * microDev + (w.w5||0) * vpinAdj + (w.w6||0) * detectorScore + divergenceAdj
  return Math.max(-3, Math.min(3, s))
}

export function computeConfidence(score: number): number {
  return Math.min(100, Math.round((Math.abs(score) / 1.2) * 100))
}

export interface EngineConfig {
  threshold: number
  cooldownMs: number
  hysteresis: number
}

export interface EngineTickResult {
  state: EngineState
  signal: Signal | null
  score: number
  confidence: number
}

/**
 * SignalEngine — XState tarzı finite-state-machine
 * İç içe if'ler yerine tablo-driven, her state ayrı handler.
 * Yeni state eklemek için sadece EngineState union'ına ekle + handler yaz.
 * Örn: WAITING_CONFIRMATION → handleWaitingConfirmation()
 */
export class SignalEngine {
  state: EngineState = 'IDLE'
  private consecutive = 0
  private lastFiredAt = 0
  private lastFiredSide: 'BUY' | 'SELL' | null = null
  private lastScore = 0
  private hasSeenNeutralSinceFired = true

  constructor(private config: EngineConfig = { threshold: 0.75, cooldownMs: 18000, hysteresis: 0.35 }) {}

  updateConfig(cfg: Partial<EngineConfig>) {
    this.config = { ...this.config, ...cfg }
  }

  // ── Helpers ────────────────────────────────────────────────
  private sideOf(score: number): 'BUY' | 'SELL' {
    return score > 0 ? 'BUY' : 'SELL'
  }

  private isNeutral(score: number): boolean {
    return Math.abs(score) < this.config.hysteresis
  }

  private isBlockedByHysteresis(score: number): boolean {
    const wouldBeSide = this.sideOf(score)
    return !!(
      this.lastFiredSide &&
      wouldBeSide !== this.lastFiredSide &&
      !this.hasSeenNeutralSinceFired &&
      Math.abs(score) >= this.config.threshold
    )
  }

  private trackNeutral(score: number): void {
    if (this.isNeutral(score)) this.hasSeenNeutralSinceFired = true
  }

  private makeSignal(score: number, price: number, breakdown: any, weights: Weights, ts: number): Signal {
    const side = this.sideOf(score)
    return {
      id: `${ts}-${side}`,
      side,
      price,
      confidence: computeConfidence(score),
      score,
      breakdown: {
        cvd: breakdown.cvd, obi: breakdown.obi, vel: breakdown.vel,
        micro: breakdown.micro, vpin: breakdown.vpin, detector: (breakdown as any).detector,
        w1: weights.w1, w2: weights.w2, w3: weights.w3, w4: (weights as any).w4, w5: (weights as any).w5, w6: (weights as any).w6
      },
      ts
    }
  }

  // ── State handlers (tablo-driven) ───────────────────────
  private handleCooldown(score: number, ts: number): { next: EngineState; result: EngineTickResult } | null {
    if (this.state !== 'COOLDOWN') return null
    if (ts - this.lastFiredAt >= this.config.cooldownMs) {
      this.state = 'IDLE'
      this.consecutive = 0
      this.trackNeutral(score)
      this.lastScore = score
      return { next: 'IDLE', result: { state: this.state, signal: null, score, confidence: computeConfidence(score) } }
    }
    this.trackNeutral(score)
    this.lastScore = score
    return { next: 'COOLDOWN', result: { state: this.state, signal: null, score, confidence: computeConfidence(score) } }
  }

  private handleFired(score: number): { next: EngineState; result: EngineTickResult } | null {
    if (this.state !== 'FIRED') return null
    this.state = 'COOLDOWN'
    this.trackNeutral(score)
    this.lastScore = score
    return { next: 'COOLDOWN', result: { state: this.state, signal: null, score, confidence: computeConfidence(score) } }
  }

  // ── Public tick (FSM entry) ─────────────────────────────
  tick(params: {
    score: number
    price: number
    breakdown: { cvd: number; obi: number; vel: number; micro?: number; vpin?: number; detector?: number }
    weights: Weights
    ts: number
  }): EngineTickResult {
    const { score, price, breakdown, weights, ts } = params
    const absScore = Math.abs(score)
    const threshold = this.config.threshold

    // 1. COOLDOWN
    const cd = this.handleCooldown(score, ts)
    if (cd) return cd.result

    // 2. FIRED → COOLDOWN
    const fd = this.handleFired(score)
    if (fd) return fd.result

    // 3. Histerezis: karşı yön blok
    if (this.isBlockedByHysteresis(score)) {
      if (this.isNeutral(score)) {
        this.hasSeenNeutralSinceFired = true
        this.consecutive = 0
        if (this.state === 'ARMED') this.state = 'IDLE'
        this.lastScore = score
        return { state: this.state, signal: null, score, confidence: computeConfidence(score) }
      }
      this.lastScore = score
      return { state: this.state, signal: null, score, confidence: computeConfidence(score) }
    }

    // 4. Neutral takibi
    this.trackNeutral(score)

    // 5. Threshold + consecutive (IDLE → ARMED → FIRED)
    // Gelecekte: ARMED → WAITING_CONFIRMATION → FIRED eklemek için buraya bir handler ekle
    // Örn: if (this.state === 'ARMED' && absScore >= threshold) return this.handleWaitingConfirmation(...)
    if (absScore >= threshold) {
      this.consecutive += 1
      if (this.consecutive >= 2) {
        this.state = 'FIRED'
        const signal = this.makeSignal(score, price, breakdown, weights, ts)
        this.lastFiredSide = signal.side
        this.lastFiredAt = ts
        this.hasSeenNeutralSinceFired = false
        this.consecutive = 0
        this.lastScore = score
        return { state: this.state, signal, score, confidence: signal.confidence }
      }
      this.state = 'ARMED'
    } else {
      this.consecutive = 0
      if (this.state === 'ARMED') this.state = 'IDLE'
    }

    this.lastScore = score
    return { state: this.state, signal: null, score, confidence: computeConfidence(score) }
  }

  getState(): EngineState {
    return this.state
  }

  reset(): void {
    this.state = 'IDLE'
    this.consecutive = 0
    this.lastFiredAt = 0
    this.lastFiredSide = null
    this.lastScore = 0
    this.hasSeenNeutralSinceFired = true
  }

  _getInternal() {
    return {
      consecutive: this.consecutive,
      lastFiredAt: this.lastFiredAt,
      lastFiredSide: this.lastFiredSide,
      lastScore: this.lastScore,
      hasSeenNeutralSinceFired: this.hasSeenNeutralSinceFired
    }
  }
}
