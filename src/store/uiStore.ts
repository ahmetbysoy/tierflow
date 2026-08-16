import { create } from 'zustand'
import type { TabId } from '../types'

interface UIState {
  tab: TabId
  setTab: (t: TabId) => void
}

export const useUIStore = create<UIState>((set) => ({
  tab: 'radar',
  setTab: (tab) => set({ tab })
}))
