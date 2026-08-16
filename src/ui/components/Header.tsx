import { useDataStore } from '../../store/dataStore'
import { useSettingsStore } from '../../store/settingsStore'
import { PriceTicker } from './PriceTicker'
import { Volume2, VolumeX, Activity } from 'lucide-react'
import type { ConnectionState } from '../../types'

export function Header({ connection, onToggleSound }: { connection: ConnectionState; onToggleSound: () => void }) {
  const price = useDataStore((s) => s.price)
  const symbol = useSettingsStore((s) => s.symbol)
  const sound = useSettingsStore((s) => s.sound)

  const pillColor =
    connection === 'connected' ? 'var(--green)' : connection === 'connecting' ? 'var(--amber)' : 'var(--red)'
  const pillLabel = connection === 'connected' ? 'Canlı' : connection === 'connecting' ? 'Bağlanıyor' : 'Kopuk'

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
        gap: 12
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 10px',
            borderRadius: 999,
            background: 'var(--surface-2)',
            border: `1px solid ${pillColor}40`,
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            fontWeight: 700,
            color: pillColor
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: pillColor,
              boxShadow: connection === 'connected' ? `0 0 8px ${pillColor}` : 'none',
              animation: connection === 'connected' ? 'pulse 1.5s infinite' : connection === 'connecting' ? 'pulse 0.8s infinite' : 'none'
            }}
          />
          {pillLabel}
          <Activity size={12} style={{ opacity: 0.7 }} />
        </div>
      </div>

      <PriceTicker price={price} symbol={symbol} />

      <button
        onClick={onToggleSound}
        className="touch-target"
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          border: '1px solid var(--border)',
          background: 'var(--surface-2)',
          color: sound ? 'var(--text)' : 'var(--muted)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer'
        }}
        aria-label={sound ? 'Sesi kapat' : 'Sesi aç'}
      >
        {sound ? <Volume2 size={16} /> : <VolumeX size={16} />}
      </button>

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}`}</style>
    </div>
  )
}
