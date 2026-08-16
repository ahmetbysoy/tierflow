import { useEffect, useState } from 'react'
import { Header } from '../ui/components/Header'
import { TabBar } from '../ui/components/TabBar'
import { RadarScreen } from '../ui/screens/RadarScreen'
import { ChartScreen } from '../ui/screens/ChartScreen'
import { SignalsScreen } from '../ui/screens/SignalsScreen'
import { SettingsScreen } from '../ui/screens/SettingsScreen'
import { useUIStore } from '../store/uiStore'
import { useSettingsStore } from '../store/settingsStore'
import { useDataStore } from '../store/dataStore'
import { WsManager } from '../core/ws/wsManager'
import { playBuy, playSell, playDisconnect } from '../core/audio/sound'
import '../styles/global.css'

export default function App() {
  const tab = useUIStore((s) => s.tab)
  const { source, symbol, sound, haptics } = useSettingsStore()
  const [connection, setConnection] = useState<'connected' | 'connecting' | 'disconnected'>('connecting')

  useEffect(() => {
    const mgr = new WsManager((ev) => {
      if (ev.type === 'status') {
        setConnection(ev.status as any)
        if (ev.status === 'disconnected' && sound) playDisconnect()
        return
      }
      if (ev.type === 'trade') useDataStore.getState().handleTrade(ev.data)
      if (ev.type === 'depth') useDataStore.getState().handleDepth(ev.data)
      if (ev.type === 'mark') useDataStore.getState().handleMark(ev.data.price, ev.data.ts)
    })
    mgr.connect(source, symbol)
    return () => mgr.disconnect()
    // Reconnect when source/symbol changes - create new manager
  }, [source, symbol])

  // Audio/haptic on signal
  useEffect(() => {
    const handler = (e: Event) => {
      const sig = (e as CustomEvent).detail
      if (!sig) return
      if (sound) {
        if (sig.side === 'BUY') playBuy()
        else playSell()
      }
      if (haptics && 'vibrate' in navigator) {
        // haptics handled in sound.ts, but also here for test signals
      }
    }
    window.addEventListener('signal-fired', handler as EventListener)
    return () => window.removeEventListener('signal-fired', handler as EventListener)
  }, [sound, haptics])

  return (
    <div className="phone-canvas">
      <Header connection={connection} onToggleSound={() => useSettingsStore.getState().setSound(!sound)} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)' }}>
        {tab === 'radar' && <RadarScreen />}
        {tab === 'chart' && <ChartScreen />}
        {tab === 'signals' && <SignalsScreen />}
        {tab === 'settings' && <SettingsScreen />}
      </div>
      <TabBar />
      <div style={{ padding: '6px 12px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
        ⚠️ Eğlence ve eğitim amaçlıdır, yatırım tavsiyesi değildir. • Signal Radar v1.0
      </div>
    </div>
  )
}
