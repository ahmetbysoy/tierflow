import { useDataStore } from '../../store/dataStore'
import { motion } from 'framer-motion'

export function SignalsScreen() {
  const signals = useDataStore((s) => s.signals)

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
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', letterSpacing: 0.5 }}>SON 200 SİNYAL • {signals.length}</div>
      {signals.map((s) => (
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
            <span style={{ color: 'var(--text)' }}>${s.price.toFixed(2)}</span>
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
        </motion.div>
      ))}
    </div>
  )
}
