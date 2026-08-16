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
 * CVD_z = (CVD_norm - EMA(CVD_norm,20)) / std(CVD_norm,20)
 * cvdNormHistory: son N CVD_norm değerleri
 */
export function calcCVDZ(cvdNormHistory: number[]): number {
  if (cvdNormHistory.length < 5) return 0
  const window = cvdNormHistory.slice(-20)
  const emaVal = emaFromWindow(window, 20)
  const s = std(window)
  const last = window[window.length - 1]
  return (last - emaVal) / s
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

  const priceMakingHigherHigh = priceLast >= priceHigh - 1e-9 && priceLast > priceFirst
  const cvdMakingLowerHigh = cvdLast < cvdHigh - 0.02 // CVD tepe yapamıyor

  const priceMakingLowerLow = priceLast <= priceLow + 1e-9 && priceLast < priceFirst
  const cvdMakingHigherLow = cvdLast > cvdLow + 0.02

  if (priceMakingHigherHigh && cvdMakingLowerHigh) return -0.3 // bearish
  if (priceMakingLowerLow && cvdMakingHigherLow) return 0.3 // bullish
  return 0
}

// Pure helper export for tests
export const _helpers = { ema, std, emaFromWindow }
