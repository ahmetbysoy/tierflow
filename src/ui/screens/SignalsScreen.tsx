import { useDataStore } from '../../store/dataStore'
import { motion } from 'framer-motion'

function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined) return '…'
  const sign = v > 0 ? '+' : ''
  return `${sign}${v.toFixed(2)}%`
}

function HorizonBadge({ label, value }: { label: string; value: number | null }) {
  const isNull = value === null
  const isPos = !isNull && value! > 0.02
  const isNeg = !isNull && value! < -0.02
  const color = isNull ? 'var(--muted)' : isPos ? 'var(--green)' : isNeg ? 'var(--red)' : 'var(--muted)'
  const bg = isNull ? 'var(--surface-2)' : isPos ? 'rgba(52,211,153,0.12)' : isNeg ? 'rgba(248,113,113,0.12)' : 'var(--surface-2)'
  return (
    <span style={{
      fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
      color, background: bg, padding: '3px 6px', borderRadius: 6, border: `1px solid ${isNull ? 'var(--border)' : isPos ? 'rgba(52,211,153,0.2)' : isNeg ? 'rgba(248,113,113,0.2)' : 'var(--border)'}`
    }}>
      {label}: {fmtPct(value)}
    </span>
  )
}

export function SignalsScreen() {
  const signals = useDataStore((s) => s.signals)
  const trackers = useDataStore((s) => s.trackers)
  const stats = useDataStore((s) => s.stats)

  const trackerMap = new Map(trackers.map(t => [t.signalId, t]))

  if (signals.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 }}>
        <div style={{ width: 120, height: 120, borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
          <div style={{ width: 80, height: 80, borderRadius: '50%', border: '1px solid rgba(34,211,238,0.2)', animation: 'pulse 2s infinite' }} />
          <div style={{ position: 'absolute', width: 2, height: 60, background: 'linear-gradient(to top, transparent, var(--cyan))', transformOrigin: 'bottom center', animation: 'spin 3s linear infinite', top: 0, left: '50%' }} />
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--text)' }}>Henüz sinyal yok — radar tarıyor...</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>Kompozit skor eşik üstüne çıktığında burada listelenecek</div>
        </div>
        <style>{`@keyframes spin{to{transform:translateX(-50%) rotate(360deg)}} @keyframes pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.05);opacity:0.7}}`}</style>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, padding: 16, overflow: 'auto' }} className="scrollbar-thin">
      {/* Stats header */}
      <div style={{ padding: 10, borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', letterSpacing: 0.5, display: 'flex', justifyContent: 'space-between' }}>
          <span>SON {stats.count} SİNYAL • {signals.length} toplam</span>
          <span style={{ color: stats.count > 0 && stats.win60s >= 0.55 ? 'var(--green)' : stats.count > 0 && stats.win60s < 0.45 ? 'var(--red)' : 'var(--muted)' }}>
            Win 60s: {(stats.win60s*100).toFixed(0)}%
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontFamily: 'var(--font-mono)', fontSize: 10 }}>
          <span style={{ color: 'var(--muted)' }}>15s: <b style={{ color: stats.avg15s>=0?'var(--green)':'var(--red)' }}>{fmtPct(stats.avg15s)}</b> ({(stats.win15s*100).toFixed(0)}%)</span>
          <span style={{ color: 'var(--muted)' }}>60s: <b style={{ color: stats.avg60s>=0?'var(--green)':'var(--red)' }}>{fmtPct(stats.avg60s)}</b> ({(stats.win60s*100).toFixed(0)}%)</span>
          <span style={{ color: 'var(--muted)' }}>5m: <b style={{ color: stats.avg300s>=0?'var(--green)':'var(--red)' }}>{fmtPct(stats.avg300s)}</b> ({(stats.win300s*100).toFixed(0)}%)</span>
          <span style={{ color: 'var(--muted)' }}>MFE <b style={{ color: 'var(--green)' }}>{fmtPct(stats.avgMfe)}</b> / MAE <b style={{ color: 'var(--red)' }}>{fmtPct(stats.avgMae)}</b></span>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', opacity: 0.7 }}>
          Canlı: her sinyalin giriş fiyatından itibaren forward return. MFE/MAE en iyi/kötü an.
        </div>
      </div>

      {signals.map((s) => {
        const tr = trackerMap.get(s.id)
        return (
          <motion.div
            key={s.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              padding: 12,
              borderRadius: 12,
              background: s.side === 'BUY' ? 'rgba(52,211,153,0.06)' : 'rgba(248,113,113,0.06)',
              border: `1px solid ${s.side === 'BUY' ? 'rgba(52,211,153,0.15)' : 'rgba(248,113,113,0.15)'}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 8
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 800,
                  fontSize: 12,
                  color: s.side === 'BUY' ? 'var(--green)' : 'var(--red)',
                  background: s.side === 'BUY' ? 'rgba(52,211,153,0.15)' : 'rgba(248,113,113,0.15)',
                  padding: '4px 8px',
                  borderRadius: 999
                }}
              >
                {s.side}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>{new Date(s.ts).toLocaleTimeString()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
              <span style={{ color: 'var(--text)' }}>${(s as any).priceStr || s.price}</span>
              <span style={{ color: 'var(--muted)' }}>Skor {s.score.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, height: 6, background: 'var(--surface-2)', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{ width: `${s.confidence}%`, height: '100%', background: s.side === 'BUY' ? 'var(--green)' : 'var(--red)', borderRadius: 999 }} />
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)', fontWeight: 700 }}>{s.confidence}%</span>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', display: 'flex', gap: 8 }}>
              <span>CVD {s.breakdown.cvd.toFixed(2)}</span>
              <span>•</span>
              <span>OBI {s.breakdown.obi.toFixed(2)}</span>
              <span>•</span>
              <span>VEL {s.breakdown.vel.toFixed(2)}</span>
            </div>

            {/* Forward return tracker */}
            {tr ? (
              <div style={{ marginTop: 4, paddingTop: 8, borderTop: '1px dashed var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <HorizonBadge label="15s" value={tr.horizons['15s']} />
                  <HorizonBadge label="30s" value={tr.horizons['30s']} />
                  <HorizonBadge label="60s" value={tr.horizons['60s']} />
                  <HorizonBadge label="5m" value={tr.horizons['300s']} />
                  <HorizonBadge label="15m" value={tr.horizons['900s']} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>
                  <span>Canlı: <b style={{ color: tr.live>=0?'var(--green)':'var(--red)' }}>{fmtPct(tr.live)}</b></span>
                  <span>MFE: <b style={{ color: 'var(--green)' }}>{fmtPct(tr.mfe)}</b> / MAE: <b style={{ color: 'var(--red)' }}>{fmtPct(tr.mae)}</b></span>
                  <span style={{ opacity: 0.7 }}>{tr.closed ? 'kapatıldı' : 'takipte'}</span>
                </div>
              </div>
            ) : (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', opacity: 0.6 }}>Takip başlatılıyor...</div>
            )}
          </motion.div>
        )
      })}
    </div>
  )
}
