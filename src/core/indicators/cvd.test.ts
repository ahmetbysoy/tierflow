import { describe, it, expect } from 'vitest'
import { calcCVD, calcCVDNorm, calcCVDZ, detectDivergence } from './cvd'
import type { NormalizedTrade } from '../../types'

function mkTrades(buys: number, sells: number, qty = 1, startTs = 1_000_000): NormalizedTrade[] {
  const trades: NormalizedTrade[] = []
  for (let i = 0; i < buys; i++) trades.push({ price: 50000, qty, side: 'buy', ts: startTs + i * 100 })
  for (let i = 0; i < sells; i++) trades.push({ price: 50000, qty, side: 'sell', ts: startTs + (buys + i) * 100 })
  return trades
}

describe('CVD', () => {
  it('1. CVD birikimi ve yön hesaplama doğruluğu', () => {
    const trades = mkTrades(5, 3, 2, Date.now() - 10_000)
    const cvd = calcCVD(trades, 60, Date.now())
    // 5*2 -3*2 =4
    expect(cvd).toBe(4)
    const cvdNorm = calcCVDNorm(trades, 60, Date.now())
    // 4 / (8*2)=4/16=0.25
    expect(cvdNorm).toBeCloseTo(0.25, 5)
  })

  it('2. CVD Divergence tespiti ve skor düzeltmesi', () => {
    const now = Date.now()
    // Price makes higher high, CVD makes lower high -> bearish -0.3
    const priceHistory: { price: number; ts: number }[] = []
    const cvdNormHistory: number[] = []
    for (let i = 0; i < 20; i++) {
      priceHistory.push({ price: 50000 + i * 10, ts: now - (20 - i) * 1000 })
      // CVD: start high then lower
      cvdNormHistory.push(i < 10 ? 0.8 - i * 0.01 : 0.6 - (i - 10) * 0.02)
    }
    // Last price high, CVD last low => bearish
    const adj = detectDivergence(priceHistory, cvdNormHistory, 20)
    expect(adj).toBe(-0.3)

    // Opposite: price lower low, CVD higher low -> bullish +0.3
    const price2: typeof priceHistory = []
    const cvd2: number[] = []
    for (let i = 0; i < 20; i++) {
      price2.push({ price: 50000 - i * 10, ts: now - (20 - i) * 1000 })
      cvd2.push(i < 10 ? -0.8 + i * 0.01 : -0.6 + (i - 10) * 0.02)
    }
    const adj2 = detectDivergence(price2, cvd2, 20)
    expect(adj2).toBe(0.3)
  })
})

describe('CVD_Z', () => {
  it('CVD_z hesaplamada EMA ve std kullanımı', () => {
    const history = [0.1, 0.2, 0.15, 0.25, 0.3, 0.28, 0.32, 0.35, 0.4, 0.38, 0.45, 0.5, 0.48, 0.52, 0.55, 0.6, 0.58, 0.62, 0.65, 0.9]
    // last is spike 0.9, so z should be positive high
    const z = calcCVDZ(history)
    expect(z).toBeGreaterThan(1)
    expect(z).toBeLessThan(5)
  })
})
