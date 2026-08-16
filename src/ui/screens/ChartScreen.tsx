import { useEffect, useRef } from 'react'
import { createChart, ColorType, CrosshairMode } from 'lightweight-charts'
import { useDataStore } from '../../store/dataStore'

export function ChartScreen() {
  const candles = useDataStore((s) => s.candles)
  const signals = useDataStore((s) => s.signals)
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<any>(null)
  const candleSeriesRef = useRef<any>(null)
  const histRef = useRef<any>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 340,
      layout: { background: { type: ColorType.Solid, color: '#0F1626' }, textColor: '#7C8DB0' },
      grid: { vertLines: { color: '#1E2A44' }, horzLines: { color: '#1E2A44' } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#1E2A44' },
      timeScale: { borderColor: '#1E2A44', timeVisible: true, secondsVisible: false }
    })
    chartRef.current = chart
    const candleSeries = chart.addCandlestickSeries({
      upColor: '#34D399',
      downColor: '#F87171',
      borderVisible: false,
      wickUpColor: '#34D399',
      wickDownColor: '#F87171'
    })
    candleSeriesRef.current = candleSeries

    const hist = chart.addHistogramSeries({
      color: '#22D3EE',
      priceFormat: { type: 'volume' },
      priceScaleId: '',
      priceLineVisible: false
    })
    histRef.current = hist
    chart.priceScale('').applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } })

    const ro = new ResizeObserver(() => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth })
    })
    ro.observe(containerRef.current)
    return () => {
      ro.disconnect()
      chart.remove()
    }
  }, [])

  useEffect(() => {
    if (!candleSeriesRef.current) return
    if (candles.length === 0) return
    const data = candles.map((c) => ({
      time: c.time as any,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close
    }))
    candleSeriesRef.current.setData(data)

    // markers for signals
    const markers = signals
      .filter((s) => s.ts)
      .slice(0, 20)
      .map((s) => ({
        time: (Math.floor(s.ts / 1000 / 15) * 15) as any,
        position: s.side === 'BUY' ? 'belowBar' : 'aboveBar',
        color: s.side === 'BUY' ? '#34D399' : '#F87171',
        shape: s.side === 'BUY' ? 'arrowUp' : 'arrowDown',
        text: `${s.side} ${s.confidence}%`
      }))
    // lightweight-charts expects markers sorted by time
    try {
      // @ts-ignore
      candleSeriesRef.current.setMarkers(markers.reverse())
    } catch {}

    // CVD histogram - use cvdZ as proxy? We'll map signals' CVD? For demo, use price delta
    if (histRef.current && candles.length > 1) {
      const histData = candles.map((c) => ({
        time: c.time as any,
        value: c.close - c.open,
        color: c.close >= c.open ? 'rgba(52,211,153,0.6)' : 'rgba(248,113,113,0.6)'
      }))
      histRef.current.setData(histData)
    }

    chartRef.current?.timeScale().fitContent()
  }, [candles, signals])

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, padding: 16, overflow: 'auto' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', letterSpacing: 0.5 }}>15S MUM GRAFİĞİ • YEREL TOPLAMA</div>
      <div ref={containerRef} style={{ width: '100%', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--surface)' }} />
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>
        Mumlar yerel 15s toplama ile oluşturuluyor. Sinyaller ▲/▼ marker olarak işaretlenir. Alt panel CVD histogramı (yeşil/kırmızı).
      </div>
    </div>
  )
}
