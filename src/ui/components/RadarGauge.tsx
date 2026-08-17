import { useEffect, useRef } from 'react'
import { SignalLed } from './SignalLed'

type Props = {
  score: number // -3 to +3
  confidence: number
  side: 'BUY' | 'SELL' | 'NEUTRAL'
  engineState: string
}

export function RadarGauge({ score, confidence, side, engineState }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const angleRef = useRef(0)

  // score needle angle: map -3..+3 to -135deg .. +135deg
  const needleAngle = (score / 3) * 135

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const dpr = window.devicePixelRatio || 1
    const size = 260
    canvas.width = size * dpr
    canvas.height = size * dpr
    canvas.style.width = `${size}px`
    canvas.style.height = `${size}px`
    ctx.scale(dpr, dpr)

    const center = size / 2
    const radius = 108

    let last = performance.now()
    const speed = 360 / 3000 // 3s per rotation

    const draw = (now: number) => {
      rafRef.current = requestAnimationFrame(draw)
      const dt = now - last
      last = now
      angleRef.current = (angleRef.current + speed * dt) % 360

      ctx.clearRect(0, 0, size, size)

      // background pastel donut
      const bg = ctx.createRadialGradient(center, center, 20, center, center, radius)
      bg.addColorStop(0, '#FFFFFF')
      bg.addColorStop(0.5, '#FFF0F5')
      bg.addColorStop(1, '#E9D5FF')
      ctx.fillStyle = bg
      ctx.beginPath()
      ctx.arc(center, center, radius, 0, Math.PI * 2)
      ctx.fill()

      // grid pastel
      ctx.strokeStyle = 'rgba(167,139,250,0.25)'
      ctx.lineWidth = 1
      for (let r = 30; r <= radius; r += 30) {
        ctx.beginPath()
        ctx.arc(center, center, r, 0, Math.PI * 2)
        ctx.stroke()
      }
      // cross lines
      ctx.beginPath()
      ctx.moveTo(center - radius, center)
      ctx.lineTo(center + radius, center)
      ctx.moveTo(center, center - radius)
      ctx.lineTo(center, center + radius)
      ctx.stroke()

      // threshold arcs
      const threshAngle = (0.6 / 3) * 135
      ctx.strokeStyle = 'rgba(255,143,171,0.45)'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(center, center, radius - 6, ((-threshAngle - 90) * Math.PI) / 180, ((135 - 90) * Math.PI) / 180)
      ctx.stroke()
      ctx.strokeStyle = 'rgba(167,139,250,0.45)'
      ctx.beginPath()
      ctx.arc(center, center, radius - 6, ((-135 - 90) * Math.PI) / 180, ((threshAngle - 90) * Math.PI) / 180)
      ctx.stroke()

      // conic sweep
      const sweep = angleRef.current
      const grad = ctx.createConicGradient((sweep * Math.PI) / 180, center, center)
      grad.addColorStop(0, 'rgba(255,143,171,0)')
      grad.addColorStop(0.85, 'rgba(255,143,171,0)')
      grad.addColorStop(0.95, 'rgba(167,139,250,0.25)')
      grad.addColorStop(1, 'rgba(167,139,250,0.5)')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(center, center, radius, 0, Math.PI * 2)
      ctx.fill()

      // sweep line
      const rad = (sweep - 90) * (Math.PI / 180)
      ctx.strokeStyle = 'rgba(167,139,250,0.9)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(center, center)
      ctx.lineTo(center + Math.cos(rad) * radius, center + Math.sin(rad) * radius)
      ctx.stroke()

      // needle (score)
      const needleRad = (needleAngle - 90) * (Math.PI / 180)
      ctx.strokeStyle = side === 'BUY' ? '#FF8FAB' : side === 'SELL' ? '#A78BFA' : '#9B8CB5'
      ctx.lineWidth = 3
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(center, center)
      ctx.lineTo(center + Math.cos(needleRad) * (radius - 18), center + Math.sin(needleRad) * (radius - 18))
      ctx.stroke()
      // center dot
      ctx.fillStyle = '#2D1B3A'
      ctx.beginPath()
      ctx.arc(center, center, 4, 0, Math.PI * 2)
      ctx.fill()

      // score text
      ctx.fillStyle = '#9B8CB5'
      ctx.font = '10px JetBrains Mono'
      ctx.textAlign = 'center'
      ctx.fillText(`${score.toFixed(2)}`, center, center + radius + 16)
    }

    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [needleAngle, side, score])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '16px 0' }}>
      <div style={{ position: 'relative', width: 260, height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <canvas ref={canvasRef} width={260} height={260} style={{ position: 'absolute', inset: 0 }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <SignalLed side={side} confidence={confidence} />
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: 6,
            left: '50%',
            transform: 'translateX(-50%)',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--muted)',
            background: 'rgba(255,255,255,0.9)',
            padding: '6px 12px',
            borderRadius: 999,
            border: '1px solid var(--border-soft)',
            boxShadow: '0 2px 8px rgba(167,139,250,0.1)'
          }}
        >
          {engineState} • {confidence}%
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>
        <span style={{ color: 'var(--red)' }}>SELL -3</span>
        <span>•</span>
        <span style={{ color: 'var(--green)' }}>BUY +3</span>
      </div>
    </div>
  )
}
