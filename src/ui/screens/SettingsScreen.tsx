import { useSettingsStore } from '../../store/settingsStore'
import { useDataStore } from '../../store/dataStore'
import { playBuy, playSell } from '../../core/audio/sound'
import { useState, useMemo, useEffect } from 'react'

const FALLBACK_FUTURES = [
  'BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','DOGEUSDT','ADAUSDT','AVAXUSDT','DOTUSDT','LINKUSDT','LTCUSDT','BCHUSDT','FILUSDT','ARBUSDT','OPUSDT','SUIUSDT','APTUSDT','PEPEUSDT','SHIBUSDT','TRBUSDT','BLZUSDT','WIFUSDT','ENAUSDT','TAOUSDT','NEARUSDT','UNIUSDT','ATOMUSDT','XLMUSDT','VETUSDT','ICPUSDT','FETUSDT','RNDRUSDT','INJUSDT','SEIUSDT','TIAUSDT','JUPUSDT','PYTHUSDT','BONKUSDT','FLOKIUSDT','MEMEUSDT','ORDIUSDT','1000PEPEUSDT','1000SHIBUSDT'
]

function normalizeFuturesSymbol(input: string): string {
  let s = input.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (!s) return ''
  if (!s.endsWith('USDT')) s = s.replace(/USDT$/, '') + 'USDT'
  // Remove dash already done, keep USDT
  return s
}

