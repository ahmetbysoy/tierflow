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
import { _internal as dataInternal } from '../store/dataStore'
import '../styles/global.css'

export default function App() {
  const tab = useUIStore((s) => s.tab)
  const { source, symbol, sound, haptics } = useSettingsStore()
  const [connection, setConnection] = useState<'connected' | 'connecting' | 'disconnected'>('connecting')

  useEffect(() => {
    // Coin değişince eski verileri temizle
    useDataStore.getState().reset()
    const mgr = new WsManager((ev) => {
      if (ev.type === 'status') {
        setConnection(ev.status as any)
        if (ev.status === 'disconnected' && sound) playDisconnect()
        return
      }
      if (ev.type === 'trade') useDataStore.getState().handleTrade(ev.data)
      if (ev.type === 'depth') useDataStore.getState().handleDepth(ev.data)
      if (ev.type === 'mark') useDataStore.getState().handleMark(ev.data.price, ev.data.ts, (ev.data as any).priceStr)
    })
    mgr.connect(source, symbol)
    return () => mgr.disconnect()
    // Reconnect when source/symbol changes - create new manager
  }, [source, symbol])

  useEffect(() => {
    // Futures coin değişince CrossExchange poller'ı da yeni sembole bağla
    try {
      const clean = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '')
      const base = clean.endsWith('USDT') ? clean.slice(0, -4) : clean
      const futuresSym = base ? `${base}USDT` : 'BTCUSDT'
      ;(dataInternal as any).crossExchangePoller?.start(futuresSym)
    } catch {}
  }, [symbol])

  // Expose for Playwright debug
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // @ts-ignore
      window.__DATASTORE__ = useDataStore
      // @ts-ignore
      window.__SETTINGS__ = useSettingsStore
      // @ts-ignore
      import('../store/dataStore').then(m => { /* @ts-ignore */ window.__INTERNAL__ = m._internal })
    }
  }, [])

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
    <>
      <div className="pastel-bg">
        <div className="pastel-blob pastel-blob-1" />
        <div className="pastel-blob pastel-blob-2" />
        <div className="pastel-blob pastel-blob-3" />
      </div>
      <div className="phone-canvas">
        <Header connection={connection} onToggleSound={() => useSettingsStore.getState().setSound(!sound)} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'transparent' }}>
          {tab === 'radar' && <RadarScreen />}
          {tab === 'chart' && <ChartScreen />}
          {tab === 'signals' && <SignalsScreen />}
          {tab === 'settings' && <SettingsScreen />}
        </div>
        <TabBar />
        <div style={{ padding: '8px 12px', textAlign: 'center', fontFamily: 'Fredoka, var(--font-mono)', fontSize: 10, color: 'var(--muted)', borderTop: '1px solid var(--border-soft)', background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(8px)' }}>
          ✨ Eğlence ve eğitim amaçlıdır, yatırım tavsiyesi değildir ✨ • Signal Radar v1.1
        </div>
      </div>
    </>
  )
}
