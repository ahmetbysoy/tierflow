/**
 * Detector Suite — extracted from BOZOK_PRO
 * 9 microstructure detectors: Walls, Compression, Skew, Liquidity Void,
 * Ladder, Spoofing, Iceberg, Flow Patterns, Liquidation Cluster.
 */

import type { BookLevel, OrderBook } from '../book/orderBookDiff'
import type { FlowCandle } from '../flow/flowEngine'
import type { MicroSignal } from '../signal/tradePlan'

// ── Types ────────────────────────────────────────────────

export interface WallTrack {
  key: string
  price: number
  qty: number
  notional: number
  firstSeen: number
  lastSeen: number
  persistence: number
  refreshCount: number
  lastQty: number
}

export interface DetectorState {
  walls: { bid: WallTrack[]; ask: WallTrack[] }
  compressionActive: boolean
  ladderCount: number
  spoofCandidates: WallTrack[]
  icebergZones: { key: string; price: number; firstSeen: number; score: number }[]
  lastSpoofCheck: number
}

export interface DetectorConfig {
  wallMultiplier: number
  wallNotionalMultiplier: number
  minConfidence: number
  spoofWindowSec: number
}

export interface Liquidation {
  side: string
  price: number
  qty: number
  notional: number
  ts: number
}

// ── Utilities ─────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

function mean(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
}

