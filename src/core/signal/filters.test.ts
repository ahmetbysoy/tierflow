import { describe, it, expect } from 'vitest'
import { isFlatMarket, hasOBIConfluence, hasConfluence, applyFilters } from './filters'

describe('Filters - debug patch', () => {
  it('flat market detection', () => {
    const now = Date.now()
    const flat = Array.from({ length: 20 }, (_, i) => ({ price: 63037.10 + (i % 2) * 0.05, ts: now - (20 - i) * 3000 }))
    expect(isFlatMarket(flat, 60000, 0.15)).toBe(true) // range 0.05 /63037 ~0.00007% <0.15

    const volatile = Array.from({ length: 20 }, (_, i) => ({ price: 63000 + i * 10, ts: now - (20 - i) * 3000 }))
    expect(isFlatMarket(volatile, 60000, 0.15)).toBe(false) // range 190/63095 ~0.3% >0.15
  })

  it('OBI confluence', () => {
    expect(hasOBIConfluence(0.02, 0.15)).toBe(false)
    expect(hasOBIConfluence(0.20, 0.15)).toBe(true)
    expect(hasOBIConfluence(-0.16, 0.15)).toBe(true)
  })

  it('confluence 2/3', () => {
    // score BUY, need 2 of 3 same direction
    expect(hasConfluence(1.1, 0.10, 0.27, 0.94, 0.4)).toBe(false) // CVD yes, OBI no (0.10<0.4), VEL no (0.27<0.4) => only 1
    expect(hasConfluence(1.1, 0.5, 0.6, 0.94, 0.4)).toBe(true) // CVD yes, OBI yes, VEL yes => 3
    expect(hasConfluence(-0.62, 0.04, -2.27, -1.05, 0.4)).toBe(true) // CVD yes (-0.62), OBI no (0.04), VEL yes (-2.27) => 2 -> true
  })

  it('applyFilters blocks screenshot signals', () => {
    const now = Date.now()
    const flatHistory = Array.from({ length: 20 }, (_, i) => ({ price: 63037.10, ts: now - i * 3000 }))
    // Screenshot BUY 00:34:12 CVD 1.11 OBI 0.10 VEL 0.27 Score 0.94 -> should be blocked by OBI and confluence
    const r1 = applyFilters({ priceHistory: flatHistory, cvdZ: 1.11, obi: 0.10, velZ: 0.27, score: 0.94 })
    expect(r1.pass).toBe(false)
    expect(r1.reason).toMatch(/Flat|OBI|confluence/)

    // Volatile + strong OBI + confluence -> pass
    const volatileHistory = Array.from({ length: 20 }, (_, i) => ({ price: 63000 + i * 15, ts: now - (20 - i) * 3000 }))
    const r2 = applyFilters({ priceHistory: volatileHistory, cvdZ: 1.5, obi: 0.25, velZ: 0.8, score: 1.2 })
    expect(r2.pass).toBe(true)
  })
})
