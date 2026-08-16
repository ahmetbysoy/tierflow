import type { Signal } from '../../types'

export type EngineState = 'IDLE' | 'ARMED' | 'FIRED' | 'COOLDOWN'

export interface Weights {
  w1: number
  w2: number
  w3: number
  w4?: number
  w5?: number
}

export function normalizeWeights(w: Weights): Weights {
  const sum = (w.w1||0)+(w.w2||0)+(w.w3||0)+(w.w4||0)+(w.w5||0)
  if (sum === 0) return { w1: 0.35, w2: 0.20, w3: 0.15, w4: 0.18, w5: 0.12 } as Weights
  return { w1: (w.w1||0)/sum, w2: (w.w2||0)/sum, w3: (w.w3||0)/sum, w4: (w.w4||0)/sum, w5: (w.w5||0)/sum } as Weights
}

export function computeScore(
  cvdZ: number,
  obi: number,
  velocityZ: number,
  weights: Weights,
  divergenceAdj = 0,
  microDev: number = 0,
  vpinAdj: number = 0
): number {
  const w = normalizeWeights(weights)
  const s = (w.w1||0) * cvdZ + (w.w2||0) * obi + (w.w3||0) * velocityZ + (w.w4||0) * microDev + (w.w5||0) * vpinAdj + divergenceAdj
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

export class SignalEngine {
  state: EngineState = 'IDLE'
  private consecutive = 0
  private lastFiredAt = 0
  private lastFiredSide: 'BUY' | 'SELL' | null = null
  private lastScore = 0
  private hasSeenNeutralSinceFired = true // initially true so first signal allowed

  constructor(private config: EngineConfig = { threshold: 0.75, cooldownMs: 18000, hysteresis: 0.35 }) {}

  updateConfig(cfg: Partial<EngineConfig>) {
    this.config = { ...this.config, ...cfg }
  }

  tick(params: {
    score: number
    price: number
    breakdown: { cvd: number; obi: number; vel: number; micro?: number; vpin?: number }
    weights: Weights
    ts: number
  }): EngineTickResult {
    const { score, price, breakdown, weights, ts } = params
    const absScore = Math.abs(score)
    const threshold = this.config.threshold
    const hysteresis = this.config.hysteresis

    // COOLDOWN kontrolü - cooldown süresi doldu mu?
    if (this.state === 'COOLDOWN') {
      if (ts - this.lastFiredAt >= this.config.cooldownMs) {
        this.state = 'IDLE'
        this.consecutive = 0
        // Cooldown bittiği tick'i nötr kabul et, bir sonraki tick'ten itibaren 2 ardışık sayılsın (test beklentisi)
        if (absScore < hysteresis) this.hasSeenNeutralSinceFired = true
        this.lastScore = score
        return { state: this.state, signal: null, score, confidence: computeConfidence(score) }
      } else {
        // Cooldown sırasında bile histerezis için neutral görme takibi yap
        if (absScore < hysteresis) this.hasSeenNeutralSinceFired = true
        this.lastScore = score
        return { state: this.state, signal: null, score, confidence: computeConfidence(score) }
      }
    }

    // FIRED'dan hemen sonraki tick -> COOLDOWN'a geç (cooldown süresi FIRED anından başlar, burada lastFiredAt güncellenmez)
    if (this.state === 'FIRED') {
      this.state = 'COOLDOWN'
      // hasSeenNeutral zaten false, FIRED sonrası neutral görülmeden karşı yön engellenir
      // Bu tick'te de neutral kontrolü yap
      if (absScore < hysteresis) this.hasSeenNeutralSinceFired = true
      this.lastScore = score
      return { state: this.state, signal: null, score, confidence: computeConfidence(score) }
    }

    // Histerezis: FIRED sonrası skor |S| < 0.3'e düşmeden karşı yön tetiklenemez
    // Eğer neutral görülmediyse ve karşı yöne geçmek isteniyorsa engelle
    const wouldBeSide = score > 0 ? 'BUY' : 'SELL'
    if (this.lastFiredSide && wouldBeSide !== this.lastFiredSide && !this.hasSeenNeutralSinceFired) {
      // Eğer bu tick skor neutral bölgeye düştüyse, artık bir sonraki karşı yöne izin ver
      if (absScore < hysteresis) {
        this.hasSeenNeutralSinceFired = true
        // Bu tick zaten threshold altında, sinyal yok ama state'i güncelle
        this.consecutive = 0
        if (this.state === 'ARMED') this.state = 'IDLE'
        this.lastScore = score
        return { state: this.state, signal: null, score, confidence: computeConfidence(score) }
      }
      // Neutral görülmeden karşı yön threshold üstündeyse engelle
      if (absScore >= threshold) {
        this.lastScore = score
        return { state: this.state, signal: null, score, confidence: computeConfidence(score) }
      }
    }

    // Neutral bölgeye düşüşü her tick'te takip et
    if (absScore < hysteresis) {
      this.hasSeenNeutralSinceFired = true
    }

    if (absScore >= threshold) {
      this.consecutive += 1
      if (this.consecutive >= 2) {
        // 2 tick üst üste threshold üstünde -> FIRED
        this.state = 'FIRED'
        const side: 'BUY' | 'SELL' = score > 0 ? 'BUY' : 'SELL'

        const signal: Signal = {
          id: `${ts}-${side}`,
          side,
          price,
          confidence: computeConfidence(score),
          score,
          breakdown: { cvd: breakdown.cvd, obi: breakdown.obi, vel: breakdown.vel, micro: breakdown.micro, vpin: breakdown.vpin, w1: weights.w1, w2: weights.w2, w3: weights.w3, w4: (weights as any).w4, w5: (weights as any).w5 },
          ts
        }
        this.lastFiredSide = side
        this.lastFiredAt = ts
        this.hasSeenNeutralSinceFired = false // yeni FIRED sonrası neutral görülmedi
        this.consecutive = 0
        this.lastScore = score
        return { state: this.state, signal, score, confidence: signal.confidence }
      } else {
        this.state = 'ARMED'
      }
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