function median(arr: number[]): number {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function fmtPrice(p: number): string {
  if (!isFinite(p)) return '--'
  if (p >= 1000) return p.toFixed(2)
  if (p >= 1) return p.toFixed(4)
  return p.toFixed(6)
}

function fmtQty(q: number): string {
  if (!isFinite(q)) return '--'
  if (q >= 1000) return (q / 1000).toFixed(2) + 'K'
  if (q >= 1) return q.toFixed(3)
  return q.toFixed(5)
}

function fmtNotional(n: number): string {
  if (!isFinite(n)) return '--'
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return n.toFixed(0)
}

function priceToKey(p: number): string {
  if (!isFinite(p)) return String(p)
  if (p >= 1000) return p.toFixed(2)
  if (p >= 10) return p.toFixed(3)
  if (p >= 1) return p.toFixed(4)
  if (p >= 0.1) return p.toFixed(5)
  if (p >= 0.01) return p.toFixed(6)
  if (p >= 0.001) return p.toFixed(7)
  if (p >= 0.0001) return p.toFixed(8)
  return p.toFixed(10)
}

// ── DetectorSuite ─────────────────────────────────────────

export class DetectorSuite {
  private state: DetectorState
  private config: DetectorConfig
  private listeners: Map<string, Set<Function>> = new Map()

  // External data injected via setters
  private book: OrderBook | null = null
  private micro: { obi: number; bestBid: number; bestAsk: number; spread: number; mid: number } | null = null
  private vpinValue = 0
  private lastPrice = 0
  private flowCandles: FlowCandle[] = []
  private cvdHistory: { ts: number; value: number }[] = []
  private liquidations: Liquidation[] = []
  private trades: { price: number; notional: number; side: string }[] = []

  constructor(config?: Partial<DetectorConfig>) {
    this.config = {
      wallMultiplier: 3.0,
      wallNotionalMultiplier: 3.0,
      minConfidence: 60,
      spoofWindowSec: 3,
      ...config
    }
    this.state = {
      walls: { bid: [], ask: [] },
      compressionActive: false,
      ladderCount: 0,
      spoofCandidates: [],
      icebergZones: [],
      lastSpoofCheck: 0
    }
  }

  on(event: string, fn: Function): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    this.listeners.get(event)!.add(fn)
    return () => this.listeners.get(event)?.delete(fn)
  }

  private emit(event: string, data?: unknown): void {
    const set = this.listeners.get(event)
    if (!set) return
    for (const fn of [...set]) {
      try { fn(data) } catch (e) { console.error(e) }
    }
  }

  /** Update external data references (call before run()). */
  setData(params: {
    book: OrderBook
    micro: { obi: number; bestBid: number; bestAsk: number; spread: number; mid: number } | null
    lastPrice: number
    vpinValue?: number
    flowCandles?: FlowCandle[]
    cvdHistory?: { ts: number; value: number }[]
    liquidations?: Liquidation[]
    trades?: { price: number; notional: number; side: string }[]
  }): void {
    this.book = params.book
    this.micro = params.micro
    this.lastPrice = params.lastPrice
    if (params.vpinValue !== undefined) this.vpinValue = params.vpinValue
    if (params.flowCandles) this.flowCandles = params.flowCandles
    if (params.cvdHistory) this.cvdHistory = params.cvdHistory
    if (params.liquidations) this.liquidations = params.liquidations
    if (params.trades) this.trades = params.trades
  }

  /** Run all 9 detectors. Call on each book update. */
  run(): void {
    if (!this.book?.bids.length || !this.book?.asks.length) return
    this.detectWalls()
    this.detectCompression()
    this.detectSkew()
    this.detectLiquidityVoid()
    this.detectLadder()
    this.detectSpoofing()
    this.detectIceberg()
    this.detectFlowPatterns()
    this.detectLiquidationCluster()
  }

  // ── 1. Wall Detection ─────────────────────────────────
  private detectWalls(): void {
    const bids = this.book!.bids.slice(0, 15)
    const asks = this.book!.asks.slice(0, 15)
    if (bids.length < 5 || asks.length < 5) return

    const mult = this.config.wallMultiplier
    const notionalMult = this.config.wallNotionalMultiplier
    const avgBid = median(bids.map(x => x.qty))
    const avgAsk = median(asks.map(x => x.qty))
    const medianNotional = median([...bids, ...asks].map(x => x.notional))
    const notionalThreshold = Math.max(5_000, medianNotional * notionalMult)
    const nowTs = Date.now()

    const scan = (levels: BookLevel[], side: 'bid' | 'ask', avg: number): void => {
      for (const lv of levels) {
        if (lv.qty <= avg * mult) continue

        const key = lv.price.toFixed(8)
        const list = this.state.walls[side]
        let w = list.find(x => x.key === key)

        if (!w) {
          w = { key, price: lv.price, qty: lv.qty, notional: lv.notional, firstSeen: nowTs, lastSeen: nowTs, persistence: 1, refreshCount: 0, lastQty: lv.qty }
          list.push(w)
        } else {
          if (w.qty !== lv.qty) {
            w.refreshCount = (w.refreshCount || 0) + 1
          }
          w.qty = lv.qty
          w.notional = lv.notional
          w.lastSeen = nowTs
          w.lastQty = lv.qty
          w.persistence += 1
        }

        const ageMs = nowTs - w.firstSeen
        const confidence = clamp(
          55 + Math.min(25, w.persistence * 3) + Math.min(10, ageMs / 1000),
          55,
          95
        )

        if (lv.notional > notionalThreshold && confidence >= this.config.minConfidence) {
          this.emitSignal({
            type: side === 'bid' ? 'STRONG_BID_WALL' : 'STRONG_ASK_WALL',
            bias: side === 'bid' ? 'bullish' : 'bearish',
            confidence,
            description: `${side === 'bid' ? 'Güçlü bid wall' : 'Güçlü ask wall'} @ ${fmtPrice(lv.price)} — ${fmtQty(lv.qty)} (${fmtNotional(lv.notional)})`,
            price: lv.price,
            evidence: { qty: lv.qty, notional: lv.notional, persistence: w.persistence, ageMs }
          })
        }
      }
    }

    scan(bids, 'bid', avgBid)
    scan(asks, 'ask', avgAsk)

    // Prune walls not seen in last 5s
    this.state.walls.bid = this.state.walls.bid.filter(w => nowTs - w.lastSeen < 5000)
    this.state.walls.ask = this.state.walls.ask.filter(w => nowTs - w.lastSeen < 5000)
  }

  // ── 2. Compression Zone ──────────────────────────────
  private detectCompression(): void {
    if (!this.micro) return
    const { spread, mid } = this.micro
    const spreadPct = (spread / mid) * 100

    const bidWall = this.state.walls.bid.find(w => (mid - w.price) / mid < 0.01)
    const askWall = this.state.walls.ask.find(w => (w.price - mid) / mid < 0.01)

    if (bidWall && askWall && spreadPct < 0.05) {
      if (!this.state.compressionActive) {
        this.state.compressionActive = true
        this.emitSignal({
          type: 'COMPRESSION_ZONE',
          bias: 'warning',
          confidence: 72,
          description: `Sıkışma bölgesi: spread ${spreadPct.toFixed(4)}% — patlama yaklaşıyor`,
          price: mid,
          evidence: { spreadPct, obv: this.micro.obi + this.vpinValue }
        })
      }
    } else {
      this.state.compressionActive = false
    }
  }

  // ── 3. Skew Detection ────────────────────────────────
  private detectSkew(): void {
    const bids = this.book!.bids.slice(0, 10)
    const asks = this.book!.asks.slice(0, 10)
    if (bids.length < 10 || asks.length < 10) return

    const bidNotional = bids.reduce((a, b) => a + b.notional, 0)
    const askNotional = asks.reduce((a, b) => a + b.notional, 0)
    const total = bidNotional + askNotional
    if (!total) return

    const skew = (bidNotional - askNotional) / total
    if (Math.abs(skew) > 0.4) {
      this.emitSignal({
        type: 'BOOK_SKEW',
        bias: skew > 0 ? 'bullish' : 'bearish',
        confidence: clamp(50 + Math.abs(skew) * 50, 50, 85),
        description: `Book skew: ${skew > 0 ? 'Bid' : 'Ask'} ağırlıklı (${(Math.abs(skew) * 100).toFixed(1)}%)`,
        price: this.lastPrice,
        evidence: { skew, bidNotional, askNotional }
      })
    }
  }

  // ── 4. Liquidity Void ────────────────────────────────
  private detectLiquidityVoid(): void {
    const bids = this.book!.bids
    const asks = this.book!.asks
    if (bids.length < 10 || asks.length < 10) return

    const askGaps: number[] = []
    const bidGaps: number[] = []
    for (let i = 1; i < 10; i++) {
      askGaps.push(asks[i].price - asks[i - 1].price)
      bidGaps.push(bids[i - 1].price - bids[i].price)
    }
    const askAvg = mean(askGaps)
    const bidAvg = mean(bidGaps)

    // Ask-side void
    for (let i = 1; i < 10; i++) {
      const g = asks[i].price - asks[i - 1].price
      if (g > askAvg * 3 && asks[i].qty < median(asks.slice(0, 10).map(a => a.qty)) * 0.3) {
        this.emitSignal({
          type: 'LIQUIDITY_VOID_ASK',
          bias: 'bullish',
          confidence: 65,
          description: `Ask likidite boşluğu @ ${fmtPrice(asks[i].price)} — vacuum fill potansiyeli`,
          price: asks[i].price,
          evidence: { gapSize: g, avgGap: askAvg }
        })
        break
      }
    }

    // Bid-side void
    for (let i = 1; i < 10; i++) {
      const g = bids[i - 1].price - bids[i].price
      if (g > bidAvg * 3 && bids[i].qty < median(bids.slice(0, 10).map(a => a.qty)) * 0.3) {
        this.emitSignal({
          type: 'LIQUIDITY_VOID_BID',
          bias: 'bearish',
          confidence: 65,
          description: `Bid likidite boşluğu @ ${fmtPrice(bids[i].price)} — düşüş hızlanabilir`,
          price: bids[i].price,
          evidence: { gapSize: g, avgGap: bidAvg }
        })
        break
      }
    }
  }

  // ── 5. Ladder Detection ──────────────────────────────
  private detectLadder(): void {
    const walls = this.state.walls.bid
    if (walls.length < 3) return

    const sorted = [...walls].sort((a, b) => b.price - a.price)
    let ladderCount = 0

    for (let i = 0; i < sorted.length - 2; i++) {
      const g1 = sorted[i].price - sorted[i + 1].price
      const g2 = sorted[i + 1].price - sorted[i + 2].price
      if (g1 > 0 && g2 > 0 && Math.abs(g1 - g2) / g1 < 0.3) {
        ladderCount++
      }
    }

    if (ladderCount >= 1 && ladderCount > this.state.ladderCount) {
      this.state.ladderCount = ladderCount
      this.emitSignal({
        type: 'LADDER_BUILDING',
        bias: 'bullish',
        confidence: clamp(60 + ladderCount * 8, 60, 88),
        description: `Ladder yapısı: ${ladderCount + 2} düzenli bid wall — birikim sinyali`,
        price: sorted[0].price,
        evidence: { wallCount: ladderCount + 2 }
      })
    }
  }

  // ── 6. Spoofing Detection ────────────────────────────
  private detectSpoofing(): void {
    const nowTs = Date.now()
    if (nowTs - this.state.lastSpoofCheck < 500) return
    this.state.lastSpoofCheck = nowTs

    const windowMs = this.config.spoofWindowSec * 1000
    const recentWalls = [
      ...this.state.walls.bid,
      ...this.state.walls.ask
    ].filter(w => nowTs - w.firstSeen < windowMs)

    for (const w of recentWalls) {
      const priceDist = this.lastPrice
        ? Math.abs(w.price - this.lastPrice) / this.lastPrice
        : 0
      if (priceDist > 0.0015) continue

      const ageSec = (nowTs - w.firstSeen) / 1000
      const refreshRate = ageSec > 0 ? ((w as any).refreshCount || 0) / ageSec : 0
      const isHighRefresh = refreshRate > 1.5

      const pull = nowTs - w.lastSeen > 700 && w.persistence < 3
      if (pull && w.notional > 50_000) {
        this.emitSignal({
          type: 'HIGH_CONFIDENCE_SPOOF',
          bias: w.key.includes('bid') ? 'bearish' : 'bullish',
          confidence: 83,
          description: `Şüpheli spoof duvarı @ ${fmtPrice(w.price)}`,
          price: w.price,
          evidence: { persistence: w.persistence, notional: w.notional, refreshRate, refreshCount: (w as any).refreshCount }
        })
      }
      // Yeni: yüksek refresh rate spoof - hızlı ekle-çek döngüsü
      if (isHighRefresh && w.notional > 30_000) {
        this.emitSignal({
          type: 'HIGH_REFRESH_SPOOF',
          bias: w.key.includes('bid') ? 'bearish' : 'bullish',
          confidence: clamp(70 + refreshRate * 8, 70, 92),
          description: `Yüksek refresh spoof @ ${fmtPrice(w.price)} — ${refreshRate.toFixed(1)}/s qty değişimi`,
          price: w.price,
          evidence: { refreshRate, refreshCount: (w as any).refreshCount, persistence: w.persistence, notional: w.notional }
        })
      }
    }
  }

  // ── 7. Iceberg Detection ─────────────────────────────
  private detectIceberg(): void {
    const recentTrades = this.trades.slice(-80)
    const levels = new Map<string, { price: number; tradeNotional: number; count: number }>()

    for (const t of recentTrades) {
      const k = priceToKey(t.price)
      if (!levels.has(k)) {
        levels.set(k, { price: t.price, tradeNotional: 0, count: 0 })
      }
      const x = levels.get(k)!
      x.tradeNotional += t.notional
      x.count += 1
    }

    for (const [k, x] of levels) {
      const depthAt = [...this.book!.bids, ...this.book!.asks].find(
        l => priceToKey(l.price) === k
      )
      if (!depthAt) continue

      if (x.tradeNotional > depthAt.notional * 2 && depthAt.qty > 0) {
        if (!this.state.icebergZones.find(z => z.key === k)) {
          this.state.icebergZones.push({
            key: k,
            price: x.price,
            firstSeen: Date.now(),
            score: x.tradeNotional / (depthAt.notional || 1)
          })
          this.emitSignal({
            type: 'ICEBERG_ORDER',
            bias: 'bullish',
            confidence: 78,
            description: `Iceberg benzeri hidden liquidity @ ${fmtPrice(x.price)}`,
            price: x.price,
            evidence: { tradeNotional: x.tradeNotional, depthNotional: depthAt.notional }
          })
        }
      }
    }
  }

  // ── 8. Flow Patterns ─────────────────────────────────
  private detectFlowPatterns(): void {
    const candles = this.flowCandles
    if (candles.length < 3) return

    const last = candles[candles.length - 1]
    const prev = candles[candles.length - 2]

    // Delta expansion - tek divergence kaynağı artık cvd.ts'deki detectDivergence
    // CVD divergence burada üretilmiyor, dataStore'daki detectDivergence tek kaynak (dedup)
    if (Math.abs(last.delta) > Math.abs(prev.delta) * 2 && last.activity > 100_000) {
      this.emitSignal({
        type: 'FLOW_DELTA_EXPANSION',
        bias: last.delta > 0 ? 'bullish' : 'bearish',
        confidence: clamp(60 + Math.abs(last.pressureClose) * 0.3, 60, 90),
        description: `Delta genişleme: ${last.delta > 0 ? 'Alım' : 'Satım'} baskısı artıyor (${fmtNotional(Math.abs(last.delta))})`,
        price: this.lastPrice,
        evidence: { delta: last.delta, pressure: last.pressureClose }
      })
    }
  }

  // ── 9. Liquidation Cluster ───────────────────────────
  private detectLiquidationCluster(): void {
    const recent = this.liquidations.filter(l => Date.now() - l.ts < 10_000)
    if (recent.length < 5) return

    const totalNotional = recent.reduce((a, l) => a + l.notional, 0)
    if (totalNotional < 500_000) return

    const longCount = recent.filter(l => l.side === 'SELL').length
    const shortCount = recent.filter(l => l.side === 'BUY').length

    this.emitSignal({
      type: 'LIQUIDATION_CLUSTER',
      bias: longCount > shortCount ? 'bearish' : 'bullish',
      confidence: clamp(50 + recent.length * 5, 50, 95),
      description: `Likidasyon kümesi: ${recent.length} liq, $${fmtNotional(totalNotional)}`,
      price: this.lastPrice,
      evidence: { count: recent.length, notional: totalNotional, longCount, shortCount }
    })
  }

  /** Emit a signal event (will be consumed by TradePlanGenerator). */
  private emitSignal(sig: Omit<MicroSignal, 'id' | 'ts' | 'decay' | 'expiresAt'>): void {
    this.emit('signal:add', sig)
  }

  /** Getters */
  getState(): DetectorState {
    return this.state
  }

  getWalls(): { bid: WallTrack[]; ask: WallTrack[] } {
    return this.state.walls
  }

  updateConfig(cfg: Partial<DetectorConfig>): void {
    this.config = { ...this.config, ...cfg }
  }

  /** Reset state (e.g. on symbol change). */
  reset(): void {
    this.state = {
      walls: { bid: [], ask: [] },
      compressionActive: false,
      ladderCount: 0,
      spoofCandidates: [],
      icebergZones: [],
      lastSpoofCheck: 0
    }
  }
}
