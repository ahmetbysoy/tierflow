import type { NormalizedTrade } from '../../types'

function ema(values: number[], alpha: number): number {
  if (values.length === 0) return 0
  let e = values[0]
  for (let i = 1; i < values.length; i++) {
    e = alpha * values[i] + (1 - alpha) * e
  }
  return e
}

function std(values: number[]): number {
  if (values.length < 2) return 1
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length
  const s = Math.sqrt(variance)
  return s < 1e-9 ? 1 : s
}

function emaFromWindow(values: number[], period: number): number {
  if (values.length === 0) return 0
  const alpha = 2 / (period + 1)
  return ema(values, alpha)
}

/**
 * CVD hesapla: delta = side === 'buy' ? +qty : -qty, window_s pencereli birikim
 */
export function calcCVD(trades: NormalizedTrade[], windowS = 60, now = Date.now()): number {
  const cutoff = now - windowS * 1000
  let cvd = 0
  for (const t of trades) {
    if (t.ts < cutoff) continue
    cvd += t.side === 'buy' ? t.qty : -t.qty
  }
  return cvd
}

export function calcCVDNorm(trades: NormalizedTrade[], windowS = 60, now = Date.now()): number {
  const cutoff = now - windowS * 1000
  let cvd = 0
  let sumQty = 0
  for (const t of trades) {
    if (t.ts < cutoff) continue
    cvd += t.side === 'buy' ? t.qty : -t.qty
    sumQty += t.qty
  }
  if (sumQty === 0) return 0
  return cvd / sumQty // [-1, +1]
}

/**
 * CVD_z = (CVD_norm - EMA(CVD_norm,period)) / std(CVD_norm,period)
 * cvdNormHistory: son N CVD_norm değerleri
 * period: EMA ve std penceresi (default 20, multi-timeframe için 60 da kullanılabilir)
 */
export function calcCVDZ(cvdNormHistory: number[], period = 20): number {
  if (cvdNormHistory.length < 5) return 0
  const window = cvdNormHistory.slice(-period)
  const emaVal = emaFromWindow(window, period)
  const s = std(window)
  const last = window[window.length - 1]
  return (last - emaVal) / s
}

/**
 * Multi-timeframe CVD_z confluence
 * Kısa (20) ve uzun (60) CVD_z aynı yönde ve |z|>0.5 ise bonus verir.
 * Score'a eklenmek üzere {z20, z60, confluence, combined} döner.
 */
export function calcCVDZMulti(cvdNormHistory: number[]): { z20: number; z60: number; confluence: number; combined: number } {
  const z20 = calcCVDZ(cvdNormHistory, 20)
  const z60 = cvdNormHistory.length >= 30 ? calcCVDZ(cvdNormHistory, 60) : z20
  const confluence = (Math.sign(z20) === Math.sign(z60) && Math.abs(z20) > 0.5 && Math.abs(z60) > 0.5) ? 0.25 * Math.sign(z20) : 0
  const combined = z20 * 0.7 + z60 * 0.3 + confluence
  return { z20, z60, confluence, combined }
}

function adaptiveThreshold(cvdHistory: number[], priceHistory: { price: number }[]): number {
  // CVD volatilitesine göre ATR-benzeri eşik
  const cvdSlice = cvdHistory.slice(-20)
  const cvdStd = std(cvdSlice)
  const cvdThresh = Math.max(0.015, Math.min(0.035, cvdStd * 0.8))
  // Fiyat volatilitesine göre ek düzeltme
  if (priceHistory.length >= 10) {
    const prices = priceHistory.slice(-20).map(p => p.price)
    const mid = prices.reduce((a,b)=>a+b,0)/prices.length
    const priceStd = std(prices)
    const priceAtrPct = mid ? (priceStd / mid) : 0
    const priceThresh = Math.max(0.015, Math.min(0.035, priceAtrPct * 8))
    // İkisinin ortalaması, en az 0.015
    return Math.max(0.015, Math.min(0.04, (cvdThresh + priceThresh) / 2))
  }
  return cvdThresh
}

/**
 * Divergence tespiti
 * Son 20 sn'de fiyat yeni yüksek tepe yaparken CVD_norm düşük tepe yapıyorsa bearish (-0.3)
 * Tersi bullish (+0.3)
 */
export function detectDivergence(
  priceHistory: { price: number; ts: number }[],
  cvdNormHistory: number[],
  windowS = 20
): number {
  if (priceHistory.length < 10 || cvdNormHistory.length < 10) return 0
  const now = priceHistory[priceHistory.length - 1]?.ts ?? Date.now()
  const cutoff = now - windowS * 1000

  const recentPrices = priceHistory.filter(p => p.ts >= cutoff)
  const recentCVD = cvdNormHistory.slice(-recentPrices.length)

  if (recentPrices.length < 5 || recentCVD.length < 5) return 0

  const priceHigh = Math.max(...recentPrices.map(p => p.price))
  const priceLow = Math.min(...recentPrices.map(p => p.price))
  const priceLast = recentPrices[recentPrices.length - 1].price
  const priceFirst = recentPrices[0].price

  const cvdHigh = Math.max(...recentCVD)
  const cvdLow = Math.min(...recentCVD)
  const cvdLast = recentCVD[recentCVD.length - 1]
  const cvdFirst = recentCVD[0]

  const adaptThresh = adaptiveThreshold(recentCVD, recentPrices)

  const priceMakingHigherHigh = priceLast >= priceHigh - 1e-9 && priceLast > priceFirst
  const cvdMakingLowerHigh = cvdLast < cvdHigh - adaptThresh // CVD tepe yapamıyor (ATR-normalize)

  const priceMakingLowerLow = priceLast <= priceLow + 1e-9 && priceLast < priceFirst
  const cvdMakingHigherLow = cvdLast > cvdLow + adaptThresh

  if (priceMakingHigherHigh && cvdMakingLowerHigh) return -0.3 // bearish
  if (priceMakingLowerLow && cvdMakingHigherLow) return 0.3 // bullish
  return 0
}

// Pure helper export for tests
export const _helpers = { ema, std, emaFromWindow }
