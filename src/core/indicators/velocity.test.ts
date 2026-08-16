import { describe, it, expect } from 'vitest'
import { calcVelocity, calcVelocityZ } from './velocity'

describe('Velocity', () => {
  it('4. Velocity z-score ve EMA yumuşatma', () => {
    const now = Date.now()
    const prices = [
      { price: 50000, ts: now },
      { price: 50010, ts: now + 1000 }, // v_t =10
      { price: 50025, ts: now + 2000 }, // v_t=15
      { price: 50030, ts: now + 3000 } // v_t=5
    ]
    let v: number | null = null
    v = calcVelocity(prices.slice(0, 2), v) // 10
    expect(v).toBeCloseTo(10, 5)
    v = calcVelocity(prices.slice(0, 3), v) // EMA 0.3*15 +0.7*10=11.5
    expect(v).toBeCloseTo(11.5, 5)
    v = calcVelocity(prices.slice(0, 4), v) // 0.3*5 +0.7*11.5=9.55
    expect(v).toBeCloseTo(9.55, 2)

    // v_z
    const hist = [10, 11.5, 9.55, 10.2, 11, 12, 9, 10, 10.5, 25] // last spike
    const vz = calcVelocityZ(hist)
    expect(vz).toBeGreaterThan(1)
  })

  it('Velocity dt=0 edge', () => {
    const now = Date.now()
    const prices = [
      { price: 50000, ts: now },
      { price: 50010, ts: now } // dt 0
    ]
    const v = calcVelocity(prices, 5)
    expect(v).toBe(5) // unchanged
  })
})
