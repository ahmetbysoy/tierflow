# Signal Radar — Neon Kokpit 📡

> Klasik indikatörler (RSI/MACD) yerine **ham WebSocket** verisinden türetilen mikro yapı metrikleriyle çalışan, neon kokpit temalı trading radarı. **Eğlence ve eğitim amaçlıdır, yatırım tavsiyesi değildir.**

**Canlı:** https://tierflow.vercel.app  
**Repo:** `ahmetbysoy/tierflow` (private) • **Vercel:** `ahmetbysoy1s-projects/tierflow` (auto-deploy `main` → prod)

---

## 🎯 Ne yapar?

- **CVD** (Cumulative Volume Delta), **OBI** (Order Book Imbalance), **Velocity** (fiyat hızı), **Microprice** (microprice sapması), **VPIN** (Volume-Synchronized PIN) metriklerini **OKX/Binance Futures WSS**'ten canlı hesaplar
- Kompozit skor `S = w1*CVD_z + w2*OBI + w3*VEL_z + w4*MICRO + w5*VPIN + divergence` üretir
- Durum makinesi `IDLE → ARMED (2 tick ≥ threshold) → FIRED → COOLDOWN (18s) → IDLE` + **hysteresis 0.35** + **flat/OBI/confluence filtreleri**
- Her sinyalin **+15s / +30s / +60s / +5m / +15m** forward return'ünü, **MFE/MAE** ve **win rate**'ini canlı takip eder

---

## 🛠️ Teknoloji

- **Vite 6 + React 19 + TypeScript 5.6**
- **Zustand** (data 10Hz throttle, settings persist, ui)
- **lightweight-charts 4** (15s mum), **framer-motion**, **canvas-confetti**, **lucide-react**
- **Vitest + jsdom** (25 test)
- **Pure CSS Tokens** (`--bg #070B14` vb), 480px telefon kanvası

---

## 📁 Klasör Yapısı

```
src/
├── app/App.tsx, main.tsx
├── core/
│   ├── indicators/cvd.ts, imbalance.ts, velocity.ts, vpin.ts
│   ├── signal/engine.ts, filters.ts, tradePlan.ts
│   ├── book/orderBookDiff.ts
│   ├── flow/flowEngine.ts
│   ├── detectors/detectorSuite.ts
│   ├── crossExchange/crossExchange.ts
│   ├── paper/paperTrading.ts
│   ├── performance/signalTracker.ts
│   ├── buffers/ringBuffer.ts
│   ├── audio/sound.ts
│   └── ws/adapters/okx.ts, binance.ts, wsManager.ts
├── store/dataStore.ts, settingsStore.ts, uiStore.ts
├── ui/components/*, screens/Radar/Chart/Signals/Settings
├── styles/tokens.css, global.css
└── types/index.ts
docs/05-phase1-todo-prompt.md  # Faz 1 master prompt
```

---

## 🎨 Tasarım Sistemi

`src/styles/tokens.css`:
`--bg #070B14, --surface #0F1626, --surface-2 #16203A, --border #1E2A44, --green #34D399, --red #F87171, --amber #FBBF24, --cyan #22D3EE, --violet #A78BFA`

---

## ⚙️ Varsayılan Ayarlar (v4)

- **Ağırlıklar:** CVD 35% / OBI 20% / VEL 15% / MICRO 18% / VPIN 12% (normalize)
- **Threshold:** 0.75, **Cooldown:** 18s, **Hysteresis:** 0.35
- **Filtreler:** flat range <0.02% (60s), |OBI|≥0.06, 2/3 confluence |z|≥0.30, VPIN Toxic ise |score|<1.0 blok
- **WS:** OKX default (TR), Binance fallback, exponential backoff max 30s, `document.hidden` pause

---

## 🚀 Çalıştır

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # vite build → dist
npm test         # vitest 25/25
npm run preview  # prod preview
```

**Vercel:** GitHub `main` push → auto-deploy `dist`. Env yok, tüm WS client'tan.

---

## 📊 Ekranlar

- **Radar:** Conic-gradient tarama (3s/tur), skor ibresi, 5 dikey bar (CVD/OBI/VEL/MIC/VPIN), konfeti + pulse
- **Chart:** 15s mum + CVD histogram + ▲/▼ marker
- **Signals:** Son 200 sinyal, her kartta `15s/30s/60s/5m` forward, `MFE/MAE`, üstte `win60s` stats
- **Settings:** Borsa/sembol, 5 ağırlık slider, threshold/cooldown, ses/haptik, test sinyali

---

## 🧪 Testler

`npm test` 25/25:
- CVD birikim/divergence, OBI ±1, Velocity z, VPIN, RingBuffer 1000, WS reconnect, Engine hysteresis/cooldown, Filters flat/OBI/confluence, Tracker forward PnL

---

## ⚠️ Sorumluluk Reddi

Eğlence ve eğitim amaçlıdır, yatırım tavsiyesi değildir. Mikro yapı sinyalleri gürültülüdür, her sinyal kâr ettirmez. Paper modda test edin.

---

## 📜 Geçmiş

- `bd8f4e6` Whale Vampire (G1/G2 divergence)
- `aba2c8e` Signal Radar Faz 1 (CVD/OBI/Velocity kokpit)
- `5aa0f08` 7 mikro yapı modülü (BOZOK_PRO)
- `d3c5c2a` optimize 0.9/25s, `e699654` flat/OBI filtre, `05ff73d` 0.75/0.02, `30c59c3` microprice+VPIN 5-weight, `5f0c36f` forward tracker
