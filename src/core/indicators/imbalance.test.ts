import { describe, it, expect } from 'vitest'
import { calcOBIRaw, updateOBI, calcOBISequence } from './imbalance'
import type { NormalizedDepth } from '../../types'

function mkDepth(bidQty: number, askQty: number, levels = 5): NormalizedDepth {
  const bids: [number, number][] = Array.from({ length: levels }, (_, i) => [50000 - i, bidQty / levels] as [number, number])
  const asks: [number, number][] = Array.from({ length: levels }, (_, i) => [50001 + i, askQty / levels] as [number, number])
  return { bids, asks, ts: Date.now() }
}

describe('OBI', () => {
  it('3. OBI uç değer (±1) sınır hesaplaması', () => {
    // Full bid
    const d1 = mkDepth(100, 0)
    expect(calcOBIRaw(d1)).toBeCloseTo(1, 5)
    // Full ask
    const d2 = mkDepth(0, 100)
    expect(calcOBIRaw(d2)).toBeCloseTo(-1, 5)
    // Balanced
    const d3 = mkDepth(50, 50)
    expect(calcOBIRaw(d3)).toBeCloseTo(0, 5)
    // Empty
    const d4: NormalizedDepth = { bids: [], asks: [], ts: Date.now() }
    expect(calcOBIRaw(d4)).toBe(0)
  })

  it('OBI EMA yumuşatma', () => {
    const prev = 0
    const raw = 1
    const ema = updateOBI(prev, raw, 0.2)
    expect(ema).toBeCloseTo(0.2, 5)
    const ema2 = updateOBI(ema, 1, 0.2)
    expect(ema2).toBeCloseTo(0.36, 5)
  })

  it('OBI sequence EMA', () => {
    const depths = [mkDepth(100, 0), mkDepth(100, 0), mkDepth(0, 100), mkDepth(50, 50)]
    const seq = calcOBISequence(depths, 0.2)
    expect(seq[0]).toBeCloseTo(1, 5)
    expect(seq[1]).toBeCloseTo(1, 5) // stays 1
    expect(seq[2]).toBeLessThan(1)
    expect(seq[2]).toBeGreaterThan(-0.5)
  })
})
