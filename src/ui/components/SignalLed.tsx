import { motion } from 'framer-motion'

type Props = {
  side: 'BUY' | 'SELL' | 'NEUTRAL'
  confidence?: number
}

export function SignalLed({ side, confidence }: Props) {
  const color = side === 'BUY' ? 'var(--green)' : side === 'SELL' ? 'var(--red)' : '#475569'
  const glow = side === 'BUY' ? 'rgba(52,211,153,0.6)' : side === 'SELL' ? 'rgba(248,113,113,0.6)' : 'rgba(71,85,105,0.3)'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <motion.div
        animate={{ scale: side === 'NEUTRAL' ? [1, 1.05, 1] : [1, 1.12, 1], opacity: side === 'NEUTRAL' ? 0.7 : 1 }}
        transition={{ duration: side === 'NEUTRAL' ? 2.5 : 0.8, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          width: 72,
          height: 72,
          borderRadius: '50%',
          background: `radial-gradient(circle at 30% 30%, ${color}, #0a0a0a)`,
          border: `2px solid ${color}`,
          boxShadow: `0 0 30px ${glow}, inset 0 0 20px rgba(0,0,0,0.6)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--font-mono)',
          fontWeight: 800,
          fontSize: 14,
          color: '#fff',
          letterSpacing: 1
        }}
      >
        {side === 'NEUTRAL' ? '●' : side}
      </motion.div>
      {confidence !== undefined && side !== 'NEUTRAL' && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>
          {confidence}% güven
        </div>
      )}
    </div>
  )
}
