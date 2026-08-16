import { create } from 'zustand'
import { RingBuffer } from '../core/buffers/ringBuffer'
import { calcCVDNorm, calcCVDZ, detectDivergence } from '../core/indicators/cvd'
import { calcOBIRaw, updateOBI } from '../core/indicators/imbalance'
import { calcVelocity, calcVelocityZ } from '../core/indicators/velocity'
import { SignalEngine, computeScore, normalizeWeights } from '../core/signal/engine'
import { applyFilters } from '../core/signal/filters'
import { globalTracker } from '../core/performance/signalTracker'
import type { NormalizedTrade, NormalizedDepth, Candle, Signal, Metrics } from '../types'
import type { Tracker } from '../core/performance/signalTracker'

interface DataState {
  price: number
  metrics: Metrics
  engineState: 'IDLE' | 'ARMED' | 'FIRED' | 'COOLDOWN'
  signals: Signal[]
  candles: Candle[]
  cvd: number
  lastUpdate: number
  trackers: Tracker[]
  stats: ReturnType<typeof globalTracker.getStats>
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
let engine = new SignalEngine({ threshold: 0.75, cooldownMs: 18000, hysteresis: 0.35 })
let lastThrottle = 0
let currentCandle: Candle | null = null
const candles: Candle[] = []

function getSettings() {
  try {
    const raw = localStorage.getItem('signal-radar-settings')
    if (raw) return JSON.parse(raw)
  } catch {}
  return { weights: { w1: 0.5, w2: 0.3, w3: 0.2 }, threshold: 0.75, cooldown: 18 }
}

function updateCandle(price: number, ts: number) {
  const interval = 15
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
}

export const useDataStore = create<DataState>((set, get) => ({
  price: 0,
  metrics: { cvd: 0, cvdNorm: 0, cvdZ: 0, obi: 0, obiRaw: 0, velocity: 0, velocityZ: 0, score: 0, price: 0 },
  engineState: 'IDLE',
  signals: [],
  candles: [],
  cvd: 0,
  lastUpdate: 0,
  trackers: [],
  stats: globalTracker.getStats(),

  handleTrade: (t) => {
    const now = Date.now()
    // Always update tracker live PnL (even if throttled)
    globalTracker.updatePrice(t.price, t.ts)

    if (now - lastThrottle < 100) {
      tradeBuffer.push(t)
      priceHistory.push({ price: t.price, ts: t.ts })
      if (priceHistory.length > 500) priceHistory.shift()
      updateCandle(t.price, t.ts)
      // update trackers in store even when throttled (for live)
      set({ trackers: globalTracker.getAll(), stats: globalTracker.getStats(), price: t.price, lastUpdate: t.ts })
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

    velocityValue = calcVelocity(priceHistory, velocityValue)
    velocityHistory.push(velocityValue)
    if (velocityHistory.length > 100) velocityHistory.shift()
    const velocityZ = calcVelocityZ(velocityHistory)

    const settings = getSettings()
    const weights = normalizeWeights(settings.weights || { w1: 0.5, w2: 0.3, w3: 0.2 })
    const score = computeScore(cvdZ, obiValue, velocityZ, weights, divergenceAdj)

    const filter = applyFilters({ priceHistory, cvdZ, obi: obiValue, velZ: velocityZ, score })
    const shouldSuppress = !filter.pass

    engine.updateConfig({ threshold: settings.threshold ?? 0.75, cooldownMs: (settings.cooldown ?? 18) * 1000, hysteresis: 0.35 })
    let res = engine.tick({
      score,
      price: t.price,
      breakdown: { cvd: cvdZ, obi: obiValue, vel: velocityZ },
      weights,
      ts: t.ts
    })
    if (shouldSuppress && res.signal) {
      res = { ...res, signal: null }
      if (res.state === 'ARMED' || res.state === 'FIRED') {
        res.state = 'IDLE' as any
      }
    }

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
      cvd: cvdNorm,
      trackers: globalTracker.getAll(),
      stats: globalTracker.getStats()
    })

    if (res.signal) {
      globalTracker.addSignal(res.signal)
      set((s) => {
        const next = [res.signal!, ...s.signals].slice(0, 200)
        return { signals: next, trackers: globalTracker.getAll(), stats: globalTracker.getStats() }
      })
      window.dispatchEvent(new CustomEvent('signal-fired', { detail: res.signal }))
    } else {
      // update trackers even when no new signal (for MFE/MAE)
      set({ trackers: globalTracker.getAll(), stats: globalTracker.getStats() })
    }
  },

  handleDepth: (d) => {
    const raw = calcOBIRaw(d, 20)
    obiValue = updateOBI(obiValue, raw, 0.2)
    const now = Date.now()
    if (now - lastThrottle < 100) return
    const s = get()
    set({
      metrics: { ...s.metrics, obi: obiValue, obiRaw: raw },
      trackers: globalTracker.getAll(),
      stats: globalTracker.getStats()
    })
  },

  handleMark: (price, ts) => {
    globalTracker.updatePrice(price, ts)
    priceHistory.push({ price, ts })
    if (priceHistory.length > 500) priceHistory.shift()
    updateCandle(price, ts)
    const now = Date.now()
    if (now - lastThrottle < 100) {
      set({ trackers: globalTracker.getAll(), stats: globalTracker.getStats(), price, lastUpdate: ts })
      return
    }
    lastThrottle = now

    velocityValue = calcVelocity(priceHistory, velocityValue)
    velocityHistory.push(velocityValue)
    if (velocityHistory.length > 100) velocityHistory.shift()
    const velocityZ = calcVelocityZ(velocityHistory)

    const trades = tradeBuffer.toArray()
    const cvdNorm = trades.length > 0 ? calcCVDNorm(trades, 60, ts) : (cvdNormHistory[cvdNormHistory.length - 1] ?? 0)
    const cvdZ = calcCVDZ(cvdNormHistory)
    const divergenceAdj = detectDivergence(priceHistory, cvdNormHistory, 20)
    const settings = getSettings()
    const weights = normalizeWeights(settings.weights || { w1: 0.5, w2: 0.3, w3: 0.2 })
    const score = computeScore(cvdZ, obiValue, velocityZ, weights, divergenceAdj)

    const filter = applyFilters({ priceHistory, cvdZ, obi: obiValue, velZ: velocityZ, score })
    const shouldSuppress = !filter.pass

    engine.updateConfig({ threshold: settings.threshold ?? 0.75, cooldownMs: (settings.cooldown ?? 18) * 1000, hysteresis: 0.35 })
    let res = engine.tick({ score, price, breakdown: { cvd: cvdZ, obi: obiValue, vel: velocityZ }, weights, ts })
    if (shouldSuppress && res.signal) {
      res = { ...res, signal: null }
      if (res.state === 'ARMED' || res.state === 'FIRED') {
        res.state = 'IDLE' as any
      }
    }

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
      candles: allCandles,
      trackers: globalTracker.getAll(),
      stats: globalTracker.getStats()
    })

    if (res.signal) {
      globalTracker.addSignal(res.signal)
      set((s) => ({ signals: [res.signal!, ...s.signals].slice(0, 200), trackers: globalTracker.getAll(), stats: globalTracker.getStats() }))
      window.dispatchEvent(new CustomEvent('signal-fired', { detail: res.signal }))
    } else {
      set({ trackers: globalTracker.getAll(), stats: globalTracker.getStats() })
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
    globalTracker.clear()
    candles.length = 0
    currentCandle = null
    set({
      price: 0,
      metrics: { cvd: 0, cvdNorm: 0, cvdZ: 0, obi: 0, obiRaw: 0, velocity: 0, velocityZ: 0, score: 0, price: 0 },
      engineState: 'IDLE',
      signals: [],
      candles: [],
      cvd: 0,
      lastUpdate: 0,
      trackers: [],
      stats: globalTracker.getStats()
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
  tracker: globalTracker,
  resetInternal() {
    tradeBuffer.clear()
    priceHistory.length = 0
    cvdNormHistory.length = 0
    velocityHistory.length = 0
    obiValue = 0
    velocityValue = 0
    engine.reset()
    globalTracker.clear()
    candles.length = 0
    currentCandle = null
    lastThrottle = 0
  }
}
