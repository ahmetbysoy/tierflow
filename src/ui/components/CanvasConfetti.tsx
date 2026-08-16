import { useEffect, useRef } from 'react'
import confetti from 'canvas-confetti'

export function useConfetti() {
  const fire = (side: 'BUY' | 'SELL') => {
    const colors = side === 'BUY' ? ['#34D399', '#22D3EE', '#A78BFA'] : ['#F87171', '#FBBF24', '#7C8DB0']
    confetti({
      particleCount: 60,
      spread: 70,
      origin: { y: 0.6 },
      colors,
      ticks: 180,
      gravity: 0.9,
      scalar: 0.9
    })
    // second burst
    setTimeout(() => {
      confetti({
        particleCount: 30,
        spread: 50,
        origin: { y: 0.65 },
        colors,
        ticks: 150
      })
    }, 120)
  }
  return fire
}

export function PulseRing({ active, side }: { active: boolean; side: 'BUY' | 'SELL' | 'NEUTRAL' }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!active || side === 'NEUTRAL') return
    const el = ref.current
    if (!el) return
    el.animate(
      [
        { transform: 'scale(0.8)', opacity: 0.8 },
        { transform: 'scale(1.6)', opacity: 0 }
      ],
      { duration: 700, easing: 'ease-out' }
    )
  }, [active, side])
  if (!active || side === 'NEUTRAL') return null
  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        inset: 0,
        borderRadius: '50%',
        border: `2px solid ${side === 'BUY' ? 'var(--green)' : 'var(--red)'}`,
        pointerEvents: 'none'
      }}
    />
  )
}
