import { Radar, LineChart, List, Settings } from 'lucide-react'
import { useUIStore } from '../../store/uiStore'
import type { TabId } from '../../types'

const tabs: { id: TabId; label: string; icon: any }[] = [
  { id: 'radar', label: 'Radar', icon: Radar },
  { id: 'chart', label: 'Chart', icon: LineChart },
  { id: 'signals', label: 'Signals', icon: List },
  { id: 'settings', label: 'Settings', icon: Settings }
]

export function TabBar() {
  const tab = useUIStore((s) => s.tab)
  const setTab = useUIStore((s) => s.setTab)
  return (
    <div
      style={{
        display: 'flex',
        borderTop: '1px solid var(--border)',
        background: 'var(--surface)',
        padding: '6px 8px',
        gap: 6,
        paddingBottom: 'calc(6px + env(safe-area-inset-bottom))'
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
              gap: 3,
              padding: '8px 4px',
              borderRadius: 12,
              border: '1px solid transparent',
              background: active ? 'var(--surface-2)' : 'transparent',
              color: active ? 'var(--cyan)' : 'var(--muted)',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              fontWeight: active ? 700 : 500,
              boxShadow: active ? '0 0 16px rgba(34,211,238,0.15)' : 'none',
              borderColor: active ? 'rgba(34,211,238,0.2)' : 'transparent',
              transition: 'all 0.2s ease'
            }}
          >
            <Icon size={18} style={{ filter: active ? 'drop-shadow(0 0 6px rgba(34,211,238,0.6))' : 'none' }} />
            {t.label}
          </button>
        )
      })}
    </div>
  )
}
