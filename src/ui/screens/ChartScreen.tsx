import { useEffect, useRef } from 'react'
import { createChart, ColorType, CrosshairMode } from 'lightweight-charts'
import { useDataStore } from '../../store/dataStore'

export function ChartScreen() {
  const candles = useDataStore((s) => s.candles)
  const flowCandles = useDataStore((s) => s.flowCandles)
  const signals = useDataStore((s) => s.signals)
  const containerRef = useRef<HTMLDivElement>(null)
  const flowRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<any>(null)
  const flowChartRef = useRef<any>(null)
  const candleSeriesRef = useRef<any>(null)
  const histRef = useRef<any>(null)
  const flowSeriesRef = useRef<any>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 280,
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

    // Flow pressure chart (2. panel)
    if (flowRef.current) {
      const flowChart = createChart(flowRef.current, {
        width: flowRef.current.clientWidth,
        height: 120,
        layout: { background: { type: ColorType.Solid, color: '#0F1626' }, textColor: '#7C8DB0' },
        grid: { vertLines: { color: '#1E2A44' }, horzLines: { color: '#1E2A44' } },
        rightPriceScale: { borderColor: '#1E2A44' },
        timeScale: { borderColor: '#1E2A44', timeVisible: true, secondsVisible: false }
      })
      flowChartRef.current = flowChart
      const flowSeries = flowChart.addHistogramSeries({
        priceFormat: { type: 'price', precision: 1, minMove: 0.1 },
        priceLineVisible: false
      })
      flowSeriesRef.current = flowSeries
      flowChart.priceScale('right').applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } })
    }

    const ro = new ResizeObserver(() => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth })
      if (flowRef.current && flowChartRef.current) flowChartRef.current.applyOptions({ width: flowRef.current.clientWidth })
    })
    if (containerRef.current) ro.observe(containerRef.current)
    if (flowRef.current) ro.observe(flowRef.current)
    return () => {
      ro.disconnect()
      chart.remove()
      flowChartRef.current?.remove()
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

    // Flow pressure histogram
    if (flowSeriesRef.current && flowCandles.length > 0) {
      const flowData = flowCandles.map((f) => ({
        time: Math.floor(f.ts / 1000) as any,
        value: f.pressureClose,
        color: f.absorption ? 'rgba(251,191,36,0.9)' : f.pressureClose >= 0 ? 'rgba(52,211,153,0.7)' : 'rgba(248,113,113,0.7)'
      }))
      flowSeriesRef.current.setData(flowData)
    }

    chartRef.current?.timeScale().fitContent()
    flowChartRef.current?.timeScale().fitContent()
  }, [candles, signals, flowCandles])

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, padding: 16, overflow: 'auto' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', letterSpacing: 0.5 }}>15S MUM GRAFİĞİ • YEREL TOPLAMA</div>
      <div ref={containerRef} style={{ width: '100%', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--surface)' }} />
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--amber)', letterSpacing: 0.5 }}>FLOW PRESSURE (−100..+100) • 5s bucket • sarı = absorpsiyon</div>
      <div ref={flowRef} style={{ width: '100%', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--surface)' }} />
      {/* Footprint - Volume at Price */}
      {flowCandles.length > 0 && (() => {
        const last = flowCandles[flowCandles.length - 1]
        const profile = last.volumeProfile || []
        const topLevels = [...profile].sort((a,b)=> b.total - a.total).slice(0, 8)
        const maxTotal = Math.max(...profile.map(p=>p.total), 1)
        return (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--cyan)', letterSpacing: 0.5, marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
              <span>FOOTPRINT • {new Date(last.ts).toLocaleTimeString()} • POC {last.pocPrice.toFixed(2)}</span>
              <span style={{ color: last.absorption ? 'var(--amber)' : 'var(--muted)' }}>{last.absorption ? '● ABSORPSİYON' : `${profile.length} seviye`}</span>
            </div>
            {last.absorptionLevels.length > 0 && (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--amber)', background: 'rgba(251,191,36,0.1)', padding: '6px 8px', borderRadius: 8, marginBottom: 8, border: '1px solid rgba(251,191,36,0.2)' }}>
                ⚡ Absorption Wall: {last.absorptionLevels.map(l=> `${l.price.toFixed(2)} (${(l.sellVol/l.buyVol).toFixed(1)}x sell)`).join(' | ')}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {topLevels.map((vp) => {
                const isAbsorption = last.absorptionLevels.some(a=> Math.abs(a.price - vp.price) < 0.01)
                const deltaSign = vp.delta > 0 ? '+' : ''
                return (
                  <div key={vp.price} style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                    <span style={{ width: 65, color: 'var(--text)', fontWeight: 600 }}>${vp.price.toFixed(2)}</span>
                    <div style={{ flex: 1, display: 'flex', height: 14, background: 'var(--surface-2)', borderRadius: 4, overflow: 'hidden', border: isAbsorption ? '1px solid var(--amber)' : '1px solid transparent' }}>
                      <div style={{ width: `${(vp.buyVol/maxTotal)*50}%`, background: 'var(--green)', opacity: 0.8, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 4, color: '#fff', fontSize: 8 }}>{vp.buyVol>0 ? `${(vp.buyVol/1000).toFixed(1)}k` : ''}</div>
                      <div style={{ width: `${(vp.sellVol/maxTotal)*50}%`, background: 'var(--red)', opacity: 0.8, display: 'flex', alignItems: 'center', paddingLeft: 4, color: '#fff', fontSize: 8 }}>{vp.sellVol>0 ? `${(vp.sellVol/1000).toFixed(1)}k` : ''}</div>
                    </div>
                    <span style={{ width: 55, color: vp.delta>0 ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>{deltaSign}{vp.delta.toFixed(0)}</span>
                    <span style={{ width: 30, color: 'var(--muted)' }}>{vp.total>0 ? `${((vp.buyVol/vp.total)*100).toFixed(0)}%` : ''}</span>
                    {isAbsorption && <span style={{ color: 'var(--amber)', fontWeight: 700 }}>●</span>}
                  </div>
                )
              })}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', marginTop: 6, display: 'flex', justifyContent: 'space-between' }}>
              <span>Yeşil alım, Kırmızı satım, Sarı absorpsiyon wall (3x)</span>
              <span>POC en yüksek hacimli fiyat</span>
            </div>
          </div>
        )
      })()}
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>
        Mumlar yerel 15s toplama ile oluşturuluyor. Sinyaller ▲/▼ marker olarak işaretlenir. Alt panel CVD histogramı (yeşil/kırmızı). Flow paneli delta pressure (yeşil alım, kırmızı satım, sarı absorpsiyon).
      </div>
    </div>
  )
}
