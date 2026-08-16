import type { NormalizedTrade, NormalizedDepth, NormalizedMark } from '../../types'

export type WsEvent =
  | { type: 'trade'; data: NormalizedTrade }
  | { type: 'depth'; data: NormalizedDepth }
  | { type: 'mark'; data: NormalizedMark }
  | { type: 'status'; status: 'connected' | 'connecting' | 'disconnected'; message?: string }

export interface WsAdapter {
  id: string
  connect(symbol: string): void
  disconnect(): void
  onEvent(cb: (ev: WsEvent) => void): void
  getConnectionState(): 'connected' | 'connecting' | 'disconnected'
}
