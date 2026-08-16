/**
 * Order Book Diff Engine — extracted from BOZOK_PRO
 * Map-based incremental order book with lastUpdateId sequence control.
 * Maintains a local copy of bids/asks, applies incremental diffs,
 * and recomputes microstructure metrics (spread, mid, OBI, microprice, slopes).
 */

// ── Types ────────────────────────────────────────────────

export interface BookLevel {
  price: number
  qty: number
  notional: number
}

export interface OrderBook {
  bids: BookLevel[]
  asks: BookLevel[]
  ts: number
  lastUpdateId: number
}

export interface MicrostructureData {
  bestBid: number
  bestAsk: number
  spread: number
  mid: number
  obi: number
  microprice: number
  bidSlope: number
  askSlope: number
  depthBid: number
  depthAsk: number
}

export interface BookSnapshot {
  bids: [number, number][]
  asks: [number, number][]
  lastUpdateId: number
}

export interface BookDiff {
  bids: [number, number][]
  asks: [number, number][]
  U?: number
  u?: number
  eventTime?: number
}

export interface HeatFrame {
  ts: number
  bids: BookLevel[]
  asks: BookLevel[]
}

export interface OrderBookDiffConfig {
  maxLevels: number
  heatmapWindowSec: number
}

// ── Utilities ─────────────────────────────────────────────

function mean(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
}

function median(arr: number[]): number {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function rollingSlope(levels: BookLevel[]): number {
  if (levels.length < 2) return 0
  const xs = levels.map((_, i) => i + 1)
  const ys = levels.map(x => x.qty)
  const xMean = mean(xs)
  const yMean = mean(ys)
  let num = 0
  let den = 0
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - xMean) * (ys[i] - yMean)
    den += (xs[i] - xMean) ** 2
  }
  return den ? num / den : 0
}

// ── OrderBookDiff ─────────────────────────────────────────

export class OrderBookDiff {
  private book: OrderBook = { bids: [], asks: [], ts: 0, lastUpdateId: 0 }
  private heatHistory: HeatFrame[] = []
  private config: OrderBookDiffConfig
  private listeners: Map<string, Set<Function>> = new Map()

  constructor(config?: Partial<OrderBookDiffConfig>) {
    this.config = {
      maxLevels: 200,
      heatmapWindowSec: 30,
      ...config
    }
  }

  /** Subscribe to events: 'book:update', 'micro:update' */
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

  /** Apply a full snapshot (first load or reconnect). */
  applySnapshot(symbol: string, snapshot: BookSnapshot): void {
    const bids = (snapshot.bids || []).map(([p, q]) => ({
      price: +p,
      qty: +q,
      notional: (+p) * (+q)
    }))
    const asks = (snapshot.asks || []).map(([p, q]) => ({
      price: +p,
      qty: +q,
      notional: (+p) * (+q)
    }))
    this.book = {
      bids,
      asks,
      ts: Date.now(),
      lastUpdateId: snapshot.lastUpdateId || 0
    }
    this.recompute()
    this.emit('book:update', this.book)
  }

  /** Apply an incremental diff. Returns false if stale/out-of-order. */
  applyDiff(diff: BookDiff): boolean {
    const { bids = [], asks = [], U, u } = diff

    // Sequence control: skip if this update is older than what we already have
    if (this.book.lastUpdateId && U && u && u <= this.book.lastUpdateId) {
      return false
    }

    const bookB = new Map(this.book.bids.map(l => [l.price.toFixed(8), l]))
    const bookA = new Map(this.book.asks.map(l => [l.price.toFixed(8), l]))

    const applySide = (arr: [number, number][], map: Map<string, BookLevel>): void => {
      for (const [p, q] of arr) {
        const price = +p
        const qty = +q
        const key = price.toFixed(8)
        if (qty <= 0) {
          map.delete(key)
        } else {
          map.set(key, { price, qty, notional: price * qty })
        }
      }
    }

    applySide(bids, bookB)
    applySide(asks, bookA)

    this.book.bids = [...bookB.values()]
      .sort((a, b) => b.price - a.price)
      .slice(0, this.config.maxLevels)
    this.book.asks = [...bookA.values()]
      .sort((a, b) => a.price - b.price)
      .slice(0, this.config.maxLevels)

    this.book.lastUpdateId = u || this.book.lastUpdateId
    this.book.ts = Date.now()

    this.recompute()
    this.emit('book:update', this.book)
    return true
  }

  /** Recompute microstructure metrics from current book state. */
  recompute(): MicrostructureData | null {
    const b = this.book.bids[0]
    const a = this.book.asks[0]
    if (!b || !a) return null

    const spread = a.price - b.price
    const mid = (a.price + b.price) / 2

    const levels = Math.min(10, this.book.bids.length, this.book.asks.length)
    const bidQty = this.book.bids.slice(0, levels).reduce((x, y) => x + y.qty, 0)
    const askQty = this.book.asks.slice(0, levels).reduce((x, y) => x + y.qty, 0)
    const microprice = (a.price * b.qty + b.price * a.qty) / (b.qty + a.qty)

    const micro: MicrostructureData = {
      bestBid: b.price,
      bestAsk: a.price,
      spread,
      mid,
      obi: (bidQty - askQty) / (bidQty + askQty || 1),
      microprice,
      bidSlope: rollingSlope(this.book.bids.slice(0, levels)),
      askSlope: rollingSlope(this.book.asks.slice(0, levels)),
      depthBid: bidQty,
      depthAsk: askQty
    }

    // Heatmap history (for VPVR visualization)
    this.heatHistory.push({
      ts: Date.now(),
      bids: this.book.bids.slice(0, 20),
      asks: this.book.asks.slice(0, 20)
    })
    const maxHeatFrames = this.config.heatmapWindowSec * 10
    if (this.heatHistory.length > maxHeatFrames) {
      this.heatHistory.splice(0, this.heatHistory.length - maxHeatFrames)
    }

    this.emit('micro:update', micro)
    return micro
  }

  /** Check if the book data is stale (no update for thresholdMs). */
  isStale(thresholdMs: number): boolean {
    return Date.now() - this.book.ts > thresholdMs
  }

  /** Getters */
  getBook(): OrderBook {
    return this.book
  }

  getHeatHistory(): HeatFrame[] {
    return this.heatHistory
  }

  /** Reset internal state (e.g. on symbol change). */
  reset(): void {
    this.book = { bids: [], asks: [], ts: 0, lastUpdateId: 0 }
    this.heatHistory = []
  }
}
