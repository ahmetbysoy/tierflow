import { create } from 'zustand'
import { RingBuffer } from '../core/buffers/ringBuffer'
import { calcCVDNorm, calcCVDZ, detectDivergence } from '../core/indicators/cvd'
import { calcOBIRaw, updateOBI } from '../core/indicators/imbalance'
import { calcVelocity, calcVelocityZ } from '../core/indicators/velocity'
import { SignalEngine, computeScore, normalizeWeights } from '../core/signal/engine'
import type { NormalizedTrade, NormalizedDepth, Candle, Signal, Metrics } from '../types'

interface DataState {
  price: number
  metrics: Metrics
  engineState: 'IDLE' | 'ARMED' | 'FIRED' | 'COOLDOWN'
  signals: Signal[]
  candles: Candle[]
  cvd: number
  lastUpdate: number
  // internal buffers not exposed directly but kept in closure
  // actions
  handleTrade: (t: NormalizedTrade) => void
  handleDepth: (d: NormalizedDepth) => void
  handleMark: (price: number, ts: number) => void
  reset: () => void
}

// Internal singleton buffers/engine
const tradeBuffer = new RingBuffer<NormalizedTrade>(1000)
const priceHistory: { price: number; ts: number }[] = []
const cvdNormHistory: number[] = []
const velocityHistory: number[] = []
let obiValue = 0
let velocityValue = 0
let engine = new SignalEngine({ threshold: 0.6, cooldownMs: 15000, hysteresis: 0.3 })
let lastThrottle = 0
let currentCandle: Candle | null = null
const candles: Candle[] = []

function getSettings() {
  try {
    const raw = localStorage.getItem('signal-radar-settings')
    if (raw) return JSON.parse(raw)
  } catch {}
  return { weights: { w1: 0.4, w2: 0.3, w3: 0.3 }, threshold: 0.6, cooldown: 15 }
}

function updateCandle(price: number, ts: number) {
  const interval = 15 // sec
  const candleTime = Math.floor(ts / 1000 / interval) * interval
  if (!currentCandle || currentCandle.time !== candleTime) {
    if (currentCandle) candles.push(currentCandle)
    if (candles.length > 200) candles.shift()
    currentCandle = {
      time: candleTime,
      open: price,
      high: price,
      low: price,
      close: price,
      volume: 0
    }
  } else {
    currentCandle.high = Math.max(currentCandle.high, price)
    currentCandle.low = Math.min(currentCandle.low, price)
    currentCandle.close = price
  }
  // Keep candles array + currentCandle as live
}

