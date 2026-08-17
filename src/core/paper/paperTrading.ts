/**
 * Paper Trading Engine — extracted from BOZOK_PRO
 * Simulates auto entry/exit from trade plans.
 * Tracks SL/TP hits, PnL, equity curve, and performance metrics.
 */

import type { TradePlan, PositionSize } from '../signal/tradePlan'

// ── Types ────────────────────────────────────────────────

export type PositionDir = 'LONG' | 'SHORT'
export type PositionStatus = 'open' | 'closed'
export type ExitReason = 'stop' | 'tp1' | 'tp2'

export interface PaperPosition {
  id: string
  dir: PositionDir
  qty: number
  entry: number
  stop: number
  tp1: number
  tp2: number
  slippageBps: number
  openedAt: number
  closedAt?: number
  exit?: number
  reason?: ExitReason
  status: PositionStatus
}

export interface PerformanceMetrics {
  trades: number
  wins: number
  netR: number
  pf: number
  sharpe: number
  maxDD: number
  equity: number[]
  avgHoldMs: number
}

export interface PaperTradingConfig {
  cooldownMs: number
  maxPositions: number
  maxClosedHistory: number
  maxEquityLength: number
}

// ── Utilities ─────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

function mean(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
}

function std(arr: number[]): number {
  if (arr.length < 2) return 0
  const m = mean(arr)
  const v = arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length
  return Math.sqrt(v)
}

// ── PaperTradingEngine ────────────────────────────────────

export class PaperTradingEngine {
  private positions: PaperPosition[] = []
  private closedPositions: PaperPosition[] = []
  private performance: PerformanceMetrics
  private config: PaperTradingConfig
  private cooldownUntil = 0
  private listeners: Map<string, Set<Function>> = new Map()

