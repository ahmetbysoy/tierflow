/**
 * VPIN (Volume-Synchronized Probability of Informed Trading) — extracted from BOZOK_PRO
 * Measures toxicity of order flow using volume bucketing.
 * High VPIN (>0.7) indicates toxic/informed flow.
 */

import type { Side } from '../../types'

// ── Types ────────────────────────────────────────────────

export type VpinLabel = 'Low' | 'Medium' | 'Toxic'

export interface VPINState {
  value: number
  label: VpinLabel
  buckets: number[]
  currentBuy: number
  currentSell: number
  currentNotional: number
  bucketSize: number
}

export interface VPINConfig {
  maxBuckets: number
  tradeLookback: number
  minBucketNotional: number
  bucketTimeoutMs: number
}

// ── Utilities ─────────────────────────────────────────────

function mean(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
}

// ── VPIN ──────────────────────────────────────────────────

export class VPIN {
  private state: VPINState
  private config: VPINConfig
  private lastBucketTs: number
  private listeners: Map<string, Set<Function>> = new Map()

  constructor(config?: Partial<VPINConfig>) {
    this.config = {
      maxBuckets: 50,
      tradeLookback: 200,
      minBucketNotional: 100_000,
      bucketTimeoutMs: 60_000,
      ...config
    }
    this.lastBucketTs = Date.now()
    this.state = {
      value: 0,
      label: 'Low',
      buckets: [],
      currentBuy: 0,
      currentSell: 0,
      currentNotional: 0,
      bucketSize: this.config.minBucketNotional
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

  /** Feed a trade into the VPIN calculator. */
  update(
    trade: { price: number; qty: number; side: Side; notional: number },
    allTrades: { notional: number }[]
  ): VPINState {
    // Dynamic bucket sizing based on rolling volume
    const rollingVol = allTrades
      .slice(-this.config.tradeLookback)
      .reduce((a, b) => a + b.notional, 0)
    const targetBucket = Math.max(this.config.minBucketNotional, rollingVol * 0.001)
    this.state.bucketSize = targetBucket

    // Bucket completion check + time-based fallback for low-volume coins
    const now = Date.now()
    const shouldForceClose = this.state.currentNotional > 0 && (now - this.lastBucketTs) >= this.config.bucketTimeoutMs
    if (this.state.currentNotional >= targetBucket || shouldForceClose) {
      const total = this.state.currentBuy + this.state.currentSell
      if (total > 0) {
        this.state.buckets.push(
          Math.abs(this.state.currentBuy - this.state.currentSell) / total
        )
      }
      if (this.state.buckets.length > this.config.maxBuckets) {
        this.state.buckets.shift()
      }
      this.state.currentBuy = 0
      this.state.currentSell = 0
      this.state.currentNotional = 0
      this.lastBucketTs = now
    }

    // Accumulate
    if (trade.side === 'buy') {
      this.state.currentBuy += trade.notional
    } else {
      this.state.currentSell += trade.notional
    }
    this.state.currentNotional += trade.notional

    // Compute VPIN as mean of bucket imbalances
    if (this.state.buckets.length) {
      this.state.value = mean(this.state.buckets)
      this.state.label =
        this.state.value < 0.3 ? 'Low' :
        this.state.value < 0.7 ? 'Medium' : 'Toxic'
    }

    this.emit('vpin:update', this.state)
    return this.state
  }

  /** Getters */
  getState(): VPINState {
    return this.state
  }

  getValue(): number {
    return this.state.value
  }

  getLabel(): VpinLabel {
    return this.state.label
  }

  /** Reset state (e.g. on symbol change). */
  reset(): void {
    this.lastBucketTs = Date.now()
    this.state = {
      value: 0,
      label: 'Low',
      buckets: [],
      currentBuy: 0,
      currentSell: 0,
      currentNotional: 0,
      bucketSize: this.config.minBucketNotional
    }
  }
}
