import type { WsAdapter, WsEvent } from '../types'
import type { NormalizedTrade, NormalizedDepth } from '../../../types'

/**
 * Binance Futures Adapter - fallback
 * wss://fstream.binance.com/stream?streams=...
 */
export class BinanceAdapter implements WsAdapter {
  id = 'binance'
  private ws: WebSocket | null = null
  private cb: ((ev: WsEvent) => void) | null = null
  private symbol = 'btcusdt'
  private state: 'connected' | 'connecting' | 'disconnected' = 'disconnected'

  onEvent(cb: (ev: WsEvent) => void): void {
    this.cb = cb
  }

  getConnectionState() {
    return this.state
  }

  connect(symbol: string): void {
    // Normalize BTC-USDT -> btcusdt, BTCUSDT -> btcusdt
    this.symbol = symbol.toLowerCase().replace('-', '').replace('/', '')
    this.disconnect()
    this.state = 'connecting'
    this.cb?.({ type: 'status', status: 'connecting', message: 'Binance connecting...' })

    const streams = [
      `${this.symbol}@aggTrade`,
      `${this.symbol}@depth20@100ms`,
      `${this.symbol}@markPrice@1s`
    ].join('/')
    const url = `wss://fstream.binance.com/stream?streams=${streams}`
    this.ws = new WebSocket(url)

    this.ws.onopen = () => {
      this.state = 'connected'
      this.cb?.({ type: 'status', status: 'connected' })
    }

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string)
        const stream: string = msg.stream
        const data = msg.data
        if (!stream || !data) return
        if (stream.includes('@aggTrade')) {
          const priceStr: string = data.p
          const priceNum = Number(priceStr)
          const trade: NormalizedTrade = {
            price: priceNum,
            priceStr,
            qty: parseFloat(data.q),
            side: data.m ? 'sell' : 'buy', // m = isBuyerMaker -> sell
            ts: data.T
          }
          this.cb?.({ type: 'trade', data: trade })
        } else if (stream.includes('@depth')) {
          const depth: NormalizedDepth = {
            bids: (data.bids || []).map((x: string[]) => [parseFloat(x[0]), parseFloat(x[1])] as [number, number]),
            asks: (data.asks || []).map((x: string[]) => [parseFloat(x[0]), parseFloat(x[1])] as [number, number]),
            ts: data.E || Date.now()
          }
          this.cb?.({ type: 'depth', data: depth })
        } else if (stream.includes('@markPrice')) {
          const priceStr: string = data.p
          const mark = { price: Number(priceStr), priceStr, ts: data.E }
          this.cb?.({ type: 'mark', data: mark })
        }
      } catch {}
    }

    this.ws.onerror = () => {
      this.state = 'disconnected'
      this.cb?.({ type: 'status', status: 'disconnected', message: 'Binance error' })
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
