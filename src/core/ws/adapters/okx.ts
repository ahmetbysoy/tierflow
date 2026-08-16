import type { WsAdapter, WsEvent } from '../types'
import type { NormalizedTrade, NormalizedDepth } from '../../../types'

/**
 * OKX WS Adapter - TR erişim garantisi için varsayılan
 * wss://ws.okx.com:8443/ws/v5/public
 * Kanallar: trades, books (depth 20), tickers (mark)
 */
export class OkxAdapter implements WsAdapter {
  id = 'okx'
  private ws: WebSocket | null = null
  private cb: ((ev: WsEvent) => void) | null = null
  private symbol = 'BTC-USDT'
  private state: 'connected' | 'connecting' | 'disconnected' = 'disconnected'

  onEvent(cb: (ev: WsEvent) => void): void {
    this.cb = cb
  }

  getConnectionState() {
    return this.state
  }

  connect(symbol: string): void {
    this.symbol = symbol.includes('-') ? symbol : symbol.replace('USDT', '-USDT').replace('BTC-', 'BTC-')
    // Ensure format BTC-USDT, ETH-USDT, BTC-USDT-SWAP? OKX uses BTC-USDT
    if (!this.symbol.includes('-')) {
      // fallback: insert -
      this.symbol = this.symbol.slice(0, -4) + '-' + this.symbol.slice(-4)
    }
    this.disconnect()
    this.state = 'connecting'
    this.cb?.({ type: 'status', status: 'connecting', message: 'OKX connecting...' })

    const url = 'wss://ws.okx.com:8443/ws/v5/public'
    this.ws = new WebSocket(url)

    this.ws.onopen = () => {
      this.state = 'connected'
      this.cb?.({ type: 'status', status: 'connected' })
      // Subscribe
      const instId = this.symbol // e.g., BTC-USDT
      const sub = {
        op: 'subscribe',
        args: [
          { channel: 'trades', instId },
          { channel: 'books', instId },
          { channel: 'tickers', instId }
        ]
      }
      this.ws?.send(JSON.stringify(sub))
    }

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string)
        if (msg.event === 'subscribe' || msg.event === 'error') return
        if (!msg.data || !Array.isArray(msg.data)) return
        // Determine channel
        const channel: string = msg.arg?.channel
        if (channel === 'trades') {
          for (const t of msg.data) {
            // OKX trade: { px, sz, side: buy/sell, ts }
            const trade: NormalizedTrade = {
              price: parseFloat(t.px),
              qty: parseFloat(t.sz),
              side: t.side === 'buy' ? 'buy' : 'sell',
              ts: Number(t.ts)
            }
            this.cb?.({ type: 'trade', data: trade })
          }
        } else if (channel === 'books') {
          // OKX books: { asks: [[px, sz, _, _]], bids: [...] , ts }
          for (const b of msg.data) {
            const depth: NormalizedDepth = {
              bids: (b.bids || []).map((x: string[]) => [parseFloat(x[0]), parseFloat(x[1])] as [number, number]),
              asks: (b.asks || []).map((x: string[]) => [parseFloat(x[0]), parseFloat(x[1])] as [number, number]),
              ts: Number(b.ts)
            }
            this.cb?.({ type: 'depth', data: depth })
          }
        } else if (channel === 'tickers') {
          for (const tk of msg.data) {
            const mark = { price: parseFloat(tk.last), ts: Number(tk.ts) }
            this.cb?.({ type: 'mark', data: mark })
            // Also treat as price update via mark
          }
        }
      } catch {}
    }

    this.ws.onerror = () => {
      this.state = 'disconnected'
      this.cb?.({ type: 'status', status: 'disconnected', message: 'OKX error' })
    }

    this.ws.onclose = () => {
      this.state = 'disconnected'
      this.cb?.({ type: 'status', status: 'disconnected' })
    }
  }

  disconnect(): void {
    this.state = 'disconnected'
    if (this.ws) {
      try { this.ws.close() } catch {}
      this.ws = null
    }
  }
}