export function SettingsScreen() {
  const {
    source,
    symbol,
    weights,
    threshold,
    cooldown,
    sound,
    haptics,
    setSource,
    setSymbol,
    setWeights,
    setThreshold,
    setCooldown,
    setSound,
    setHaptics
  } = useSettingsStore()

  const [coinInput, setCoinInput] = useState(symbol.replace('-',''))
  const [showDropdown, setShowDropdown] = useState(false)
  const [futuresCoins, setFuturesCoins] = useState<string[]>(FALLBACK_FUTURES)

  useEffect(() => {
    fetch('https://fapi.binance.com/fapi/v1/exchangeInfo')
      .then(r => r.json())
      .then((data: any) => {
        const syms: string[] = (data.symbols || [])
          .filter((s: any) => s.status === 'TRADING' && s.contractType === 'PERPETUAL' && s.quoteAsset === 'USDT')
          .map((s: any) => s.symbol as string)
          .filter((s: string) => !s.includes('_'))
        if (syms.length > 20) setFuturesCoins(syms)
      })
      .catch(() => {})
  }, [])

  const filteredCoins = useMemo(() => {
    const q = coinInput.toUpperCase()
    if (!q) return futuresCoins.slice(0, 8)
    return futuresCoins.filter(c => c.includes(q)).slice(0, 8)
  }, [coinInput, futuresCoins])

  const handleSelectCoin = (coin: string) => {
    const norm = normalizeFuturesSymbol(coin)
    setCoinInput(norm)
    setShowDropdown(false)
    if (norm && norm !== symbol.replace('-','')) {
      // Eski verileri temizle ve yeni coine bağlan
      useDataStore.getState().reset()
      // Symbol'ü futures formatında kaydet (BTCUSDT)
      setSymbol(norm)
    }
  }

  const handleCustomCoinSubmit = () => {
    const norm = normalizeFuturesSymbol(coinInput)
    if (!norm) return
    handleSelectCoin(norm)
  }

  const handleWeight = (k: 'w1' | 'w2' | 'w3' | 'w4' | 'w5' | 'w6', v: number) => {
    const nw = { ...weights, [k]: v }
    setWeights(nw as any)
  }

  const total = weights.w1 + weights.w2 + weights.w3 + weights.w4 + weights.w5 + weights.w6

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, padding: 16, overflow: 'auto' }} className="scrollbar-thin">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', letterSpacing: 0.5 }}>BORSA KAYNAĞI</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['okx', 'binance'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSource(s)}
              style={{
                flex: 1,
                padding: '10px 12px',
                borderRadius: 12,
                border: `1px solid ${source === s ? 'var(--cyan)' : 'var(--border)'}`,
                background: source === s ? 'rgba(34,211,238,0.12)' : 'var(--surface-2)',
                color: source === s ? 'var(--cyan)' : 'var(--muted)',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                fontSize: 12,
                cursor: 'pointer'
              }}
            >
              {s.toUpperCase()} {s === 'okx' ? '• TR' : ''}
            </button>
          ))}
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>
          OKX varsayılan (TR erişim garantisi), Binance fallback
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>FUTURES COIN SEÇ (spot yok)</label>
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={coinInput}
              onChange={(e) => { setCoinInput(e.target.value.toUpperCase()); setShowDropdown(true) }}
              onFocus={() => setShowDropdown(true)}
              onBlur={() => setTimeout(()=>setShowDropdown(false), 150)}
              onKeyDown={(e) => { if (e.key==='Enter') handleCustomCoinSubmit() }}
              placeholder="BTCUSDT, PEPEUSDT..."
              style={{
                flex: 1,
                padding: '10px 12px',
                borderRadius: 12,
                border: '1px solid var(--border)',
                background: 'var(--surface-2)',
                color: 'var(--text)',
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                outline: 'none'
              }}
            />
            <button
              onClick={handleCustomCoinSubmit}
              style={{
                padding: '10px 16px',
                borderRadius: 12,
                border: '1px solid var(--cyan)',
                background: 'rgba(34,211,238,0.12)',
                color: 'var(--cyan)',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                fontSize: 12,
                cursor: 'pointer'
              }}
            >
              Seç
            </button>
          </div>
          {showDropdown && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              marginTop: 6,
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              overflow: 'hidden',
              zIndex: 10,
              maxHeight: 200,
              overflowY: 'auto'
            }}>
              {filteredCoins.map(c => (
                <button
                  key={c}
                  onMouseDown={() => handleSelectCoin(c)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '10px 12px',
                    background: c === normalizeFuturesSymbol(coinInput) ? 'rgba(34,211,238,0.1)' : 'transparent',
                    border: 'none',
                    borderBottom: '1px solid var(--border)',
                    color: c === symbol.replace('-','') ? 'var(--cyan)' : 'var(--text)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                    cursor: 'pointer',
                    fontWeight: c === symbol.replace('-','') ? 700 : 400
                  }}
                >
                  {c} {c === symbol.replace('-','') ? '• aktif' : ''}
                </button>
              ))}
              {filteredCoins.length===0 && (
                <div style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>
                  "{coinInput.toUpperCase()}" için sonuç yok — Enter ile "{normalizeFuturesSymbol(coinInput)}" olarak ekle
                </div>
              )}
            </div>
          )}
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>
          Sadece futures (BTCUSDT, ETHUSDT...). Coin değiştirince eski veriler silinir, yeni coine WS yeniden bağlanır. SPOT yok.
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--cyan)' }}>
          Aktif: <b>{symbol}</b> → {source==='okx' ? symbol.replace('USDT','-USDT-SWAP') : symbol} ({source})
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12, borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>İNDİKATÖR AĞIRLIKLARI (otomatik normalize, toplam %100) — 6’lı mikro yapı</div>
        {(['w1', 'w2', 'w3', 'w4', 'w5', 'w6'] as const).map((k) => {
          const label = k === 'w1' ? 'CVD' : k === 'w2' ? 'OBI' : k === 'w3' ? 'VEL' : k === 'w4' ? 'MICRO' : k === 'w5' ? 'VPIN' : 'DETECTOR'
          const pct = Math.round((weights[k] / total) * 100)
          const color = k==='w4' ? 'var(--amber)' : k==='w5' ? 'var(--violet)' : k==='w6' ? 'var(--green)' : 'var(--cyan)'
          return (
            <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                <span style={{ color: 'var(--text)' }}>{label} ({k})</span>
                <span style={{ color, fontWeight: 700 }}>{pct}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={weights[k]}
                onChange={(e) => handleWeight(k, parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: color }}
              />
            </div>
          )
        })}
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', textAlign: 'center' }}>
          Toplam: {total.toFixed(2)} → normalize edildi
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>EŞİK (Threshold)</label>
          <input type="range" min={0.3} max={1.2} step={0.1} value={threshold} onChange={(e) => setThreshold(parseFloat(e.target.value))} style={{ accentColor: 'var(--violet)' }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)', textAlign: 'center' }}>{threshold.toFixed(1)}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>COOLDOWN (sn)</label>
          <input type="range" min={5} max={30} step={1} value={cooldown} onChange={(e) => setCooldown(parseInt(e.target.value))} style={{ accentColor: 'var(--amber)' }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)', textAlign: 'center' }}>{cooldown}s</span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[
          { label: 'Ses', value: sound, setter: setSound },
          { label: 'Titreşim (Haptik)', value: haptics, setter: setHaptics }
        ].map((it) => (
          <label key={it.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--border)', cursor: 'pointer' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)' }}>{it.label}</span>
            <input type="checkbox" checked={it.value} onChange={(e) => it.setter(e.target.checked)} style={{ width: 18, height: 18, accentColor: 'var(--green)' }} />
          </label>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => {
            const sig = { id: `test-${Date.now()}`, side: 'BUY' as const, price: useDataStore.getState().price || 50000, confidence: 85, score: 1.1, breakdown: { cvd: 0.8, obi: 0.5, vel: 0.3, micro: 0.4, vpin: 0.2, detector: 0.5, w1: weights.w1, w2: weights.w2, w3: weights.w3, w4: weights.w4, w5: weights.w5, w6: weights.w6 }, ts: Date.now() }
            useDataStore.setState((s) => ({ signals: [sig, ...s.signals].slice(0, 200) }))
            if (sound) playBuy()
            window.dispatchEvent(new CustomEvent('signal-fired', { detail: sig }))
          }}
          className="touch-target"
          style={{ flex: 1, padding: '12px', borderRadius: 12, border: '1px solid var(--green)', background: 'rgba(52,211,153,0.12)', color: 'var(--green)', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
        >
          Test BUY Çak (880Hz)
        </button>
        <button
          onClick={() => {
            const sig = { id: `test-${Date.now()}`, side: 'SELL' as const, price: useDataStore.getState().price || 50000, confidence: 78, score: -1.0, breakdown: { cvd: -0.7, obi: -0.5, vel: -0.4, micro: -0.3, vpin: 0.6, detector: -0.6, w1: weights.w1, w2: weights.w2, w3: weights.w3, w4: weights.w4, w5: weights.w5, w6: weights.w6 }, ts: Date.now() }
            useDataStore.setState((s) => ({ signals: [sig, ...s.signals].slice(0, 200) }))
            if (sound) playSell()
            window.dispatchEvent(new CustomEvent('signal-fired', { detail: sig }))
          }}
          className="touch-target"
          style={{ flex: 1, padding: '12px', borderRadius: 12, border: '1px solid var(--red)', background: 'rgba(248,113,113,0.12)', color: 'var(--red)', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
        >
          Test SELL Çak (330Hz)
        </button>
      </div>

      <div
        style={{
          padding: 12,
          borderRadius: 12,
          background: 'rgba(251,191,36,0.08)',
          border: '1px solid rgba(251,191,36,0.2)',
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--amber)',
          lineHeight: 1.5,
          textAlign: 'center'
        }}
      >
        ⚠️ Eğlence ve eğitim amaçlıdır, yatırım tavsiyesi değildir.
      </div>
    </div>
  )
}
