import { useEffect, useState } from 'react'
import { useDataStore } from '../../store/dataStore'
import { useSettingsStore } from '../../store/settingsStore'
import { RadarGauge } from '../components/RadarGauge'
import { MeterBar } from '../components/MeterBar'
import { useConfetti, PulseRing } from '../components/CanvasConfetti'
import { motion } from 'framer-motion'

export function RadarScreen() {
  const metrics = useDataStore((s) => s.metrics)
  const engineState = useDataStore((s) => s.engineState)
  const signals = useDataStore((s) => s.signals)
  const threshold = useSettingsStore((s) => s.threshold)
  const lastSignal = signals[0]
  const fire = useConfetti()
  const [pulse, setPulse] = useState(false)

  const score = metrics.score
  const confidence = Math.min(100, Math.round((Math.abs(score) / 1.2) * 100))
  const side: 'BUY' | 'SELL' | 'NEUTRAL' = score > threshold ? 'BUY' : score < -threshold ? 'SELL' : 'NEUTRAL'

  useEffect(() => {
    const handler = (e: Event) => {
      const sig = (e as CustomEvent).detail
      fire(sig.side)
      setPulse(true)
      setTimeout(() => setPulse(false), 800)
    }
    window.addEventListener('signal-fired', handler as EventListener)
    return () => window.removeEventListener('signal-fired', handler as EventListener)
  }, [fire])

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '0 16px 16px', gap: 16, overflow: 'auto' }} className="scrollbar-thin">
      <div style={{ position: 'relative' }}>
        <RadarGauge score={score} confidence={confidence} side={side} engineState={engineState} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <PulseRing active={pulse} side={side} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }} className="scrollbar-thin">
        <MeterBar label="CVD" value={metrics.cvdZ} displayValue={metrics.cvdZ.toFixed(2)} color="var(--cyan)" />
        <MeterBar label="OBI" value={metrics.obi} displayValue={metrics.obi.toFixed(2)} color="var(--green)" />
        <MeterBar label="VEL" value={metrics.velocityZ} displayValue={metrics.velocityZ.toFixed(2)} color="var(--violet)" />
        <MeterBar label="MIC" value={metrics.microDev} displayValue={metrics.microDev.toFixed(2)} color="var(--amber)" />
        <MeterBar label="VPIN" value={metrics.vpin*2 -1} displayValue={metrics.vpin.toFixed(2)} color={metrics.vpinLabel==='Toxic'?'var(--red)':metrics.vpinLabel==='Medium'?'var(--amber)':'var(--green)'} />
        <MeterBar label="DET" value={(metrics as any).detectorScore ?? 0} displayValue={((metrics as any).detectorScore ?? 0).toFixed(2)} color="var(--green)" />
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', textAlign: 'center' }}>
        MIC microprice sapması (-1..+1) • VPIN {metrics.vpinLabel} {metrics.vpin.toFixed(2)} (Toxic &gt;0.6) • DET {(metrics as any).detectorScore?.toFixed(2) ?? '0.00'}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          padding: 12,
          borderRadius: 12,
          background: lastSignal
            ? lastSignal.side === 'BUY'
              ? 'rgba(52,211,153,0.08)'
              : 'rgba(248,113,113,0.08)'
            : 'var(--surface-2)',
          border: `1px solid ${lastSignal ? (lastSignal.side === 'BUY' ? 'rgba(52,211,153,0.2)' : 'rgba(248,113,113,0.2)') : 'var(--border)'}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', letterSpacing: 0.5 }}>SON SİNYAL</div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, color: lastSignal ? (lastSignal.side === 'BUY' ? 'var(--green)' : 'var(--red)') : 'var(--muted)' }}>
            {lastSignal ? `${lastSignal.side} • ${lastSignal.confidence}% • $${(lastSignal as any).priceStr || lastSignal.price}` : 'Henüz sinyal yok — radar tarıyor...'}
          </div>
          {lastSignal && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
              S {lastSignal.score.toFixed(2)} • CVD {lastSignal.breakdown.cvd.toFixed(2)} • OBI {lastSignal.breakdown.obi.toFixed(2)} • VEL {lastSignal.breakdown.vel.toFixed(2)}
            </div>
          )}
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', textAlign: 'right' }}>
          {engineState}
          <br />
          {new Date().toLocaleTimeString()}
        </div>
      </motion.div>

      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', textAlign: 'center', opacity: 0.7 }}>
        Skor: {score.toFixed(2)} • Eşik: {threshold.toFixed(2)} • CVD_z + OBI + V_z kompozit
      </div>
    </div>
  )
}
