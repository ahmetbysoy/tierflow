/**
 * Signal Filters - canlı takip debug sonrası patchler
 * - Yatay piyasa filtresi: fiyat range < %0.15 ise sinyal baskıla
 * - OBI confluence: |OBI| < 0.15 ise baskıla
 * - 2/3 onay: en az 2 indikatör aynı yönde ve |z|>0.5
 */

export function isFlatMarket(priceHistory: { price: number; ts: number }[], windowMs = 60000, thresholdPct = 0.15): boolean {
  if (priceHistory.length < 10) return false
  const now = Date.now()
  const cutoff = now - windowMs
  const recent = priceHistory.filter(p => p.ts >= cutoff)
  if (recent.length < 10) return false
  const prices = recent.map(p => p.price)
  const max = Math.max(...prices)
  const min = Math.min(...prices)
  const mid = (max + min) / 2
  if (mid === 0) return true
  const rangePct = ((max - min) / mid) * 100
  return rangePct < thresholdPct
}

export function hasOBIConfluence(obi: number, minAbs = 0.15): boolean {
  return Math.abs(obi) >= minAbs
}

export function hasConfluence(
  cvdZ: number,
  obi: number,
  velZ: number,
  score: number,
  minZ = 0.4
): boolean {
  const scoreSide = score > 0 ? 1 : -1
  let count = 0
  if (Math.sign(cvdZ) === scoreSide && Math.abs(cvdZ) >= minZ) count++
  if (Math.sign(obi) === scoreSide && Math.abs(obi) >= minZ) count++
  if (Math.sign(velZ) === scoreSide && Math.abs(velZ) >= minZ) count++
  return count >= 2
}

export interface FilterResult {
  pass: boolean
  reason?: string
}

export function applyFilters(params: {
  priceHistory: { price: number; ts: number }[]
  cvdZ: number
  obi: number
  velZ: number
  score: number
}): FilterResult {
  if (isFlatMarket(params.priceHistory)) {
    return { pass: false, reason: 'Flat market - range <0.15%' }
  }
  if (!hasOBIConfluence(params.obi, 0.15)) {
    return { pass: false, reason: `OBI too weak |OBI|=${params.obi.toFixed(2)} <0.15` }
  }
  if (!hasConfluence(params.cvdZ, params.obi, params.velZ, params.score, 0.4)) {
    return { pass: false, reason: 'No confluence - need 2/3 indicators same direction' }
  }
  return { pass: true }
}
