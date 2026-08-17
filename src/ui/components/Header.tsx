import { useDataStore } from '../../store/dataStore'
import { useSettingsStore } from '../../store/settingsStore'
import { PriceTicker } from './PriceTicker'
import { Volume2, VolumeX, Activity } from 'lucide-react'
import type { ConnectionState } from '../../types'

export function Header({ connection, onToggleSound }: { connection: ConnectionState; onToggleSound: () => void }) {
  const price = useDataStore((s) => s.price)
  const priceStr = useDataStore((s) => s.priceStr)
  const symbol = useSettingsStore((s) => s.symbol)
  const sound = useSettingsStore((s) => s.sound)

  const isLive = connection === 'connected'
  const pillBg = isLive ? 'var(--mint-soft)' : connection === 'connecting' ? '#FFF3CD' : '#FFE0E0'
  const pillColor = isLive ? '#0A7A42' : connection === 'connecting' ? '#8A6D00' : '#B00020'
  const pillEmoji = isLive ? '🟢' : connection === 'connecting' ? '🟡' : '🔴'
  const pillLabel = isLive ? 'Canlı' : connection === 'connecting' ? 'Bağlanıyor' : 'Kopuk'

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 14px',
        borderBottom: '1px solid var(--border-soft)',
        background: 'rgba(255,255,255,0.9)',
        backdropFilter: 'blur(12px)',
        gap: 10
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 12px',
            borderRadius: 999,
            background: pillBg,
            border: `1px solid ${pillColor}20`,
            fontFamily: 'Fredoka, var(--font-mono)',
            fontSize: 11,
            fontWeight: 700,
            color: pillColor,
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            animation: isLive ? 'pop 0.4s ease' : undefined
          }}
        >
          <span style={{ fontSize: 10 }}>{pillEmoji}</span>
          {pillLabel}
        </div>
        <div style={{ width: 28, height: 28, borderRadius: 10, background: 'var(--purple-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>📡</div>
      </div>

      <PriceTicker price={price} priceStr={priceStr} symbol={symbol} />

      <button
        onClick={onToggleSound}
        className="touch-target"
        style={{
          width: 36,
          height: 36,
          borderRadius: 12,
          border: '1px solid var(--border-soft)',
          background: sound ? 'var(--pink-soft)' : 'var(--surface-2)',
          color: sound ? 'var(--pink-deep)' : 'var(--muted)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: '0 2px 8px rgba(255,143,171,0.15)',
          transition: 'transform 0.15s',
          transform: sound ? 'scale(1)' : 'scale(0.95)'
        }}
        aria-label={sound ? 'Sesi kapat' : 'Sesi aç'}
        onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.9)')}
        onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
      >
        {sound ? <Volume2 size={16} /> : <VolumeX size={16} />}
      </button>

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.6}} @keyframes pop{0%{transform:scale(0.8)}60%{transform:scale(1.08)}100%{transform:scale(1)}}`}</style>
    </div>
  )
}
