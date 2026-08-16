import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Source } from '../types'

interface SettingsState {
  source: Source
  symbol: string // BTC-USDT format for OKX, BTCUSDT for Binance handled in adapter
  weights: { w1: number; w2: number; w3: number; w4: number; w5: number }
  threshold: number
  cooldown: number // seconds
  sound: boolean
  haptics: boolean
  setSource: (s: Source) => void
  setSymbol: (sym: string) => void
  setWeights: (w: { w1: number; w2: number; w3: number; w4: number; w5: number }) => void
  setThreshold: (v: number) => void
  setCooldown: (v: number) => void
  setSound: (v: boolean) => void
  setHaptics: (v: boolean) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      source: 'okx',
      symbol: 'BTC-USDT',
      weights: { w1: 0.35, w2: 0.20, w3: 0.15, w4: 0.18, w5: 0.12 },
      threshold: 0.75,
      cooldown: 18,
      sound: true,
      haptics: true,
      setSource: (source) => set({ source }),
      setSymbol: (symbol) => set({ symbol }),
      setWeights: (weights) => {
        // auto normalize to sum 1 (5 weights)
        const sum = weights.w1 + weights.w2 + weights.w3 + weights.w4 + weights.w5
        if (sum === 0) return
        const norm = { w1: weights.w1 / sum, w2: weights.w2 / sum, w3: weights.w3 / sum, w4: weights.w4 / sum, w5: weights.w5 / sum }
        set({ weights: norm })
      },
      setThreshold: (threshold) => set({ threshold }),
      setCooldown: (cooldown) => set({ cooldown }),
      setSound: (sound) => set({ sound }),
      setHaptics: (haptics) => set({ haptics })
    }),
    {
      name: 'signal-radar-settings',
      version: 4,
      migrate: (persistedState: any, version: number) => {
        if (version < 4) {
          // v4: 5-weight microprice+VPIN
          const oldW = persistedState.weights || { w1: 0.5, w2: 0.3, w3: 0.2 }
          // Map old 3-weight to new 5-weight: keep CVD/OBI/VEL ratio, add micro 0.18, vpin 0.12
          const sum3 = (oldW.w1||0.5)+(oldW.w2||0.3)+(oldW.w3||0.2)
          return {
            ...persistedState,
            weights: { 
              w1: (oldW.w1/sum3)*0.70, // 70% for old 3
              w2: (oldW.w2/sum3)*0.70,
              w3: (oldW.w3/sum3)*0.70,
              w4: 0.18,
              w5: 0.12
            },
            threshold: 0.75,
            cooldown: 18
          }
        }
        return persistedState as any
      }
    }
  )
)
