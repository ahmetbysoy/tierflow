/**
 * Signal Filters - canlı takip debug sonrası patchler (v4 - 5dk canlı sonrası + ATR dinamik)
 * - Yatay piyasa filtresi: fiyat range < %dinamik ise sinyal baskıla (base 0.02, ATR'ye göre 0.02-0.15)
 *   BTC'de 0.02, küçük cap yüksek vol'de 0.10+ oto (DetectorSuite bağlanınca daha anlamlı)
 * - OBI confluence: |OBI| < 0.06 ise baskıla
 * - 2/3 onay: en az 2 indikatör aynı yönde ve |z|>0.30
 */

function mean(arr: number[]): number {
  return arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0
}
function std(arr: number[]): number {
  if (arr.length < 2) return 0
  const m = mean(arr)
  const v = arr.reduce((a,b)=>a+(b-m)**2,0)/arr.length
  return Math.sqrt(v)
}
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

export function isFlatMarket(priceHistory: { price: number; ts: number }[], windowMs = 60000, baseThresholdPct = 0.02): boolean {
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
  // ATR/volatiliteye göre dinamik eşik: vol yüksekse flat eşiği de yükselir
  const volPct = mid ? (std(prices) / mid) * 100 : 0
  const dynamicThreshold = clamp(Math.max(baseThresholdPct, volPct * 1.2), 0.02, 0.15)
  return rangePct < dynamicThreshold
}

export function hasOBIConfluence(obi: number, minAbs = 0.06): boolean {
  return Math.abs(obi) >= minAbs
}

export function hasConfluence(
  cvdZ: number,
  obi: number,
  velZ: number,
  score: number,
  minZ = 0.30
): boolean {
  const scoreSide = score > 0 ? 1 : -1
  let count = 0
  if (Math.sign(cvdZ) === scoreSide && Math.abs(cvdZ) >= minZ) count++
  if (Math.sign(obi) === scoreSide && Math.abs(obi) >= minZ) count++
  if (Math.sign(velZ) === scoreSide && Math.abs(velZ) >= minZ) count++
  return count >= 2
}

export function isHighArbitrageSpread(spreadPct: number, threshold = 0.15): boolean {
  return spreadPct > threshold
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
  spreadPct?: number
}): FilterResult {
  if (isFlatMarket(params.priceHistory, 60000, 0.02)) {
    return { pass: false, reason: 'Flat market - range < dinamik eşik (ATR)' }
  }
  if (!hasOBIConfluence(params.obi, 0.06)) {
    return { pass: false, reason: `OBI too weak |OBI|=${params.obi.toFixed(2)} <0.06` }
  }
  if (!hasConfluence(params.cvdZ, params.obi, params.velZ, params.score, 0.30)) {
    return { pass: false, reason: 'No confluence - need 2/3 indicators same direction' }
  }
  if (params.spreadPct !== undefined && isHighArbitrageSpread(params.spreadPct, 0.15)) {
    return { pass: false, reason: `High arbitrage spread ${params.spreadPct.toFixed(2)}% >0.15% - mikro yapı güvenilmez` }
  }
  return { pass: true }
}
