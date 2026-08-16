import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Source } from '../types'

interface SettingsState {
  source: Source
  symbol: string // BTC-USDT format for OKX, BTCUSDT for Binance handled in adapter
  weights: { w1: number; w2: number; w3: number }
  threshold: number
  cooldown: number // seconds
  sound: boolean
  haptics: boolean
  setSource: (s: Source) => void
  setSymbol: (sym: string) => void
  setWeights: (w: { w1: number; w2: number; w3: number }) => void
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
      weights: { w1: 0.4, w2: 0.3, w3: 0.3 },
      threshold: 0.6,
      cooldown: 15,
      sound: true,
      haptics: true,
      setSource: (source) => set({ source }),
      setSymbol: (symbol) => set({ symbol }),
      setWeights: (weights) => {
        // auto normalize to sum 1
        const sum = weights.w1 + weights.w2 + weights.w3
        if (sum === 0) return
        const norm = { w1: weights.w1 / sum, w2: weights.w2 / sum, w3: weights.w3 / sum }
        set({ weights: norm })
      },
      setThreshold: (threshold) => set({ threshold }),
      setCooldown: (cooldown) => set({ cooldown }),
      setSound: (sound) => set({ sound }),
      setHaptics: (haptics) => set({ haptics })
    }),
    {
      name: 'signal-radar-settings',
      version: 1
    }
  )
)