export const useDataStore = create<DataState>((set, get) => ({
  price: 0,
  metrics: { cvd: 0, cvdNorm: 0, cvdZ: 0, obi: 0, obiRaw: 0, velocity: 0, velocityZ: 0, score: 0, price: 0 },
  engineState: 'IDLE',
  signals: [],
  candles: [],
  cvd: 0,
  lastUpdate: 0,

  handleTrade: (t) => {
    const now = Date.now()
    // throttle 10Hz (100ms)
    if (now - lastThrottle < 100) {
      // still buffer trade but don't recompute UI-heavy metrics? We buffer anyway
      tradeBuffer.push(t)
      priceHistory.push({ price: t.price, ts: t.ts })
      if (priceHistory.length > 500) priceHistory.shift()
      // still update candle even if throttled? do it lightweight
      updateCandle(t.price, t.ts)
      return
    }
    lastThrottle = now

    tradeBuffer.push(t)
    priceHistory.push({ price: t.price, ts: t.ts })
    if (priceHistory.length > 500) priceHistory.shift()
    updateCandle(t.price, t.ts)

    const trades = tradeBuffer.toArray()
    const cvdNorm = calcCVDNorm(trades, 60, t.ts)
    cvdNormHistory.push(cvdNorm)
    if (cvdNormHistory.length > 100) cvdNormHistory.shift()
    const cvdZ = calcCVDZ(cvdNormHistory)
    const divergenceAdj = detectDivergence(priceHistory, cvdNormHistory, 20)

    // velocity
    velocityValue = calcVelocity(priceHistory, velocityValue)
    velocityHistory.push(velocityValue)
    if (velocityHistory.length > 100) velocityHistory.shift()
    const velocityZ = calcVelocityZ(velocityHistory)

    // obi already from depth, use current obiValue
    const settings = getSettings()
    const weights = normalizeWeights(settings.weights || { w1: 0.4, w2: 0.3, w3: 0.3 })
    const score = computeScore(cvdZ, obiValue, velocityZ, weights, divergenceAdj)

    // engine tick
    engine.updateConfig({ threshold: settings.threshold ?? 0.6, cooldownMs: (settings.cooldown ?? 15) * 1000 })
    const res = engine.tick({
      score,
      price: t.price,
      breakdown: { cvd: cvdZ, obi: obiValue, vel: velocityZ },
      weights,
      ts: t.ts
    })

    const metrics: Metrics = {
      cvd: 0,
      cvdNorm,
      cvdZ,
      obi: obiValue,
      obiRaw: obiValue,
      velocity: velocityValue,
      velocityZ,
      score,
      price: t.price
    }

    const allCandles = currentCandle ? [...candles, currentCandle] : [...candles]

    set({
      price: t.price,
      metrics,
      engineState: res.state,
      lastUpdate: t.ts,
      candles: allCandles,
      cvd: cvdNorm
    })

    if (res.signal) {
      // play sound via side effect - will be handled in component or here
      set((s) => {
        const next = [res.signal!, ...s.signals].slice(0, 200)
        return { signals: next }
      })
      // trigger global event for audio/confetti
      window.dispatchEvent(new CustomEvent('signal-fired', { detail: res.signal }))
    }
  },

  handleDepth: (d) => {
    const raw = calcOBIRaw(d, 20)
    obiValue = updateOBI(obiValue, raw, 0.2)
    // throttle not needed for depth alone? we update metrics lightly but not engine unless trade also
    // Update metrics obi part for UI without full recompute to keep bar live
    const now = Date.now()
    if (now - lastThrottle < 100) return
    const s = get()
    set({
      metrics: { ...s.metrics, obi: obiValue, obiRaw: raw }
    })
  },

  handleMark: (price, ts) => {
    // treat as price update for candle and velocity if no trades
    priceHistory.push({ price, ts })
    if (priceHistory.length > 500) priceHistory.shift()
    updateCandle(price, ts)
    const now = Date.now()
    if (now - lastThrottle < 100) return
    lastThrottle = now

    // recompute velocity even without trade
    velocityValue = calcVelocity(priceHistory, velocityValue)
    velocityHistory.push(velocityValue)
    if (velocityHistory.length > 100) velocityHistory.shift()
    const velocityZ = calcVelocityZ(velocityHistory)

    const trades = tradeBuffer.toArray()
    const cvdNorm = trades.length > 0 ? calcCVDNorm(trades, 60, ts) : (cvdNormHistory[cvdNormHistory.length - 1] ?? 0)
    if (trades.length > 0) {
      // already pushed in handleTrade case, but for mark we don't have new trade, keep history
    }
    const cvdZ = calcCVDZ(cvdNormHistory)
    const divergenceAdj = detectDivergence(priceHistory, cvdNormHistory, 20)
    const settings = getSettings()
    const weights = normalizeWeights(settings.weights || { w1: 0.4, w2: 0.3, w3: 0.3 })
    const score = computeScore(cvdZ, obiValue, velocityZ, weights, divergenceAdj)

    engine.updateConfig({ threshold: settings.threshold ?? 0.6, cooldownMs: (settings.cooldown ?? 15) * 1000 })
    const res = engine.tick({ score, price, breakdown: { cvd: cvdZ, obi: obiValue, vel: velocityZ }, weights, ts })

    const metrics: Metrics = {
      cvd: 0,
      cvdNorm,
      cvdZ,
      obi: obiValue,
      obiRaw: obiValue,
      velocity: velocityValue,
      velocityZ,
      score,
      price
    }

    const allCandles = currentCandle ? [...candles, currentCandle] : [...candles]

    set({
      price,
      metrics,
      engineState: res.state,
      lastUpdate: ts,
      candles: allCandles
    })

    if (res.signal) {
      set((s) => ({ signals: [res.signal!, ...s.signals].slice(0, 200) }))
      window.dispatchEvent(new CustomEvent('signal-fired', { detail: res.signal }))
    }
  },

  reset: () => {
    tradeBuffer.clear()
    priceHistory.length = 0
    cvdNormHistory.length = 0
    velocityHistory.length = 0
    obiValue = 0
    velocityValue = 0
    engine.reset()
    candles.length = 0
    currentCandle = null
    set({
      price: 0,
      metrics: { cvd: 0, cvdNorm: 0, cvdZ: 0, obi: 0, obiRaw: 0, velocity: 0, velocityZ: 0, score: 0, price: 0 },
      engineState: 'IDLE',
      signals: [],
      candles: [],
      cvd: 0,
      lastUpdate: 0
    })
  }
}))

// Expose engine for tests
export const _internal = {
  tradeBuffer,
  priceHistory,
  cvdNormHistory,
  velocityHistory,
  get obiValue() { return obiValue },
  set obiValue(v) { obiValue = v },
  get velocityValue() { return velocityValue },
  set velocityValue(v) { velocityValue = v },
  engine,
  resetInternal() {
    tradeBuffer.clear()
    priceHistory.length = 0
    cvdNormHistory.length = 0
    velocityHistory.length = 0
    obiValue = 0
    velocityValue = 0
    engine.reset()
    candles.length = 0
    currentCandle = null
    lastThrottle = 0
  }
}
