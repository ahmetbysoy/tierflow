import { describe, it, expect, vi } from 'vitest'
import { SignalEngine, normalizeWeights, computeScore, computeConfidence } from './engine'

describe('Composite Score', () => {
  it('5. Kompozit skor ağırlık normalizasyonu', () => {
    const w = normalizeWeights({ w1: 2, w2: 1, w3: 1 } as any)
    expect((w.w1||0)+(w.w2||0)+(w.w3||0)+(w.w4||0)+(w.w5||0)+(w.w6||0)).toBeCloseTo(1, 5)
    expect(w.w1).toBeCloseTo(0.5, 5)
    const score = computeScore(1, 0.5, -0.2, { w1: 2, w2: 1, w3: 1 } as any)
    // normalized w = 0.5,0.25,0.25 => 0.5*1 +0.25*0.5 +0.25*(-0.2)=0.5+0.125-0.05=0.575
    expect(score).toBeCloseTo(0.575, 5)

    const zeroW = normalizeWeights({ w1: 0, w2: 0, w3: 0 } as any)
    expect(zeroW.w1).toBeCloseTo(0.30, 5)
    expect((zeroW as any).w4).toBeCloseTo(0.16, 5)
    expect((zeroW as any).w6).toBeCloseTo(0.13, 5)

    const conf = computeConfidence(1.2)
    expect(conf).toBe(100)
    const confHalf = computeConfidence(0.6)
    expect(confHalf).toBe(50)
  })
})

describe('Signal Engine State Machine', () => {
  it('6. Sinyal Durum Makinesi histerezis kontrolü', () => {
    const engine = new SignalEngine({ threshold: 0.6, cooldownMs: 15000, hysteresis: 0.3 })
    const weights = { w1: 0.4, w2: 0.3, w3: 0.3 }

    // 2 tick üst üste threshold üstünde -> FIRED
    let res = engine.tick({ score: 0.8, price: 50000, breakdown: { cvd: 0.8, obi: 0.5, vel: 0.2 }, weights, ts: 1000 })
    expect(res.state).toBe('ARMED')
    expect(res.signal).toBeNull()

    res = engine.tick({ score: 0.85, price: 50010, breakdown: { cvd: 0.8, obi: 0.5, vel: 0.2 }, weights, ts: 2000 })
    expect(res.state).toBe('FIRED')
    expect(res.signal).not.toBeNull()
    expect(res.signal?.side).toBe('BUY')

    // Next tick -> COOLDOWN
    res = engine.tick({ score: 0.9, price: 50020, breakdown: { cvd: 0.9, obi: 0.5, vel: 0.3 }, weights, ts: 3000 })
    expect(res.state).toBe('COOLDOWN')
    expect(res.signal).toBeNull()

    // Histerezis: FIRED sonrası karşı yön (SELL) skor 0.6 üstünde ama lastScore hala 0.85 (>0.3) -> engellenmeli
    // Cooldown bitmeden zaten engellenir, cooldown bitene kadar bekle
    res = engine.tick({ score: -0.8, price: 49900, breakdown: { cvd: -0.8, obi: -0.5, vel: -0.2 }, weights, ts: 4000 })
    expect(res.state).toBe('COOLDOWN')

    // Cooldown sonrası (15s) - skor 0.1 low, sonra SELL dene
    res = engine.tick({ score: 0.1, price: 50000, breakdown: { cvd: 0.1, obi: 0, vel: 0 }, weights, ts: 18000 })
    expect(res.state).toBe('IDLE') // cooldown bitti, IDLE

    // Now histerezis: lastScore was 0.1 (<0.3) so opposite should be allowed after 2 consecutive
    res = engine.tick({ score: -0.8, price: 49900, breakdown: { cvd: -0.8, obi: -0.5, vel: -0.2 }, weights, ts: 19000 })
    expect(res.state).toBe('ARMED')
    res = engine.tick({ score: -0.85, price: 49890, breakdown: { cvd: -0.8, obi: -0.5, vel: -0.2 }, weights, ts: 20000 })
    expect(res.state).toBe('FIRED')
    expect(res.signal?.side).toBe('SELL')
  })

  it('7. Cooldown süresi engelleyici testi', () => {
    const engine = new SignalEngine({ threshold: 0.6, cooldownMs: 5000, hysteresis: 0.3 })
    const w = { w1: 0.4, w2: 0.3, w3: 0.3 }
    engine.tick({ score: 0.8, price: 50000, breakdown: { cvd: 1, obi: 0, vel: 0 }, weights: w, ts: 1000 })
    const fired = engine.tick({ score: 0.8, price: 50000, breakdown: { cvd: 1, obi: 0, vel: 0 }, weights: w, ts: 2000 })
    expect(fired.signal).not.toBeNull()
    // cooldown: 5s
    let res = engine.tick({ score: 0.8, price: 50000, breakdown: { cvd: 1, obi: 0, vel: 0 }, weights: w, ts: 3000 })
    expect(res.state).toBe('COOLDOWN')
    res = engine.tick({ score: 0.8, price: 50000, breakdown: { cvd: 1, obi: 0, vel: 0 }, weights: w, ts: 6000 })
    expect(res.state).toBe('COOLDOWN') // still cooldown (2000+5000=7000)
    res = engine.tick({ score: 0.8, price: 50000, breakdown: { cvd: 1, obi: 0, vel: 0 }, weights: w, ts: 7500 })
    expect(res.state).toBe('IDLE') // cooldown over? Actually 7500-2000=5500 >5000 so IDLE
    // Now need 2 consecutive again
    res = engine.tick({ score: 0.8, price: 50000, breakdown: { cvd: 1, obi: 0, vel: 0 }, weights: w, ts: 8000 })
    expect(res.state).toBe('ARMED')
    res = engine.tick({ score: 0.8, price: 50000, breakdown: { cvd: 1, obi: 0, vel: 0 }, weights: w, ts: 9000 })
    expect(res.signal).not.toBeNull()
  })
})
