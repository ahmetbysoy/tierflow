import type { WsAdapter, WsEvent } from './types'
import { OkxAdapter } from './adapters/okx'
import { BinanceAdapter } from './adapters/binance'

export type Source = 'okx' | 'binance'

export class WsManager {
  private adapter: WsAdapter | null = null
  private source: Source = 'okx'
  private symbol = 'BTC-USDT'
  private cb: ((ev: WsEvent) => void) | null = null
  private reconnectAttempts = 0
  private reconnectTimer: number | null = null
  private shouldReconnect = true
  private hiddenPaused = false

  constructor(private onEvent: (ev: WsEvent) => void) {
    this.cb = onEvent
    // document.hidden pause/resume
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          this.hiddenPaused = true
          // pause: disconnect but keep shouldReconnect true, will resume on visible
          this.adapter?.disconnect()
        } else if (this.hiddenPaused) {
          this.hiddenPaused = false
          this.connect(this.source, this.symbol)
        }
      })
    }
  }

  connect(source: Source, symbol: string): void {
    this.source = source
    this.symbol = symbol
    this.shouldReconnect = true
    this.reconnectAttempts = 0
    this.createAdapterAndConnect()
  }

  switchSource(source: Source): void {
    this.connect(source, this.symbol)
  }

  switchSymbol(symbol: string): void {
    this.connect(this.source, symbol)
  }

  disconnect(): void {
    this.shouldReconnect = false
    if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer)
    this.adapter?.disconnect()
    this.adapter = null
  }

  private createAdapterAndConnect(): void {
    if (this.adapter) this.adapter.disconnect()
    this.adapter = this.source === 'okx' ? new OkxAdapter() : new BinanceAdapter()
    this.adapter.onEvent((ev) => {
      if (ev.type === 'status' && ev.status === 'disconnected' && this.shouldReconnect && !this.hiddenPaused) {
        this.scheduleReconnect()
      }
      if (ev.type === 'status' && ev.status === 'connected') {
        this.reconnectAttempts = 0
      }
      this.cb?.(ev)
    })
    this.adapter.connect(this.symbol)
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer)
    this.reconnectAttempts++
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000) + Math.random() * 500
    this.reconnectTimer = window.setTimeout(() => {
      if (this.shouldReconnect && !this.hiddenPaused) {
        this.createAdapterAndConnect()
      }
    }, delay)
  }

  getState(): 'connected' | 'connecting' | 'disconnected' {
    return this.adapter?.getConnectionState() ?? 'disconnected'
  }
}
