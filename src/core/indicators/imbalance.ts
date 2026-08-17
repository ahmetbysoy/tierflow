import type { NormalizedDepth } from '../../types'

/**
 * OBI - Order Book Imbalance (derinlik ağırlıklı)
 * B = Sum(bids.qty * w), A = Sum(asks.qty * w), w = exp(-distance/decay)
 * distance = |price - mid| / mid, decay ~0.003 (0.3%) -> uzak seviye azalan ağırlık
 * OBI_t = (B - A)/(B + A)
 * OBI = EMA(OBI_t, alpha=0.2)
 */

export function calcOBIRaw(depth: NormalizedDepth, levels = 20, decay = 0.003): number {
  const bids = depth.bids.slice(0, levels)
  const asks = depth.asks.slice(0, levels)
  if (bids.length === 0 && asks.length === 0) return 0
  // mid fiyat
  const bestBid = bids[0]?.[0] ?? asks[0]?.[0] ?? 0
  const bestAsk = asks[0]?.[0] ?? bids[0]?.[0] ?? 0
  const mid = (bestBid + bestAsk) / 2 || bestBid || bestAsk || 1
  const weight = (price: number) => {
    if (!decay || decay <= 0) return 1
    const dist = Math.abs(price - mid) / (mid || 1)
    return Math.exp(-dist / decay)
  }
  const B = bids.reduce((s, [p, q]) => s + q * weight(p), 0)
  const A = asks.reduce((s, [p, q]) => s + q * weight(p), 0)
  const total = B + A
  if (total === 0) return 0
  return (B - A) / total // [-1, +1]
}

export function updateOBI(prevObi: number | null, raw: number, alpha = 0.2): number {
  if (prevObi === null || prevObi === undefined) return raw
  return alpha * raw + (1 - alpha) * prevObi
}

// Batch helper for tests
export function calcOBISequence(depths: NormalizedDepth[], alpha = 0.2, decay = 0.003): number[] {
  let obi: number | null = null
  const out: number[] = []
  for (const d of depths) {
    const raw = calcOBIRaw(d, 20, decay)
    obi = updateOBI(obi, raw, alpha)
    out.push(obi)
  }
  return out
}
