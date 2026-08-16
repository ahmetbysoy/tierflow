/**
 * Signal Forward Return Tracker (Plan A)
 * Her sinyal için entry fiyatından itibaren forward PnL ölçer.
 * Horizonlar: +15s, +30s, +60s, +300s (5m), +900s (15m)
 * Ayrıca MFE/MAE ve live PnL takip eder.
 */

import type { Signal, SignalSide } from '../../types'

export type HorizonKey = '15s' | '30s' | '60s' | '300s' | '900s'

export const HORIZONS: Record<HorizonKey, number> = {
  '15s': 15_000,
  '30s': 30_000,
  '60s': 60_000,
  '300s': 300_000,
  '900s': 900_000
}

export interface Tracker {
  signalId: string
  side: SignalSide
  entry: number
  entryTs: number
  horizons: Record<HorizonKey, number | null> // % PnL, null = henüz dolmadı
  mfe: number // max favorable % 
  mae: number // max adverse % (negative)
  live: number // current % 
  maxSeen: number // max horizon doldu mu?
  closed: boolean
}

function calcPnl(side: SignalSide, entry: number, current: number): number {
  if (entry === 0) return 0
  const raw = side === 'BUY' ? (current - entry) / entry : (entry - current) / entry
  return raw * 100 // %
}

export class SignalTracker {
  private trackers = new Map<string, Tracker>()
  private listeners = new Map<string, Set<Function>>()

  on(event: string, fn: Function): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    this.listeners.get(event)!.add(fn)
    return () => this.listeners.get(event)?.delete(fn)
  }

  private emit(event: string, data?: unknown) {
    const set = this.listeners.get(event)
    if (!set) return
    for (const fn of [...set]) try { fn(data) } catch {}
  }

  addSignal(signal: Signal): Tracker {
    if (this.trackers.has(signal.id)) return this.trackers.get(signal.id)!
    const t: Tracker = {
      signalId: signal.id,
      side: signal.side,
      entry: signal.price,
      entryTs: signal.ts,
      horizons: { '15s': null, '30s': null, '60s': null, '300s': null, '900s': null },
      mfe: 0,
      mae: 0,
      live: 0,
      maxSeen: 0,
      closed: false
    }
    this.trackers.set(signal.id, t)
    this.emit('add', t)
    return t
  }

  updatePrice(price: number, ts: number): void {
    for (const [id, tr] of this.trackers) {
      if (tr.closed) continue
      const pnl = calcPnl(tr.side, tr.entry, price)
      tr.live = pnl
      if (pnl > tr.mfe) tr.mfe = pnl
      if (pnl < tr.mae) tr.mae = pnl

      // horizons doldu mu?
      const elapsed = ts - tr.entryTs
      for (const [k, ms] of Object.entries(HORIZONS) as [HorizonKey, number][]) {
        if (tr.horizons[k] === null && elapsed >= ms) {
          tr.horizons[k] = pnl
          this.emit('horizon', { id, horizon: k, pnl, elapsed })
        }
      }
      // 15m dolduysa kapat
      if (elapsed >= HORIZONS['900s']) {
        tr.closed = true
        this.emit('close', tr)
      }
      this.emit('update', tr)
    }
  }

  get(signalId: string): Tracker | undefined {
    return this.trackers.get(signalId)
  }

  getAll(): Tracker[] {
    return Array.from(this.trackers.values()).sort((a, b) => b.entryTs - a.entryTs)
  }

  // Aggregate stats - son N sinyal
  getStats(lastN = 50): {
    count: number
    win15s: number
    win60s: number
    win300s: number
    avg15s: number
    avg60s: number
    avg300s: number
    avgMfe: number
    avgMae: number
  } {
    const all = this.getAll().filter(t => t.horizons['15s'] !== null).slice(0, lastN)
    if (all.length === 0) return { count: 0, win15s: 0, win60s: 0, win300s: 0, avg15s: 0, avg60s: 0, avg300s: 0, avgMfe: 0, avgMae: 0 }
    const win = (k: HorizonKey) => all.filter(t => (t.horizons[k] ?? 0) > 0).length / all.length
    const avg = (k: HorizonKey) => all.reduce((s, t) => s + (t.horizons[k] ?? 0), 0) / all.length
    return {
      count: all.length,
      win15s: win('15s'),
      win60s: win('60s'),
      win300s: win('300s'),
      avg15s: avg('15s'),
      avg60s: avg('60s'),
      avg300s: avg('300s'),
      avgMfe: all.reduce((s, t) => s + t.mfe, 0) / all.length,
      avgMae: all.reduce((s, t) => s + t.mae, 0) / all.length
    }
  }

  clear(): void {
    this.trackers.clear()
  }

  size(): number {
    return this.trackers.size
  }
}

// Singleton for dataStore integration
export const globalTracker = new SignalTracker()
