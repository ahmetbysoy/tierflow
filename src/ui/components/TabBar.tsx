import { Radar, LineChart, List, Settings } from 'lucide-react'
import { useUIStore } from '../../store/uiStore'
import type { TabId } from '../../types'

const tabs: { id: TabId; label: string; icon: any; emoji: string }[] = [
  { id: 'radar', label: 'Radar', icon: Radar, emoji: '📡' },
  { id: 'chart', label: 'Chart', icon: LineChart, emoji: '📈' },
  { id: 'signals', label: 'Signals', icon: List, emoji: '✨' },
  { id: 'settings', label: 'Settings', icon: Settings, emoji: '🎀' }
]

export function TabBar() {
  const tab = useUIStore((s) => s.tab)
  const setTab = useUIStore((s) => s.setTab)
  return (
    <div
      style={{
        display: 'flex',
        borderTop: '1px solid var(--border-soft)',
        background: 'rgba(255,255,255,0.9)',
        backdropFilter: 'blur(12px)',
        padding: '8px 10px',
        gap: 8,
        paddingBottom: 'calc(8px + env(safe-area-inset-bottom))'
      }}
    >
      {tabs.map((t) => {
        const Icon = t.icon
        const active = tab === t.id
        return (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="touch-target"
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              padding: '10px 4px',
              borderRadius: 16,
              border: '1px solid transparent',
              background: active ? 'var(--pink-soft)' : 'transparent',
              color: active ? 'var(--pink-deep)' : 'var(--muted)',
              cursor: 'pointer',
              fontFamily: 'Fredoka, var(--font-mono)',
              fontSize: 10,
              fontWeight: active ? 700 : 500,
              boxShadow: active ? '0 4px 16px rgba(255,143,171,0.2)' : 'none',
              borderColor: active ? 'var(--pink)' : 'transparent',
              transform: active ? 'scale(1.02)' : 'scale(1)',
              transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)'
            }}
          >
            <span style={{ fontSize: 14, animation: active ? 'heartBeat 1.2s infinite' : undefined }}>{t.emoji}</span>
            <Icon size={14} style={{ opacity: active ? 1 : 0.7 }} />
            {t.label}
          </button>
        )
      })}
    </div>
  )
}
