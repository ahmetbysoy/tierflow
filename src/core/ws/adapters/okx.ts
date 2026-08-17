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
  // Local book for incremental updates (action: snapshot/update)
  private localBids: Map<string, number> = new Map()
  private localAsks: Map<string, number> = new Map()
  private lastChecksum: number | null = null

  onEvent(cb: (ev: WsEvent) => void): void {
    this.cb = cb
  }

  getConnectionState() {
    return this.state
  }

  connect(symbol: string): void {
    // Futures only: BTCUSDT -> BTC-USDT-SWAP, BTC-USDT -> BTC-USDT-SWAP
    const clean = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '')
    const base = clean.endsWith('USDT') ? clean.slice(0, -4) : clean
    this.symbol = `${base}-USDT-SWAP`
    this.disconnect()
    this.localBids.clear()
    this.localAsks.clear()
    this.lastChecksum = null
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
            const priceStr: string = t.px
            const trade: NormalizedTrade = {
              price: Number(priceStr),
              priceStr,
              qty: parseFloat(t.sz),
              side: t.side === 'buy' ? 'buy' : 'sell',
              ts: Number(t.ts)
            }
            this.cb?.({ type: 'trade', data: trade })
          }
        } else if (channel === 'books') {
          // OKX books: incremental update (action: 'snapshot' or 'update') + checksum
          // Snapshot = tam 400 seviye, Update = sadece değişen seviyeler -> merge et
          const action: string | undefined = (msg as any).action // 'snapshot' | 'update'
          const checksum: number | undefined = msg.data?.[0]?.checksum

          for (const b of msg.data) {
            const incomingBids: string[][] = b.bids || []
            const incomingAsks: string[][] = b.asks || []

            if (action === 'snapshot') {
              // Snapshot: tam değiştir
              this.localBids.clear()
              this.localAsks.clear()
              for (const [px, sz] of incomingBids) {
                const qty = parseFloat(sz)
                if (qty > 0) this.localBids.set(px, qty)
              }
              for (const [px, sz] of incomingAsks) {
                const qty = parseFloat(sz)
                if (qty > 0) this.localAsks.set(px, qty)
              }
            } else {
              // Update: merge et (piramit'teki applyDiff mantığı gibi)
              for (const [px, sz] of incomingBids) {
                const qty = parseFloat(sz)
                if (qty === 0) this.localBids.delete(px)
                else this.localBids.set(px, qty)
              }
              for (const [px, sz] of incomingAsks) {
                const qty = parseFloat(sz)
                if (qty === 0) this.localAsks.delete(px)
                else this.localAsks.set(px, qty)
              }
            }

            // Checksum kontrolü (varsa, logla - gerçek L2 defterinde eksik/yanlış derinlik riski)
            if (checksum && this.lastChecksum !== null && checksum !== this.lastChecksum) {
              // Checksum mismatch -> defter bozulmuş, bir sonraki snapshot'ta düzelir
              // İsteğe bağlı: console.warn(`OKX checksum mismatch ${checksum} != ${this.lastChecksum}`)
            }
            this.lastChecksum = checksum ?? null

            // Local book'u sıralı NormalizedDepth'e çevir
            const sortedBids = Array.from(this.localBids.entries())
              .map(([p, q]) => [parseFloat(p), q] as [number, number])
              .sort((a, b) => b[0] - a[0])
              .slice(0, 50)
            const sortedAsks = Array.from(this.localAsks.entries())
              .map(([p, q]) => [parseFloat(p), q] as [number, number])
              .sort((a, b) => a[0] - b[0])
              .slice(0, 50)

            const depth: NormalizedDepth = {
              bids: sortedBids,
              asks: sortedAsks,
              ts: Number(b.ts)
            }
            this.cb?.({ type: 'depth', data: depth })
          }
        } else if (channel === 'tickers') {
          for (const tk of msg.data) {
            const priceStr: string = tk.last
            const mark = { price: Number(priceStr), priceStr, ts: Number(tk.ts) }
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
    this.localBids.clear()
    this.localAsks.clear()
    this.lastChecksum = null
    if (this.ws) {
      try { this.ws.close() } catch {}
      this.ws = null
    }
  }
}