  constructor(config?: Partial<PaperTradingConfig>) {
    this.config = {
      cooldownMs: 30_000,
      maxPositions: 3,
      maxClosedHistory: 500,
      maxEquityLength: 300,
      ...config
    }
    this.performance = {
      trades: 0,
      wins: 0,
      netR: 0,
      pf: 0,
      sharpe: 0,
      maxDD: 0,
      equity: [100],
      avgHoldMs: 0
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

  /** Simulate entry from a trade plan. */
  simulateFromPlan(
    plan: TradePlan,
    positionSize: PositionSize | null,
    bookDepth: number,
    lastPrice: number
  ): PaperPosition | null {
    if (!plan || plan.direction === 'NEUTRAL') return null

    const nowTs = Date.now()
    if (nowTs < this.cooldownUntil) return null
    if (!positionSize) return null

    const openCount = this.positions.filter(p => p.status === 'open').length
    if (openCount >= this.config.maxPositions) return null

    // Simulate slippage based on notional vs book depth
    const slipBps = clamp(
      (positionSize.notional / Math.max(bookDepth * lastPrice, 1)) * 10000 * 0.5,
      0,
      25
    )

    const fillPrice =
      plan.direction === 'LONG'
        ? plan.entry! * (1 + slipBps / 10_000)
        : plan.entry! * (1 - slipBps / 10_000)

    const position: PaperPosition = {
      id: `pos_${nowTs}`,
      dir: plan.direction as PositionDir,
      qty: positionSize.qty,
      entry: fillPrice,
      stop: plan.stop!,
      tp1: plan.tp1!,
      tp2: plan.tp2!,
      slippageBps: slipBps,
      openedAt: nowTs,
      status: 'open'
    }

    this.positions.push(position)
    this.cooldownUntil = nowTs + this.config.cooldownMs

    this.emit('paper:open', position)
    return position
  }

  /** Check all open positions against current price. Call on each tick. */
  update(price: number): void {
    const open = this.positions.filter(p => p.status === 'open')
    for (const p of open) {
      let exit: number | null = null
      let reason: ExitReason | null = null

      if (p.dir === 'LONG') {
        if (price <= p.stop) { exit = p.stop; reason = 'stop' }
        else if (price >= p.tp2) { exit = p.tp2; reason = 'tp2' }
        else if (price >= p.tp1) { exit = p.tp1; reason = 'tp1' }
      } else {
        if (price >= p.stop) { exit = p.stop; reason = 'stop' }
        else if (price <= p.tp2) { exit = p.tp2; reason = 'tp2' }
        else if (price <= p.tp1) { exit = p.tp1; reason = 'tp1' }
      }

      if (exit !== null && reason !== null) {
        this.close(p, exit, reason)
      }
    }
  }

  /** Force-close a position at the given price. */
  close(position: PaperPosition, exitPrice: number, reason: ExitReason): void {
    position.status = 'closed'
    position.closedAt = Date.now()
    position.exit = exitPrice
    position.reason = reason

    const pnl =
      position.dir === 'LONG'
        ? (exitPrice - position.entry) * position.qty
        : (position.entry - exitPrice) * position.qty

    const riskPerR = Math.abs(position.entry - position.stop) || 1
    const r = pnl / riskPerR

    this.closedPositions.unshift(position)
    if (this.closedPositions.length > this.config.maxClosedHistory) {
      this.closedPositions.pop()
    }

    // Update performance metrics
    this.performance.trades += 1
    if (pnl > 0) this.performance.wins += 1
    this.performance.netR += r

    const eq = this.performance.equity
    eq.push(eq[eq.length - 1] + r)
    if (eq.length > this.config.maxEquityLength) eq.shift()

    const peak = Math.max(...eq)
    const dd = peak > 0 ? ((peak - eq[eq.length - 1]) / peak) * 100 : 0
    this.performance.maxDD = Math.max(this.performance.maxDD, dd)

    this.performance.avgHoldMs = mean(
      this.closedPositions.slice(0, 20).map(p => (p.closedAt || 0) - p.openedAt)
    )

    // Real PF = sumWinR / abs(sumLossR) from closedPositions
    let sumWinR = 0
    let sumLossR = 0
    for (const cp of this.closedPositions) {
      const risk = Math.abs(cp.entry - cp.stop) || 1
      const pnlCp = cp.dir === 'LONG' ? (cp.exit! - cp.entry) * cp.qty : (cp.entry - cp.exit!) * cp.qty
      const rVal = pnlCp / risk
      if (rVal > 0) sumWinR += rVal
      else sumLossR += Math.abs(rVal)
    }
    this.performance.pf = sumLossR > 0 ? sumWinR / sumLossR : sumWinR > 0 ? Infinity : 0
    // Real Sharpe = mean(R) / std(R) * sqrt(N) — std(closedPositions.map(r))
    const rs = this.closedPositions.map(cp => {
      const risk = Math.abs(cp.entry - cp.stop) || 1
      const pnlCp = cp.dir === 'LONG' ? (cp.exit! - cp.entry) * cp.qty : (cp.entry - cp.exit!) * cp.qty
      return pnlCp / risk
    })
    const meanR = mean(rs)
    const stdR = std(rs)
    this.performance.sharpe = stdR > 1e-9 && rs.length > 5 ? (meanR / stdR) * Math.sqrt(rs.length) : 0

    this.emit('paper:close', { position, exitPrice, reason, pnl, r })
  }

  /** Getters */
  getOpenPositions(): PaperPosition[] {
    return this.positions.filter(p => p.status === 'open')
  }

   getClosedPositions(): PaperPosition[] {
    return this.closedPositions
  }

  getPerformance(): PerformanceMetrics {
    return this.performance
  }

  updateConfig(cfg: Partial<PaperTradingConfig>): void {
    this.config = { ...this.config, ...cfg }
  }

  /** Reset all state (e.g. on symbol change). */
  reset(): void {
    this.positions = []
    this.closedPositions = []
    this.performance = {
      trades: 0,
      wins: 0,
      netR: 0,
      pf: 0,
      sharpe: 0,
      maxDD: 0,
      equity: [100],
      avgHoldMs: 0
    }
    this.cooldownUntil = 0
  }
}
