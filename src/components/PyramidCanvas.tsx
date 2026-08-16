import { useEffect, useRef } from 'react'
import { useOrderflowStore } from '../stores/useOrderflowStore'

/**
 * G2 - Canvas Pyramid
 * Ana thread'i boğmamak için:
 * - Zustand'ı her tick render etme, sadece canvas'a çiz
 * - requestAnimationFrame içinde 12fps lerp ile yağ gibi akış
 * - Worker'dan gelen ham veriyi direkt canvas'a basıyoruz
 */

export function PyramidCanvas({ symbol }: { symbol: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const lerpState = useRef({ score: 0, l1: 0, l5: 0 })
  
  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    
    let lastDraw = 0
    const TARGET_FPS = 12
    const FRAME_MS = 1000 / TARGET_FPS

    const draw = (now: number) => {
      animRef.current = requestAnimationFrame(draw)
      if (now - lastDraw < FRAME_MS) return
      lastDraw = now

      const state = useOrderflowStore.getState().tickers[symbol]
      if (!state || !state.divergence) {
        // empty state
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.fillStyle = '#0a0a0a'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.fillStyle = '#666'
        ctx.font = '12px monospace'
        ctx.fillText(`${symbol} bekleniyor...`, 20, 50)
        return
      }

      const { divergence, signal } = state
      // Lerp - anlık zıplamayı yumuşat
      const lerp = 0.15
      lerpState.current.score += (divergence.score - lerpState.current.score) * lerp
      lerpState.current.l1 += (divergence.l1l2Imbalance - lerpState.current.l1) * lerp
      lerpState.current.l5 += (divergence.l5Imbalance - lerpState.current.l5) * lerp

      const W = canvas.width
      const H = canvas.height
      ctx.clearRect(0, 0, W, H)

      // Background
      ctx.fillStyle = '#080a0f'
      ctx.fillRect(0, 0, W, H)

      // Başlık
      ctx.fillStyle = '#e2e8f0'
      ctx.font = 'bold 14px monospace'
      ctx.fillText(`${symbol}  Divergence: ${lerpState.current.score.toFixed(1)}`, 16, 24)
      
      ctx.fillStyle = signal?.side ? (signal.side === 'LONG' ? '#22c55e' : '#ef4444') : '#64748b'
      ctx.font = '11px monospace'
      ctx.fillText(signal?.reason ?? divergence.retailDirection + ' / ' + divergence.whaleDirection, 16, 40)

      // Piramit çizimi - 5 katman
      const centerX = W / 2
      const pyramidTop = 60
      const pyramidH = H - 90
      const levelH = pyramidH / 5

      const tiers = [
        { label: 'L1 RETAIL', val: lerpState.current.l1, color: '#f59e0b' },
        { label: 'L2 RETAIL', val: lerpState.current.l1 * 0.9, color: '#f59e0b' },
        { label: 'L3 MID', val: (lerpState.current.l1 + lerpState.current.l5)/2, color: '#6366f1' },
        { label: 'L4 MID', val: lerpState.current.l5 * 0.7, color: '#6366f1' },
        { label: 'L5 WHALE', val: lerpState.current.l5, color: '#06b6d4' },
      ]

      tiers.forEach((tier, i) => {
        const y = pyramidTop + i * levelH
        const width = 60 + i * 55 // aşağı doğru genişleyen piramit
        const imbalance = tier.val // -1 .. +1
        // imbalance'a göre sağ/sol doluluk
        const fillRatio = (imbalance + 1) / 2 // 0..1, 0 tam kırmızı (satıcı), 1 tam yeşil (alıcı)
        
        // Katman arka
        ctx.fillStyle = '#1e293b'
        ctx.beginPath()
        ctx.roundRect(centerX - width/2, y, width, levelH - 4, 6)
        ctx.fill()

        // Imbalance fill - soldan sağa gradient gibi
        const fillW = width * 0.92
        const fillX = centerX - fillW/2
        // Yeşil / Kırmızı
        if (imbalance > 0.05) {
          ctx.fillStyle = tier.color
          ctx.globalAlpha = 0.3 + Math.abs(imbalance) * 0.7
          ctx.fillRect(fillX, y+2, fillW * fillRatio, levelH - 8)
        } else if (imbalance < -0.05) {
          ctx.fillStyle = '#ef4444'
          ctx.globalAlpha = 0.3 + Math.abs(imbalance) * 0.7
          ctx.fillRect(fillX + fillW * fillRatio, y+2, fillW * (1-fillRatio), levelH - 8)
        }
        ctx.globalAlpha = 1

        // Border vurgusu - whale katmanı kalın
        ctx.strokeStyle = i === 4 ? '#06b6d4' : '#334155'
        ctx.lineWidth = i === 4 ? 2 : 1
        ctx.strokeRect(centerX - width/2, y, width, levelH - 4)

        // Label
        ctx.fillStyle = '#cbd5e1'
        ctx.font = `${i===4 ? 'bold ' : ''}10px monospace`
        ctx.fillText(tier.label, centerX - width/2 + 8, y + 14)
        ctx.fillStyle = imbalance > 0 ? '#22c55e' : imbalance < 0 ? '#ef4444' : '#94a3b8'
        ctx.fillText(`${(imbalance*100).toFixed(0)}%`, centerX + width/2 - 38, y + 14)

        // VWAP çizgisi - sadece L5'te
        if (i === 4 && divergence.l5Vwap) {
          ctx.fillStyle = '#f8fafc'
          ctx.font = '9px monospace'
          ctx.fillText(`VWAP ${divergence.l5Vwap.toFixed(2)}`, centerX - 40, y + levelH - 6)
        }
      })

      // Skor bar - altta
      const barY = H - 22
      const barW = W - 32
      const barX = 16
      ctx.fillStyle = '#1e293b'
      ctx.fillRect(barX, barY, barW, 10)
      // -100 .. +100 => 0..barW
      const scoreNorm = (lerpState.current.score + 100) / 200
      const scoreX = barX + scoreNorm * barW
      ctx.fillStyle = lerpState.current.score > 75 ? '#22c55e' : lerpState.current.score < -75 ? '#ef4444' : '#eab308'
      ctx.beginPath()
      ctx.arc(scoreX, barY + 5, 6, 0, Math.PI*2)
      ctx.fill()
      // eşik çizgileri
      ctx.fillStyle = '#22c55e'
      ctx.fillRect(barX + barW*0.875, barY -2, 2, 14) // +75
      ctx.fillStyle = '#ef4444'
      ctx.fillRect(barX + barW*0.125, barY -2, 2, 14) // -75
      ctx.fillStyle = '#64748b'
      ctx.font = '8px monospace'
      ctx.fillText('-75', barX + barW*0.125 - 8, barY -4)
      ctx.fillText('+75', barX + barW*0.875 - 8, barY -4)
    }

    animRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(animRef.current)
  }, [symbol])

  return (
    <canvas
      ref={canvasRef}
      width={420}
      height={520}
      style={{ width: '100%', maxWidth: 420, height: 520, borderRadius: 12, border: '1px solid #1e293b', background: '#080a0f' }}
    />
  )
}
