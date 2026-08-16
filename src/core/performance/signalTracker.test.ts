import { describe, it, expect } from 'vitest'
import { SignalTracker } from './signalTracker'
import type { Signal } from '../../types'

function mkSignal(id: string, side: 'BUY'|'SELL', price: number, ts: number): Signal {
  return { id, side, price, confidence: 80, score: 1.0, breakdown: { cvd: 0.5, obi: 0.3, vel: 0.2, w1: 0.5, w2: 0.3, w3: 0.2 }, ts }
}

describe('SignalTracker - forward return', () => {
  it('BUY horizon PnL hesaplar', () => {
    const tr = new SignalTracker()
    const s = mkSignal('1', 'BUY', 100, 1000)
    tr.addSignal(s)
    // +15s: price 101 => +1%
    tr.updatePrice(101, 1000 + 15000)
    let t = tr.get('1')!
    expect(t.horizons['15s']).toBeCloseTo(1, 5)
    expect(t.mfe).toBeCloseTo(1, 5)
    expect(t.live).toBeCloseTo(1, 5)

    // +30s: price 99 => -1%
    tr.updatePrice(99, 1000 + 30000)
    t = tr.get('1')!
    expect(t.horizons['30s']).toBeCloseTo(-1, 5)
    expect(t.mfe).toBeCloseTo(1, 5) // max still 1
    expect(t.mae).toBeCloseTo(-1, 5)
    expect(t.live).toBeCloseTo(-1, 5)
  })

  it('SELL ters yön', () => {
    const tr = new SignalTracker()
    const s = mkSignal('2', 'SELL', 100, 1000)
    tr.addSignal(s)
    tr.updatePrice(98, 1000 + 15000) // SELL entry 100 -> 98 = +2%
    let t = tr.get('2')!
    expect(t.horizons['15s']).toBeCloseTo(2, 5)
    tr.updatePrice(102, 1000 + 60000) // 102 => -2%
    t = tr.get('2')!
    expect(t.horizons['60s']).toBeCloseTo(-2, 5)
    expect(t.mae).toBeCloseTo(-2, 5)
  })

  it('MFE/MAE live tracking', () => {
    const tr = new SignalTracker()
    const s = mkSignal('3', 'BUY', 100, 0)
    tr.addSignal(s)
    tr.updatePrice(101, 1000)
    tr.updatePrice(103, 2000) // MFE 3
    tr.updatePrice(99, 3000) // MAE -1
    const t = tr.get('3')!
    expect(t.mfe).toBeCloseTo(3, 5)
    expect(t.mae).toBeCloseTo(-1, 5)
    expect(t.live).toBeCloseTo(-1, 5)
  })

  it('stats aggregate', () => {
    const tr = new SignalTracker()
    const now = 1000
    for (let i=0;i<4;i++) {
      const side = i%2===0 ? 'BUY':'SELL' as any
      const s = mkSignal(`${i}`, side, 100, now + i*1000)
      tr.addSignal(s)
      // BUYlar kazanır, SELL kaybeder gibi simüle
      const price = side==='BUY' ? 101 : 101 // BUY 101=>+1% win, SELL 101=>-1% loss (SELL için 101 kötü)
      tr.updatePrice(price, now + i*1000 + 15000)
    }
    const stats = tr.getStats(10)
    expect(stats.count).toBe(4)
    expect(stats.win15s).toBeCloseTo(0.5, 1) // 2 win 2 loss
  })
})
