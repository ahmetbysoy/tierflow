/**
 * Velocity - fiyat hızı
 * v_t = (P_t - P_{t-1}) / delta_t  (1s pencere)
 * v = EMA(v_t, alpha=0.3)
 * v_z = (v - EMA(v,30))/std(v,30)
 */

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
  const v = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length
  const s = Math.sqrt(v)
  return s < 1e-9 ? 1 : s
}

export function calcVelocity(
  priceHistory: { price: number; ts: number }[],
  prevV: number | null,
  alpha = 0.3
): number {
  if (priceHistory.length < 2) return prevV ?? 0
  const last = priceHistory[priceHistory.length - 1]
  const prev = priceHistory[priceHistory.length - 2]
  const dt = (last.ts - prev.ts) / 1000 // sec
  if (dt <= 0) return prevV ?? 0
  const vt = (last.price - prev.price) / dt
  if (prevV === null) return vt
  return alpha * vt + (1 - alpha) * prevV
}

export function calcVelocityZ(velocityHistory: number[]): number {
  if (velocityHistory.length < 5) return 0
  const window = velocityHistory.slice(-30)
  if (window.length < 5) return 0
  const hist = window.slice(0, -1)
  if (hist.length < 3) return 0
  const emaVal = ema(hist, 2 / (30 + 1))
  const s = std(hist)
  const last = window[window.length - 1]
  return (last - emaVal) / s
}

export function calcVelocitySequence(prices: { price: number; ts: number }[]): { vs: number[]; vzs: number[] } {
  let v: number | null = null
  const vs: number[] = []
  for (let i = 0; i < prices.length; i++) {
    const slice = prices.slice(0, i + 1)
    v = calcVelocity(slice, v)
    vs.push(v)
  }
  const vzs = vs.map((_, i) => calcVelocityZ(vs.slice(0, i + 1)))
  return { vs, vzs }
}

export const _helpers = { ema, std }
