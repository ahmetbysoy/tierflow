export type Side = 'buy' | 'sell'
export type SignalSide = 'BUY' | 'SELL'
export type ConnectionState = 'connected' | 'connecting' | 'disconnected'
export type TabId = 'radar' | 'chart' | 'signals' | 'settings'
export type Source = 'okx' | 'binance'

export interface NormalizedTrade {
  price: number
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
  ts: number
}

export interface Candle {
  time: number // unix sec
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface Signal {
  id: string
  side: SignalSide
  price: number
  confidence: number
  score: number
  breakdown: { cvd: number; obi: number; vel: number; w1: number; w2: number; w3: number }
  ts: number
}

export interface Metrics {
  cvd: number
  cvdNorm: number
  cvdZ: number
  obi: number
  obiRaw: number
  velocity: number
  velocityZ: number
  score: number
  price: number
}
