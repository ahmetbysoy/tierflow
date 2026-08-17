import { create } from 'zustand'
import { RingBuffer } from '../core/buffers/ringBuffer'
import { calcCVDNorm, calcCVDZ, detectDivergence } from '../core/indicators/cvd'
import { updateOBI } from '../core/indicators/imbalance'
import { calcVelocity, calcVelocityZ } from '../core/indicators/velocity'
import { SignalEngine, computeScore, normalizeWeights } from '../core/signal/engine'
import { aggregateScore } from '../core/signal/scoreAggregator'
import { applyFilters } from '../core/signal/filters'
import { globalTracker } from '../core/performance/signalTracker'
import { OrderBookDiff } from '../core/book/orderBookDiff'
import { VPIN } from '../core/indicators/vpin'
import { FlowEngine } from '../core/flow/flowEngine'
import { DetectorSuite } from '../core/detectors/detectorSuite'
import { TradePlanGenerator } from '../core/signal/tradePlan'
import { PaperTradingEngine } from '../core/paper/paperTrading'
import { CrossExchangePoller } from '../core/crossExchange/crossExchange'
import type { NormalizedTrade, NormalizedDepth, Candle, Signal, Metrics } from '../types'
import type { Tracker } from '../core/performance/signalTracker'
import type { FlowCandle } from '../core/flow/flowEngine'
import type { MicroSignal, TradePlan } from '../core/signal/tradePlan'

interface DataState {
  price: number
  priceStr: string
  metrics: Metrics
  engineState: 'IDLE' | 'ARMED' | 'FIRED' | 'COOLDOWN'
  signals: Signal[]
  detectorSignals: MicroSignal[]
  candles: Candle[]
  flowCandles: FlowCandle[]
  plan: TradePlan | null
  cvd: number
  lastUpdate: number
  trackers: Tracker[]
  stats: ReturnType<typeof globalTracker.getStats>
  handleTrade: (t: NormalizedTrade) => void
  handleDepth: (d: NormalizedDepth) => void
  handleMark: (price: number, ts: number, priceStr?: string) => void
  reset: () => void
}

// Internal singletons
const tradeBuffer = new RingBuffer<NormalizedTrade>(1000)
const priceHistory: { price: number; ts: number }[] = []
const cvdNormHistory: number[] = []
const velocityHistory: number[] = []
let obiValue = 0
let velocityValue = 0
let microPrice = 0
let microDev = 0
let vpinValue = 0
let vpinLabel: string = 'Low'
let engine = new SignalEngine({ threshold: 0.75, cooldownMs: 18000, hysteresis: 0.35 })
let lastThrottle = 0
let currentCandle: Candle | null = null
const candles: Candle[] = []

// OrderBook, VPIN, FlowEngine, DetectorSuite, TradePlan and PaperTrading instances (module-level singletons)
const orderBook = new OrderBookDiff({ maxLevels: 50, heatmapWindowSec: 30 })
const vpin = new VPIN({ maxBuckets: 50, tradeLookback: 200, minBucketNotional: 100000 })
const flowEngine = new FlowEngine({ mode: 'time', timeframeMs: 5000, volumeTarget: 1_000_000, maxCandles: 80 })
const detectorSuite = new DetectorSuite()
const tradePlanGenerator = new TradePlanGenerator({ minRR: 2.5, kellyFraction: 0.35, balance: 1000, riskPct: 2, maxLeverage: 20, feeRateBps: 4, minConfidence: 60 })
const paperTradingEngine = new PaperTradingEngine({ cooldownMs: 30000, maxPositions: 3, maxClosedHistory: 500, maxEquityLength: 300 })
const crossExchangePoller = new CrossExchangePoller({ intervalMs: 3000, timeoutMs: 5000, enabled: ['bybit', 'okx', 'mexc'] })
let spreadValue = 0

// CrossExchangePoller singleton start (4. singleton)
if (typeof window !== 'undefined') {
  crossExchangePoller.start('BTCUSDT')
}

