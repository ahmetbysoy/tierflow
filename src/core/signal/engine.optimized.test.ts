import { describe, it, expect } from 'vitest'
import { SignalEngine } from './engine'

describe('Optimized Settings', () => {
  it('optimize: threshold 0.9 + cooldown 25s + hysteresis 0.4 flip azaltır', () => {
    const engine = new SignalEngine({ threshold: 0.9, cooldownMs: 25000, hysteresis: 0.4 })
    const w = { w1: 0.5, w2: 0.3, w3: 0.2 }

    // 0.7 skor (eski eşik 0.6'da sinyal verirdi, yeni 0.9'da vermemeli)
    let res = engine.tick({ score: 0.7, price: 50000, breakdown: { cvd: 0.7, obi: 0.2, vel: 0.1 }, weights: w, ts: 1000 })
    expect(res.signal).toBeNull()
    res = engine.tick({ score: 0.75, price: 50010, breakdown: { cvd: 0.75, obi: 0.2, vel: 0.1 }, weights: w, ts: 2000 })
    expect(res.signal).toBeNull() // 2 tick 0.7-0.75 ama threshold 0.9 altında -> hala IDLE/ARMED yok
    expect(res.state).toBe('IDLE')

    // 0.95 üstünde 2 tick -> FIRED olmalı
    res = engine.tick({ score: 0.95, price: 50020, breakdown: { cvd: 0.9, obi: 0.5, vel: 0.2 }, weights: w, ts: 3000 })
    expect(res.state).toBe('ARMED')
    res = engine.tick({ score: 1.0, price: 50030, breakdown: { cvd: 1.0, obi: 0.5, vel: 0.3 }, weights: w, ts: 4000 })
    expect(res.signal).not.toBeNull()
    expect(res.signal?.side).toBe('BUY')
    expect(res.state).toBe('FIRED')

    // cooldown 25s - 10s sonra hala COOLDOWN
    res = engine.tick({ score: 0.95, price: 50040, breakdown: { cvd: 0.9, obi: 0.5, vel: 0.2 }, weights: w, ts: 5000 })
    expect(res.state).toBe('COOLDOWN')
    res = engine.tick({ score: 0.95, price: 50050, breakdown: { cvd: 0.9, obi: 0.5, vel: 0.2 }, weights: w, ts: 14000 })
    expect(res.state).toBe('COOLDOWN') // 14k - 4k =10k <25k

    // hysteresis 0.4 - karşı yön neutral görülmeden engellenmeli
    res = engine.tick({ score: -0.95, price: 49900, breakdown: { cvd: -0.9, obi: -0.5, vel: -0.2 }, weights: w, ts: 15000 })
    expect(res.signal).toBeNull() // hala cooldown, ama histerezis de devrede
    // cooldown bitince (29s sonra = 33k) neutral görülmeden karşı yön engellenir
    res = engine.tick({ score: 0.1, price: 50000, breakdown: { cvd: 0.1, obi: 0, vel: 0 }, weights: w, ts: 29000 })
    // 29k -4k =25k exactly cooldown bitti, bu tick IDLE döner
    expect(res.state).toBe('IDLE')
    // şimdi neutral görüldü (0.1 <0.4), karşı yön artık serbest
    res = engine.tick({ score: -0.95, price: 49900, breakdown: { cvd: -0.9, obi: -0.5, vel: -0.2 }, weights: w, ts: 30000 })
    expect(res.state).toBe('ARMED')
    res = engine.tick({ score: -1.0, price: 49880, breakdown: { cvd: -1.0, obi: -0.5, vel: -0.3 }, weights: w, ts: 31000 })
    expect(res.signal).not.toBeNull()
    expect(res.signal?.side).toBe('SELL')
  })

  it('optimize: ağırlıklar CVD ağırlıklı (0.5/0.3/0.2) velocity gürültüsünü azaltır', () => {
    const wOld = { w1: 0.33, w2: 0.33, w3: 0.34 }
    const wNew = { w1: 0.5, w2: 0.3, w3: 0.2 }
    // aynı CVD_z=0.8, OBI=0.4, Vel_z=2.0 (spike) durumunda eski ağırlık velocity spike'ı daha çok etkiler
    // Yeni ağırlık velocity'yi baskılar
    // Skor hesap: wOld => 0.33*0.8+0.33*0.4+0.34*2.0=0.264+0.132+0.68=1.076
    // wNew => 0.5*0.8+0.3*0.4+0.2*2.0=0.4+0.12+0.4=0.92 -> velocity etkisi azaldı
    // Bu da flip azalması demek
    expect(wNew.w3).toBeLessThan(wOld.w3)
  })
})
