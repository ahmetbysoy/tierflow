import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Source } from '../types'

interface SettingsState {
  source: Source
  symbol: string // BTC-USDT format for OKX, BTCUSDT for Binance handled in adapter
  weights: { w1: number; w2: number; w3: number; w4: number; w5: number; w6: number }
  threshold: number
  cooldown: number // seconds
  sound: boolean
  haptics: boolean
  paperTradingEnabled: boolean
  setSource: (s: Source) => void
  setSymbol: (sym: string) => void
  setWeights: (w: { w1: number; w2: number; w3: number; w4: number; w5: number; w6: number }) => void
  setThreshold: (v: number) => void
  setCooldown: (v: number) => void
  setSound: (v: boolean) => void
  setHaptics: (v: boolean) => void
  setPaperTradingEnabled: (v: boolean) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      source: 'okx',
      symbol: 'BTCUSDT',
      weights: { w1: 0.30, w2: 0.18, w3: 0.13, w4: 0.16, w5: 0.10, w6: 0.13 },
      threshold: 0.75,
      cooldown: 18,
      sound: true,
      haptics: true,
      paperTradingEnabled: false,
      setSource: (source) => set({ source }),
      setSymbol: (symbol) => set({ symbol }),
      setWeights: (weights) => {
        // auto normalize to sum 1 (6 weights)
        const sum = weights.w1 + weights.w2 + weights.w3 + weights.w4 + weights.w5 + weights.w6
        if (sum === 0) return
        const norm = { w1: weights.w1 / sum, w2: weights.w2 / sum, w3: weights.w3 / sum, w4: weights.w4 / sum, w5: weights.w5 / sum, w6: weights.w6 / sum }
        set({ weights: norm })
      },
      setThreshold: (threshold) => set({ threshold }),
      setCooldown: (cooldown) => set({ cooldown }),
      setSound: (sound) => set({ sound }),
      setHaptics: (haptics) => set({ haptics }),
      setPaperTradingEnabled: (paperTradingEnabled) => set({ paperTradingEnabled })
    }),
    {
      name: 'signal-radar-settings',
      version: 7,
      migrate: (persistedState: any, version: number) => {
        if (version < 4) {
          // v4: 5-weight microprice+VPIN
          const oldW = persistedState.weights || { w1: 0.5, w2: 0.3, w3: 0.2 }
          const sum3 = (oldW.w1||0.5)+(oldW.w2||0.3)+(oldW.w3||0.2)
          return {
            ...persistedState,
            weights: { 
              w1: (oldW.w1/sum3)*0.70,
              w2: (oldW.w2/sum3)*0.70,
              w3: (oldW.w3/sum3)*0.70,
              w4: 0.18,
              w5: 0.12,
              w6: 0.13
            },
            threshold: 0.75,
            cooldown: 18,
            paperTradingEnabled: false
          }
        }
        if (version < 5) {
          return {
            ...persistedState,
            paperTradingEnabled: false,
            weights: { ...(persistedState.weights || {}), w6: 0.13 } as any
          }
        }
        if (version < 6) {
          // v6: w6 mikroyapı skoru eklendi
          const w = persistedState.weights || { w1: 0.35, w2: 0.20, w3: 0.15, w4: 0.18, w5: 0.12 }
          const sum5 = (w.w1||0.35)+(w.w2||0.20)+(w.w3||0.15)+(w.w4||0.18)+(w.w5||0.12)
          return {
            ...persistedState,
            weights: {
              w1: (w.w1||0.35)/sum5*0.87,
              w2: (w.w2||0.20)/sum5*0.87,
              w3: (w.w3||0.15)/sum5*0.87,
              w4: (w.w4||0.18)/sum5*0.87,
              w5: (w.w5||0.12)/sum5*0.87,
              w6: 0.13
            }
          }
        }
        if (version < 7) {
          // v7: futures only, symbol normalize BTC-USDT -> BTCUSDT
          const oldSym = persistedState.symbol || 'BTCUSDT'
          const clean = String(oldSym).toUpperCase().replace(/[^A-Z0-9]/g, '')
          const base = clean.endsWith('USDT') ? clean.slice(0, -4) : clean
          const norm = base ? `${base}USDT` : 'BTCUSDT'
          return {
            ...persistedState,
            symbol: norm
          }
        }
        return persistedState as any
      }
    }
  )
)
