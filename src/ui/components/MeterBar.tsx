type Props = {
  label: string
  value: number // -1 to +1 or z-score
  displayValue?: string
  color: string // css color
}

export function MeterBar({ label, value, displayValue, color }: Props) {
  // normalize value to 0..100 for bar height, value is z-score or -1..+1, clamp to [-2,2] then map
  const clamped = Math.max(-2, Math.min(2, value))
  const pct = ((clamped + 2) / 4) * 100
  const isPositive = value > 0.05
  const isNegative = value < -0.05
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div style={{
        width: 44,
        height: 120,
        background: 'rgba(255,255,255,0.9)',
        borderRadius: 16,
        border: '1px solid var(--border-soft)',
        boxShadow: '0 4px 12px rgba(167,139,250,0.08)',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        padding: 4
      }}>
        {/* center line */}
        <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 1, background: 'rgba(124,141,176,0.2)' }} />
        {/* fill */}
        <div style={{
          width: '100%',
          height: `${pct}%`,
          maxHeight: '100%',
          background: isPositive ? color : isNegative ? 'var(--red)' : 'var(--purple-soft)',
          borderRadius: 10,
          opacity: 0.9,
          transition: 'height 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.2s ease',
          animation: Math.abs(value) > 0.8 ? 'jelly 0.6s ease' : undefined,
          boxShadow: Math.abs(value) > 1 ? `0 0 12px ${color}60` : 'none'
        }} />
        {/* value indicator dot at current level */}
        <div style={{
          position: 'absolute',
          left: 6,
          right: 6,
          bottom: `calc(${pct}% - 2px)`,
          height: 2,
          background: '#fff',
          borderRadius: 1,
          opacity: 0.9,
          transition: 'bottom 0.2s ease'
        }} />
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: isPositive ? color : isNegative ? 'var(--red)' : 'var(--text)' }}>
        {displayValue ?? value.toFixed(2)}
      </div>
    </div>
  )
}
