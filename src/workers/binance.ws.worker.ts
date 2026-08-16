/**
 * G1 - Binance Futures WS Worker
 * tierflow / whale-vampire
 * 
 * Özellikler:
 * - Kullanıcının browser'ından direkt Binance WS'e bağlanır (0 sunucu maliyeti, 0 451)
 * - Silent drop koruması: 5s ping/pong + 3s packet staleness check
 * - Exponential backoff + jitter ile reconnect
 * - Multi-stream: depth@100ms + aggTrade
 */

export type WorkerMessage =
  | { type: 'SUBSCRIBE'; symbols: string[] }
  | { type: 'UNSUBSCRIBE'; symbols: string[] }
  | { type: 'PING' }

export type WorkerOutMessage =
  | { type: 'DEPTH'; symbol: string; bids: [string, string][]; asks: [string, string][]; timestamp: number }
  | { type: 'TRADE'; symbol: string; price: string; qty: string; isBuyerMaker: boolean; timestamp: number }
  | { type: 'STATUS'; status: 'connected' | 'disconnected' | 'reconnecting'; message?: string }
  | { type: 'PONG'; timestamp: number }
  | { type: 'ERROR'; error: string }

const WS_BASE = 'wss://fstream.binance.com'
const PING_INTERVAL = 5000
const STALE_THRESHOLD = 3000
const RECONNECT_BASE = 1000
const RECONNECT_MAX = 30000

let ws: WebSocket | null = null
let symbols: string[] = ['btcusdt', 'ethusdt', 'blzusdt'] // test: blzusdt = düşük hacimli çöp test tahtası
let pingTimer: number | null = null
let staleTimer: number | null = null
let reconnectAttempts = 0
let lastPacketTime = Date.now()
let shouldReconnect = true

function buildUrl(syms: string[]) {
  const streams = syms.flatMap(s => [
    `${s}@depth20@100ms`,
    `${s}@aggTrade`
  ])
  return `${WS_BASE}/stream?streams=${streams.join('/')}`
}

function startPingPong() {
  stopPingPong()
  pingTimer = self.setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      // Binance combined stream'de ping frame'i desteklemiyor, app-level ping atıyoruz
      // ws.ping() yok browser'da, bu yüzden lightweight istek
      try {
        (ws as any).send(JSON.stringify({ method: 'PING' }))
      } catch {}
      
      // Stale check: son paket 3s'den eskiyse öldür
      if (Date.now() - lastPacketTime > STALE_THRESHOLD) {
        console.warn('[G1] Stale detected, killing socket')
        postStatus('reconnecting', 'stale - reconnecting')
        killAndReconnect()
      }
    }
  }, PING_INTERVAL) as unknown as number

  staleTimer = self.setInterval(() => {
    if (Date.now() - lastPacketTime > STALE_THRESHOLD && ws?.readyState === WebSocket.OPEN) {
      console.warn('[G1] No packet for 3s, force reconnect')
      killAndReconnect()
    }
  }, 1000) as unknown as number
}

function stopPingPong() {
  if (pingTimer) clearInterval(pingTimer)
  if (staleTimer) clearInterval(staleTimer)
  pingTimer = null
  staleTimer = null
}

function postStatus(status: WorkerOutMessage extends { type: 'STATUS', status: infer S } ? S : never, message?: string) {
  (self as any).postMessage({ type: 'STATUS', status, message } as WorkerOutMessage)
}

function killAndReconnect() {
  stopPingPong()
  if (ws) {
    try { ws.close() } catch {}
    ws = null
  }
  if (shouldReconnect) scheduleReconnect()
}

function scheduleReconnect() {
  reconnectAttempts++
  const delay = Math.min(RECONNECT_BASE * Math.pow(2, reconnectAttempts - 1) + Math.random() * 1000, RECONNECT_MAX)
  postStatus('reconnecting', `reconnect #${reconnectAttempts} in ${Math.round(delay)}ms`)
  console.log(`[G1] Reconnect in ${delay}ms (attempt ${reconnectAttempts})`)
  setTimeout(() => connect(), delay)
}

function connect() {
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) return

  const url = buildUrl(symbols)
  console.log('[G1] Connecting to', url)
  postStatus('reconnecting', 'connecting...')

  ws = new WebSocket(url)
  // @ts-ignore - browser WebSocket binaryType
  ws.binaryType = 'arraybuffer'

  ws.onopen = () => {
    console.log('[G1] Connected')
    reconnectAttempts = 0
    lastPacketTime = Date.now()
    postStatus('connected')
    startPingPong()
  }

  ws.onmessage = (event) => {
    lastPacketTime = Date.now()
    try {
      const msg = JSON.parse(event.data as string)
      
      // Combined stream format: { stream: "btcusdt@depth...", data: {...} }
      const stream: string = msg.stream
      const data = msg.data

      if (!stream || !data) {
        // ping response vs.
        return
      }

      if (stream.includes('@depth')) {
        const symbol = stream.split('@')[0]
        const out: WorkerOutMessage = {
          type: 'DEPTH',
          symbol: symbol.toUpperCase(),
          bids: data.bids,
          asks: data.asks,
          timestamp: data.E || Date.now()
        }
        ;(self as any).postMessage(out)
      } else if (stream.includes('@aggTrade')) {
        const symbol = stream.split('@')[0]
        const out: WorkerOutMessage = {
          type: 'TRADE',
          symbol: symbol.toUpperCase(),
          price: data.p,
          qty: data.q,
          isBuyerMaker: data.m,
          timestamp: data.T
        }
        ;(self as any).postMessage(out)
      }
    } catch (e) {
      console.error('[G1] Parse error', e)
    }
  }

  ws.onerror = (e) => {
    console.error('[G1] WS error', e)
    ;(self as any).postMessage({ type: 'ERROR', error: 'WS error' } as WorkerOutMessage)
  }

  ws.onclose = (ev) => {
    console.log('[G1] Closed', ev.code, ev.reason)
    stopPingPong()
    postStatus('disconnected', `closed ${ev.code}`)
    if (shouldReconnect && ev.code !== 1000) {
      scheduleReconnect()
    }
  }
}

// Worker message handler
self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const msg = e.data
  switch (msg.type) {
    case 'SUBSCRIBE':
      symbols = msg.symbols.map(s => s.toLowerCase())
      shouldReconnect = true
      if (ws) {
        try { ws.close() } catch {}
        ws = null
      }
      connect()
      break
    case 'UNSUBSCRIBE':
      // basit: yeniden bağlan
      symbols = symbols.filter(s => !msg.symbols.map(x => x.toLowerCase()).includes(s))
      if (ws) { try { ws.close() } catch {} ; ws = null }
      if (symbols.length > 0) connect()
      break
    case 'PING':
      ;(self as any).postMessage({ type: 'PONG', timestamp: Date.now() } as WorkerOutMessage)
      break
  }
}

// Auto-connect on worker start
connect()
