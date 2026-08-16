import type { NormalizedDepth } from '../../types'

/**
 * OBI - Order Book Imbalance
 * B = Sum(bids.qty), A = Sum(asks.qty) son 20 seviye
 * OBI_t = (B - A)/(B + A)
 * OBI = EMA(OBI_t, alpha=0.2)
 */

export function calcOBIRaw(depth: NormalizedDepth, levels = 20): number {
  const bids = depth.bids.slice(0, levels)
  const asks = depth.asks.slice(0, levels)
  const B = bids.reduce((s, [, q]) => s + q, 0)
  const A = asks.reduce((s, [, q]) => s + q, 0)
  const total = B + A
  if (total === 0) return 0
  return (B - A) / total // [-1, +1]
}

export function updateOBI(prevObi: number | null, raw: number, alpha = 0.2): number {
  if (prevObi === null || prevObi === undefined) return raw
  return alpha * raw + (1 - alpha) * prevObi
}

// Batch helper for tests
export function calcOBISequence(depths: NormalizedDepth[], alpha = 0.2): number[] {
  let obi: number | null = null
  const out: number[] = []
  for (const d of depths) {
    const raw = calcOBIRaw(d)
    obi = updateOBI(obi, raw, alpha)
    out.push(obi)
  }
  return out
}
