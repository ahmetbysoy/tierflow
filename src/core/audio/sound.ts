/**
 * WebAudio sentez - harici dosya yok
 * BUY: 880Hz 80ms ping + 60ms vib
 * SELL: 330Hz 120ms dong + 2x40ms vib
 * Disconnect: 200Hz 150ms
 */

let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    } catch {
      return null
    }
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

function tone(freq: number, durationMs: number, type: OscillatorType = 'sine', gain = 0.25): void {
  const c = getCtx()
  if (!c) return
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = type
  osc.frequency.value = freq
  osc.connect(g)
  g.connect(c.destination)
  const now = c.currentTime
  g.gain.setValueAtTime(gain, now)
  g.gain.exponentialRampToValueAtTime(0.001, now + durationMs / 1000)
  osc.start(now)
  osc.stop(now + durationMs / 1000)
}

function vibrate(pattern: number | number[]): void {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      ;(navigator as any).vibrate(pattern)
    } catch {}
  }
}

export function playBuy(): void {
  tone(880, 80, 'sine', 0.3)
  vibrate(60)
}

export function playSell(): void {
  tone(330, 120, 'sine', 0.3)
  // 2x 40ms with gap
  vibrate([40, 30, 40])
}

export function playDisconnect(): void {
  tone(200, 150, 'square', 0.2)
}

export function playTest(side: 'BUY' | 'SELL'): void {
  if (side === 'BUY') playBuy()
  else playSell()
}