function getSettings(): { weights: { w1:number; w2:number; w3:number; w4:number; w5:number; w6:number }; threshold:number; cooldown:number; paperTradingEnabled:boolean } {
  try {
    const raw = localStorage.getItem('signal-radar-settings')
    if (raw) {
      const parsed = JSON.parse(raw)
      const state = parsed.state ?? parsed
      return {
        weights: state.weights ?? { w1: 0.30, w2: 0.18, w3: 0.13, w4: 0.16, w5: 0.10, w6: 0.13 },
        threshold: state.threshold ?? 0.75,
        cooldown: state.cooldown ?? 18,
        paperTradingEnabled: state.paperTradingEnabled ?? false
      }
    }
  } catch {}
  return { weights: { w1: 0.30, w2: 0.18, w3: 0.13, w4: 0.16, w5: 0.10, w6: 0.13 }, threshold: 0.75, cooldown: 18, paperTradingEnabled: false }
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

function computeMicroDev(depth: NormalizedDepth): { microprice: number; microDev: number; mid: number; spread: number } {
  if (depth.bids.length === 0 || depth.asks.length === 0) return { microprice: 0, microDev: 0, mid: 0, spread: 0 }
  const bestBid = depth.bids[0][0]
  const bestAsk = depth.asks[0][0]
  const bidQty = depth.bids[0][1]
  const askQty = depth.asks[0][1]
  const mid = (bestBid + bestAsk) / 2
  const spread = bestAsk - bestBid
  const microprice = (bestAsk * bidQty + bestBid * askQty) / (bidQty + askQty || 1)
  const microDev = spread > 0 ? (microprice - mid) / (spread / 2) : 0 // -1..+1
  return { microprice, microDev, mid, spread }
}

export const useDataStore = create<DataState>((set, get) => ({
  price: 0,
  priceStr: "",
  metrics: { cvd: 0, cvdNorm: 0, cvdZ: 0, obi: 0, obiRaw: 0, velocity: 0, velocityZ: 0, microprice: 0, microDev: 0, vpin: 0, vpinLabel: 'Low', score: 0, price: 0, priceStr: "" },
  engineState: 'IDLE',
  signals: [],
  detectorSignals: [],
  candles: [],
  flowCandles: [],
  plan: null,
  cvd: 0,
  lastUpdate: 0,
  trackers: [],
  stats: globalTracker.getStats(),

  handleTrade: (t) => {
    const now = Date.now()
    const priceStr = (t as any).priceStr || String(t.price)
    globalTracker.updatePrice(t.price, t.ts)

    // VPIN update
    const notional = t.price * t.qty
    const allTrades = tradeBuffer.toArray().map(x => ({ notional: x.price * x.qty }))
    const vpinState = vpin.update({ price: t.price, qty: t.qty, side: t.side, notional }, allTrades)
    vpinValue = vpinState.value
    vpinLabel = vpinState.label

    // FlowEngine bucket update (every trade)
    flowEngine.updateBucket({ price: t.price, notional, side: t.side, ts: t.ts })

    if (now - lastThrottle < 100) {
      tradeBuffer.push(t)
      priceHistory.push({ price: t.price, ts: t.ts })
      if (priceHistory.length > 500) priceHistory.shift()
      updateCandle(t.price, t.ts)
      set({ trackers: globalTracker.getAll(), stats: globalTracker.getStats(), price: t.price, priceStr, lastUpdate: t.ts, metrics: { ...get().metrics, vpin: vpinValue, vpinLabel, price: t.price, priceStr }, flowCandles: flowEngine.getCandles() })
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
    const weights = normalizeWeights(settings.weights || { w1: 0.30, w2: 0.18, w3: 0.13, w4: 0.16, w5: 0.10, w6: 0.13 })
    const vpinAdj = (cvdZ >= 0 ? 1 : -1) * (vpinValue - 0.3) * 0.4
    const detRaw = tradePlanGenerator.scoreSignals()
    const agg = aggregateScore({ cvdZ, obi: obiValue, velocityZ, microDev, vpinAdj, detectorBull: detRaw.bull, detectorBear: detRaw.bear, divergenceAdj }, weights as any, divergenceAdj)
    const detectorScore = agg.detectorScore
    const score = agg.score

    const crossSpread = crossExchangePoller.getMaxSpread()
    const crossSpreadPct = crossSpread.spread && t.price ? (crossSpread.spread / t.price) * 100 : 0
    const filter = applyFilters({ priceHistory, cvdZ, obi: obiValue, velZ: velocityZ, score, spreadPct: crossSpreadPct })
    // Extra VPIN toxicity filter: if Toxic and score <1.0, suppress
    const vpinToxicBlock = vpinLabel === 'Toxic' && Math.abs(score) < 1.0
    const shouldSuppress = !filter.pass || vpinToxicBlock

    engine.updateConfig({ threshold: settings.threshold ?? 0.75, cooldownMs: (settings.cooldown ?? 18) * 1000, hysteresis: 0.35 })
    let res = engine.tick({
      score,
      price: t.price,
      breakdown: { cvd: cvdZ, obi: obiValue, vel: velocityZ, micro: microDev, vpin: vpinValue, detector: detectorScore },
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
      microprice: microPrice,
      microDev,
      vpin: vpinValue,
      vpinLabel,
      score,
      price: t.price,
      priceStr
    }

    const allCandles = currentCandle ? [...candles, currentCandle] : [...candles]

    set({
      price: t.price,
      priceStr,
      metrics,
      engineState: res.state,
      lastUpdate: t.ts,
      candles: allCandles,
      flowCandles: flowEngine.getCandles(),
      cvd: cvdNorm,
      trackers: globalTracker.getAll(),
      stats: globalTracker.getStats()
    })

    if (res.signal) {
      const sigWithStr = { ...res.signal, priceStr } as any
      globalTracker.addSignal(sigWithStr)
      set((s) => {
        const next = [sigWithStr, ...s.signals].slice(0, 200)
        return { signals: next, trackers: globalTracker.getAll(), stats: globalTracker.getStats(), flowCandles: flowEngine.getCandles() }
      })
      window.dispatchEvent(new CustomEvent('signal-fired', { detail: sigWithStr }))
    } else {
      set({ trackers: globalTracker.getAll(), stats: globalTracker.getStats(), flowCandles: flowEngine.getCandles() })
    }

    // TradePlanGenerator: every handleTrade, generate plan
    try {
      const perf: any = globalTracker.getStats()
      const trades = perf.count ?? 0
      const wins = Math.round((perf.count ?? 0) * (perf.win60s ?? 0.5))
      const walls = detectorSuite.getWalls()
      const wallEntries = {
        bid: walls.bid.map((w: any) => ({ price: w.price, qty: w.qty, notional: w.notional, persistence: w.persistence })),
        ask: walls.ask.map((w: any) => ({ price: w.price, qty: w.qty, notional: w.notional, persistence: w.persistence }))
      }
      const plan = tradePlanGenerator.generateTradePlan(t.price, spreadValue, wallEntries as any, { trades, wins })
      set({ plan } as any)
      // Paper trading only if enabled (default off) — canlı akışı gerçek trade sanma
      const settingsPaper = getSettings()
      if (settingsPaper.paperTradingEnabled) {
        const positionSize = tradePlanGenerator.getPositionSize()
        if (plan && positionSize) {
          const book = orderBook.getBook()
          const bookDepth = [...book.bids.slice(0, 10), ...book.asks.slice(0, 10)].reduce((a: number, b: any) => a + (b.qty || 0), 0) || 100
          paperTradingEngine.simulateFromPlan(plan, positionSize, bookDepth, t.price)
        }
        paperTradingEngine.update(t.price)
      }
    } catch {}
  },

  handleDepth: (d) => {
    // OrderBookDiff tek OBI kaynağı (imbalance.ts'teki calcOBIRaw ikame)
    let micro: any = null
    try {
      orderBook.applyDiff({ bids: d.bids, asks: d.asks, eventTime: d.ts })
      const m = orderBook.recompute()
      if (m) {
        microPrice = m.microprice
        micro = m
        const mid = m.mid
        const spread = m.spread
        spreadValue = spread
        microDev = spread > 0 ? (m.microprice - mid) / (spread / 2) : 0
        // Tek OBI kaynağı: OrderBookDiff (EMA ile yumuşat)
        const raw = m.obi
        obiValue = updateOBI(obiValue, raw, 0.2)
      }
    } catch {}
    // OBI artık tek kaynak: OrderBookDiff.recompute().obi (calcOBIRaw tamamen ikame)
    // Fallback sadece ilk snapshot öncesi için, normalde micro her zaman dolu
    if (!micro) {
      // Henüz orderBook hazır değil, obiValue'yu güncelleme, sadece spread'i ayarla
      if (d.bids.length && d.asks.length) {
        const spread = d.asks[0][0] - d.bids[0][0]
        spreadValue = spread
      }
      const now2 = Date.now()
      if (now2 - lastThrottle < 100) return
      const s2 = get()
      set({
        metrics: { ...s2.metrics, obi: obiValue, obiRaw: obiValue, microprice: microPrice, microDev, vpin: vpinValue, vpinLabel },
        trackers: globalTracker.getAll(),
        stats: globalTracker.getStats(),
        flowCandles: flowEngine.getCandles()
      })
      return
    } else if (microPrice === 0) {
      spreadValue = micro.spread
    }
    // raw for metrics display (ham OBI)
    const rawForMetrics = micro ? micro.obi : obiValue

    // DetectorSuite update (after recompute)
    try {
      detectorSuite.setData({
        book: orderBook.getBook(),
        micro: micro ? { obi: micro.obi ?? obiValue, bestBid: micro.bestBid, bestAsk: micro.bestAsk, spread: micro.spread, mid: micro.mid } : null,
        lastPrice: priceHistory[priceHistory.length - 1]?.price ?? d.bids[0]?.[0] ?? 0,
        vpinValue,
        flowCandles: flowEngine.getCandles(),
        cvdHistory: cvdNormHistory.map(v => ({ ts: Date.now(), value: v })),
        trades: tradeBuffer.toArray().map(t => ({ price: t.price, notional: t.price * t.qty, side: t.side }))
      })
      detectorSuite.run()
    } catch {}

    const now = Date.now()
    if (now - lastThrottle < 100) return
    const s = get()
    set({
      metrics: { ...s.metrics, obi: obiValue, obiRaw: rawForMetrics, microprice: microPrice, microDev, vpin: vpinValue, vpinLabel },
      trackers: globalTracker.getAll(),
      stats: globalTracker.getStats(),
      flowCandles: flowEngine.getCandles()
    })
  },

  handleMark: (price, ts, priceStr) => {
    const markPriceStr = priceStr || String(price)
    globalTracker.updatePrice(price, ts)
    priceHistory.push({ price, ts })
    if (priceHistory.length > 500) priceHistory.shift()
    updateCandle(price, ts)
    const now = Date.now()
    if (now - lastThrottle < 100) {
      set({ trackers: globalTracker.getAll(), stats: globalTracker.getStats(), price, priceStr: markPriceStr, lastUpdate: ts, metrics: { ...get().metrics, vpin: vpinValue, vpinLabel, price, priceStr: markPriceStr }, flowCandles: flowEngine.getCandles() })
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
    const weights = normalizeWeights(settings.weights || { w1: 0.30, w2: 0.18, w3: 0.13, w4: 0.16, w5: 0.10, w6: 0.13 })
    const vpinAdj = (cvdZ >= 0 ? 1 : -1) * (vpinValue - 0.3) * 0.4
    const detRaw = tradePlanGenerator.scoreSignals()
    const agg = aggregateScore({ cvdZ, obi: obiValue, velocityZ, microDev, vpinAdj, detectorBull: detRaw.bull, detectorBear: detRaw.bear, divergenceAdj }, weights as any, divergenceAdj)
    const detectorScore = agg.detectorScore
    const score = agg.score

    const crossSpreadM = crossExchangePoller.getMaxSpread()
    const crossSpreadPctM = crossSpreadM.spread && price ? (crossSpreadM.spread / price) * 100 : 0
    const filter = applyFilters({ priceHistory, cvdZ, obi: obiValue, velZ: velocityZ, score, spreadPct: crossSpreadPctM })
    const vpinToxicBlock = vpinLabel === 'Toxic' && Math.abs(score) < 1.0
    const shouldSuppress = !filter.pass || vpinToxicBlock

    engine.updateConfig({ threshold: settings.threshold ?? 0.75, cooldownMs: (settings.cooldown ?? 18) * 1000, hysteresis: 0.35 })
    let res = engine.tick({ score, price, breakdown: { cvd: cvdZ, obi: obiValue, vel: velocityZ, micro: microDev, vpin: vpinValue, detector: detectorScore }, weights, ts })
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
      microprice: microPrice,
      microDev,
      vpin: vpinValue,
      vpinLabel,
      score,
      price,
      priceStr: markPriceStr
    }

    const allCandles = currentCandle ? [...candles, currentCandle] : [...candles]

    set({
      price,
      priceStr: markPriceStr,
      metrics,
      engineState: res.state,
      lastUpdate: ts,
      candles: allCandles,
      flowCandles: flowEngine.getCandles(),
      trackers: globalTracker.getAll(),
      stats: globalTracker.getStats()
    })

    if (res.signal) {
      // Signal priceStr should be markPriceStr
      const sigWithStr = { ...res.signal, priceStr: markPriceStr }
      globalTracker.addSignal(sigWithStr as any)
      set((s) => ({ signals: [sigWithStr as any, ...s.signals].slice(0, 200), trackers: globalTracker.getAll(), stats: globalTracker.getStats(), flowCandles: flowEngine.getCandles() }))
      window.dispatchEvent(new CustomEvent('signal-fired', { detail: sigWithStr }))
    } else {
      set({ trackers: globalTracker.getAll(), stats: globalTracker.getStats(), flowCandles: flowEngine.getCandles() })
    }
    // Paper trading update on mark price (only if enabled)
    try {
      const sPaper = getSettings()
      if (sPaper.paperTradingEnabled) {
        paperTradingEngine.update(price)
      }
    } catch {}
  },

  reset: () => {
    tradeBuffer.clear()
    priceHistory.length = 0
    cvdNormHistory.length = 0
    velocityHistory.length = 0
    obiValue = 0
    velocityValue = 0
    microPrice = 0
    microDev = 0
    vpinValue = 0
    vpinLabel = 'Low'
    spreadValue = 0
    orderBook.reset()
    vpin.reset()
    flowEngine.reset()
    detectorSuite.reset()
    tradePlanGenerator.reset()
    paperTradingEngine.reset()
    crossExchangePoller.reset()
    engine.reset()
    globalTracker.clear()
    candles.length = 0
    currentCandle = null
    set({
      price: 0,
      priceStr: "",
      metrics: { cvd: 0, cvdNorm: 0, cvdZ: 0, obi: 0, obiRaw: 0, velocity: 0, velocityZ: 0, microprice: 0, microDev: 0, vpin: 0, vpinLabel: 'Low', score: 0, price: 0, priceStr: "" },
      engineState: 'IDLE',
      signals: [],
      detectorSignals: [],
      candles: [],
      flowCandles: [],
      plan: null,
      cvd: 0,
      lastUpdate: 0,
      trackers: [],
      stats: globalTracker.getStats()
    })
  }
}))

// DetectorSuite -> separate detectorSignals list (karıştırma) + TradePlanGenerator feed
detectorSuite.on('signal:add', (sig: any) => {
  try {
    const microSignal: MicroSignal = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${sig.type}`,
      type: sig.type,
      bias: sig.bias,
      confidence: sig.confidence,
      description: sig.description,
      price: sig.price,
      evidence: sig.evidence || {},
      ts: Date.now(),
      decay: 1,
      expiresAt: Date.now() + 60000
    }
    useDataStore.setState((state: any) => ({
      detectorSignals: [microSignal, ...state.detectorSignals].slice(0, 200)
    }))
  } catch {}
  try {
    tradePlanGenerator.addSignal(sig)
  } catch {}
})

// 250ms interval for FlowEngine tick (reconnect/tab visibility'ye dokunma)
if (typeof window !== 'undefined') {
  setInterval(() => {
    const lastPrice = priceHistory[priceHistory.length - 1]?.price ?? 0
    if (lastPrice) {
      flowEngine.tick(lastPrice)
      // Update store flowCandles without touching other state
      try {
        useDataStore.setState({ flowCandles: flowEngine.getCandles() } as any)
      } catch {}
    }
  }, 250)
}

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
  get microDev() { return microDev },
  set microDev(v) { microDev = v },
  get vpinValue() { return vpinValue },
  set vpinValue(v) { vpinValue = v },
  get vpinLabel() { return vpinLabel },
  set vpinLabel(v) { vpinLabel = v },
  get spreadValue() { return spreadValue },
  set spreadValue(v) { spreadValue = v },
  orderBook,
  vpin,
  flowEngine,
  detectorSuite,
  tradePlanGenerator,
  paperTradingEngine,
  crossExchangePoller,
  engine,
  tracker: globalTracker,
  resetInternal() {
    tradeBuffer.clear()
    priceHistory.length = 0
    cvdNormHistory.length = 0
    velocityHistory.length = 0
    obiValue = 0
    velocityValue = 0
    microPrice = 0
    microDev = 0
    vpinValue = 0
    vpinLabel = 'Low'
    spreadValue = 0
    orderBook.reset()
    vpin.reset()
    flowEngine.reset()
    detectorSuite.reset()
    tradePlanGenerator.reset()
    paperTradingEngine.reset()
    crossExchangePoller.reset()
    engine.reset()
    globalTracker.clear()
    candles.length = 0
    currentCandle = null
    lastThrottle = 0
  }
}
