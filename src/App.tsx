import { useEffect, useRef, useState } from 'react'
import { useOrderflowStore } from './stores/useOrderflowStore'
import { PyramidCanvas } from './components/PyramidCanvas'

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'BLZUSDT', 'TRBUSDT']

export default function App() {
  const activeSymbol = useOrderflowStore(s => s.activeSymbol)
  const setActiveSymbol = useOrderflowStore(s => s.setActiveSymbol)
  const tickers = useOrderflowStore(s => s.tickers)
  const handleDepth = useOrderflowStore(s => s.handleDepth)
  const handleTrade = useOrderflowStore(s => s.handleTrade)
  const setStatus = useOrderflowStore(s => s.setStatus)
  const [log, setLog] = useState<string[]>([])
  const workerRef = useRef<Worker | null>(null)

  const active = tickers[activeSymbol]

  useEffect(() => {
    // G1 Worker'ı başlat
    const worker = new Worker(new URL('./workers/binance.ws.worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker

    worker.onmessage = (e) => {
      const msg = e.data
      if (msg.type === 'DEPTH') {
        handleDepth(msg.symbol, msg.bids, msg.asks, msg.timestamp)
      } else if (msg.type === 'TRADE') {
        handleTrade(msg.symbol, msg.price, msg.qty, msg.isBuyerMaker)
      } else if (msg.type === 'STATUS') {
        setStatus(msg.status)
        setLog(l => [`[${new Date().toLocaleTimeString()}] ${msg.status} ${msg.message ?? ''}`, ...l].slice(0, 50))
      } else if (msg.type === 'ERROR') {
        setLog(l => [`[ERR] ${msg.error}`, ...l].slice(0, 50))
      }
    }

    // İlk subscribe
    worker.postMessage({ type: 'SUBSCRIBE', symbols: SYMBOLS })

    return () => {
      worker.terminate()
    }
  }, [])

  const switchSymbol = (s: string) => {
    setActiveSymbol(s)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#020617', color: '#e2e8f0', fontFamily: 'monospace', padding: 24 }}>
      <header style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, letterSpacing: 1 }}>TIERFLOW <span style={{ color: '#06b6d4' }}>◆</span> <span style={{ fontSize: 12, color: '#64748b', fontWeight: 400 }}>whale-vampire</span></h1>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 12 }}>Retail vs Whale Divergence • L5 VWAP • Vercel Static • Client-side WS</p>
        </div>
        <div style={{ textAlign: 'right', fontSize: 11, color: '#64748b' }}>
          <div>STATUS: <span style={{ color: active?.status === 'connected' ? '#22c55e' : '#f59e0b' }}>{active?.status ?? 'booting'}</span></div>
          <div>Cooldown: {active?.cooldownRemaining ? Math.ceil(active.cooldownRemaining/1000)+'s' : 'hazır'}</div>
          <div style={{ marginTop: 4, color: '#334155' }}>@WhaleDrainBot • vercel static</div>
        </div>
      </header>

      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: '420px 1fr', gap: 24 }}>
        {/* Sol: Piramit */}
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            {SYMBOLS.map(s => (
              <button
                key={s}
                onClick={() => switchSymbol(s)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: '1px solid ' + (activeSymbol === s ? '#06b6d4' : '#1e293b'),
                  background: activeSymbol === s ? '#0e7490' : '#0f172a',
                  color: activeSymbol === s ? '#ecfeff' : '#94a3b8',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: activeSymbol === s ? 700 : 400
                }}
              >
                {s} {s === 'BLZUSDT' && '• TEST'}
              </button>
            ))}
          </div>
          <PyramidCanvas symbol={activeSymbol} />
          
          <div style={{ marginTop: 12, background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, padding: 12 }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>SCALP EŞİKLERİ (kilitli)</div>
            <div style={{ fontSize: 12, lineHeight: 1.6 }}>
              <div>Entry: <span style={{ color: '#22c55e' }}>Score &gt; +75</span> (L5 %70+ Alıcı / L1-L2 %60+ Satıcı + Absorpsiyon)</div>
              <div>TP: <span style={{ color: '#eab308' }}>L5 VWAP + %0.4</span> &nbsp; SL: L5 likidite altı %0.2</div>
              <div>Cooldown: <span style={{ color: '#f59e0b' }}>180s</span> • Test tahtası: BLZUSDT / TRBUSDT</div>
            </div>
          </div>
        </div>

        {/* Sağ: Orderflow detay + sinyal */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Sinyal kartı */}
          <div style={{
            background: active?.signal?.side ? (active.signal.side === 'LONG' ? '#052e1a' : '#450a0a') : '#0f172a',
            border: '1px solid ' + (active?.signal?.side ? (active.signal.side === 'LONG' ? '#16a34a' : '#dc2626') : '#1e293b'),
            borderRadius: 12,
            padding: 16
          }}>
            <div style={{ fontSize: 11, color: '#94a3b8', letterSpacing: 1 }}>SİNYAL</div>
            <div style={{ fontSize: 28, fontWeight: 800, margin: '6px 0', color: active?.signal?.side ? (active.signal.side === 'LONG' ? '#4ade80' : '#f87171') : '#64748b' }}>
              {active?.signal?.side ?? 'BEKLE'}
            </div>
            <div style={{ fontSize: 12, color: '#cbd5e1' }}>{active?.signal?.reason ?? 'Divergence bekleniyor...'}</div>
            {active?.divergence && (
              <div style={{ marginTop: 10, display: 'flex', gap: 12, fontSize: 11 }}>
                <span style={{ background: '#1e293b', padding: '4px 8px', borderRadius: 6 }}>Score: <b style={{ color: '#f8fafc' }}>{active.divergence.score}</b></span>
                <span style={{ background: '#1e293b', padding: '4px 8px', borderRadius: 6 }}>Abs: {active.divergence.hasAbsorption ? '✅' : '❌'}</span>
                <span style={{ background: '#1e293b', padding: '4px 8px', borderRadius: 6 }}>Conf: {active.divergence.confidence}</span>
                <span style={{ background: '#1e293b', padding: '4px 8px', borderRadius: 6 }}>L5 VWAP: {active.divergence.l5Vwap.toFixed(2)}</span>
              </div>
            )}
            {active?.divergence?.confidence === 'low' && (
              <div style={{ marginTop: 8, fontSize: 11, color: '#f59e0b' }}>⚠️ Düşük hacim - BLZ/TRB edge case: yetersiz veri, sinyal bastırıldı</div>
            )}
          </div>

          {/* Canlı orderbook özet */}
          <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>CANLI DERİNLİK ({activeSymbol})</div>
            {!active?.bids?.length ? (
              <div style={{ color: '#475569', fontSize: 12 }}>WS bağlanıyor... Kullanıcının IP'sinden Binance WS'e vuruluyor, sunucu yok.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, fontSize: 11 }}>
                <div>
                  <div style={{ color: '#22c55e', marginBottom: 6 }}>BIDS</div>
                  {active.bids.slice(0, 7).map(([p,q], i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', opacity: 1 - i*0.1 }}>
                      <span style={{ color: '#4ade80' }}>{parseFloat(p).toFixed(2)}</span>
                      <span style={{ color: '#94a3b8' }}>{parseFloat(q).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <div style={{ color: '#ef4444', marginBottom: 6 }}>ASKS</div>
                  {active.asks.slice(0, 7).map(([p,q], i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', opacity: 1 - i*0.1 }}>
                      <span style={{ color: '#f87171' }}>{parseFloat(p).toFixed(2)}</span>
                      <span style={{ color: '#94a3b8' }}>{parseFloat(q).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div style={{ marginTop: 12, fontSize: 10, color: '#475569' }}>
              G1 silent-drop koruması aktif: 5s ping / 3s stale kill + exponential backoff. G2 12fps lerp ile canvas render - DOM kasmıyor.
            </div>
          </div>

          {/* Log */}
          <div style={{ background: '#020617', border: '1px solid #1e293b', borderRadius: 12, padding: 12, maxHeight: 180, overflow: 'auto' }}>
            <div style={{ fontSize: 10, color: '#475569', marginBottom: 6 }}>WORKER LOG</div>
            {log.length === 0 ? <div style={{ fontSize: 11, color: '#334155' }}>henüz log yok</div> : log.map((l,i) => (
              <div key={i} style={{ fontSize: 11, color: '#64748b', borderBottom: '1px solid #0f172a', padding: '2px 0' }}>{l}</div>
            ))}
          </div>

          <div style={{ fontSize: 10, color: '#334155', lineHeight: 1.5 }}>
            ⚠️ Bu bir yatırım tavsiyesi değil. Tierflow sadece orderflow görselleştirmedir. Scalp stratejisi backtest edilmeden canlıya alma. Vercel static deploy = senin IP'nden WS, bizde log yok.
          </div>
        </div>
      </div>

      <style>{`@media(max-width: 900px){ div[style*="grid-template-columns: 420px"]{ grid-template-columns: 1fr !important } }`}</style>
    </div>
  )
}
