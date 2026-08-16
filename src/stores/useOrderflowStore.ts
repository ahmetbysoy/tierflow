import { create } from 'zustand'
import { calcDivergence, getSignal, type DivergenceResult } from '../lib/divergence'

interface TierState {
  symbol: string
  bids: [string, string][]
  asks: [string, string][]
  divergence: DivergenceResult | null
  signal: { side: 'LONG' | 'SHORT' | null, reason: string } | null
  lastUpdate: number
  status: 'connected' | 'disconnected' | 'reconnecting'
  // Trade buffer son 100 trade
  trades: { price: number, qty: number, isBuyerMaker: boolean }[]
  // Cooldown
  lastSignalTime: number
  cooldownRemaining: number
}

interface Store {
  tickers: Record<string, TierState>
  activeSymbol: string
  setActiveSymbol: (s: string) => void
  handleDepth: (symbol: string, bids: [string, string][], asks: [string, string][], ts: number) => void
  handleTrade: (symbol: string, price: string, qty: string, isBuyerMaker: boolean) => void
  setStatus: (s: TierState['status']) => void
  // UI için throttled snapshot
  getSnapshot: (symbol: string) => TierState | undefined
}

export const useOrderflowStore = create<Store>((set, get) => ({
  tickers: {},
  activeSymbol: 'BTCUSDT',
  setActiveSymbol: (s) => set({ activeSymbol: s }),
  
  setStatus: (status) => {
    const { tickers, activeSymbol } = get()
    const cur = tickers[activeSymbol]
    if (cur) {
      set({ tickers: { ...tickers, [activeSymbol]: { ...cur, status } } })
    }
  },

  handleDepth: (symbol, bids, asks, ts) => {
    const state = get().tickers[symbol]
    const trades = state?.trades ?? []
    
    const divergence = calcDivergence(bids, asks, trades)
    const rawSignal = getSignal(divergence)
    
    // Cooldown kontrolü - 180s
    const now = Date.now()
    const lastSignalTime = state?.lastSignalTime ?? 0
    const cooldownRemaining = Math.max(0, 180000 - (now - lastSignalTime))
    
    let signal = rawSignal
    if (rawSignal.side && cooldownRemaining > 0) {
      signal = { side: null, reason: `Cooldown ${Math.ceil(cooldownRemaining/1000)}s` }
    }
    
    // Sinyal oluştuysa cooldown resetle
    let nextLastSignalTime = lastSignalTime
    if (rawSignal.side && cooldownRemaining === 0) {
      nextLastSignalTime = now
    }

    set({
      tickers: {
        ...get().tickers,
        [symbol]: {
          symbol,
          bids,
          asks,
          divergence,
          signal,
          lastUpdate: ts,
          status: 'connected',
          trades,
          lastSignalTime: nextLastSignalTime,
          cooldownRemaining
        }
      }
    })
  },

  handleTrade: (symbol, price, qty, isBuyerMaker) => {
    const cur = get().tickers[symbol]
    const entry = { price: parseFloat(price), qty: parseFloat(qty), isBuyerMaker }
    const trades = [...(cur?.trades ?? []), entry].slice(-100) // son 100 trade yeterli
    
    if (cur) {
      set({ tickers: { ...get().tickers, [symbol]: { ...cur, trades } } })
    } else {
      // Henüz depth gelmemişse sadece trade buffer oluştur
      set({
        tickers: {
          ...get().tickers,
          [symbol]: {
            symbol,
            bids: [],
            asks: [],
            divergence: null,
            signal: null,
            lastUpdate: Date.now(),
            status: 'reconnecting',
            trades,
            lastSignalTime: 0,
            cooldownRemaining: 0
          }
        }
      })
    }
  },

  getSnapshot: (symbol) => get().tickers[symbol]
}))
