export type Side = 'buy' | 'sell'
export type SignalSide = 'BUY' | 'SELL'
export type ConnectionState = 'connected' | 'connecting' | 'disconnected'
export type TabId = 'radar' | 'chart' | 'signals' | 'settings'
export type Source = 'okx' | 'binance'

export interface NormalizedTrade {
  price: number
  priceStr?: string
  qty: number
  side: Side
  ts: number
}

export interface NormalizedDepth {
  bids: [number, number][] // [price, qty]
  asks: [number, number][]
  ts: number
}

export interface NormalizedMark {
  price: number
  priceStr?: string
  ts: number
}

export interface Candle {
  time: number // unix sec
  open: number
  openStr?: string
  high: number
  low: number
  close: number
  closeStr?: string
  volume: number
}

export interface Signal {
  id: string
  side: SignalSide
  price: number
  priceStr?: string
  confidence: number
  score: number
  breakdown: { cvd: number; obi: number; vel: number; micro?: number; vpin?: number; detector?: number; w1: number; w2: number; w3: number; w4?: number; w5?: number; w6?: number }
  ts: number
}

export interface Metrics { cvd: number; cvdNorm: number; cvdZ: number; obi: number; obiRaw: number; velocity: number; velocityZ: number; microprice: number; microDev: number; vpin: number; vpinLabel: string; detectorScore?: number; score: number; price: number; priceStr?: string }
