# Changelog

## v1.1.0 — 2026-08-17 — Güçlü Matematik + Forward Tracker

- **5-weight score:** `CVD 35% / OBI 20% / VEL 15% / MICRO 18% / VPIN 12%`
- **OrderBookDiff:** `lastUpdateId` seq, `microprice/mid/spread/slope`, heatmap
- **VPIN:** volume bucket `0..1`, `Low/Medium/Toxic`, directional `vpinAdj`
- **Filters v4:** flat `%0.02` (60s), `|OBI|>=0.06`, `2/3 confluence |z|>=0.30`, VPIN Toxic blok
- **Forward Tracker (Plan A):** `15s/30s/60s/5m/15m` PnL, `MFE/MAE`, `win60s`, `equity`
- **UI:** Radar 5 bar, Settings 5 slider, Signals kartında horizon badge + live/MFE
- **Tests:** 25/25 yeşil, build 552kb → 545kb

## v1.0.0 — 2026-08-16 — Signal Radar Faz 1

- CVD/OBI/Velocity saf fonksiyonlar, engine `IDLE→ARMED→FIRED→COOLDOWN`
- OKX/Binance WSManager, Zustand 10Hz throttle, WebAudio 880/330Hz
- Neon kokpit (480px), lightweight-charts 15s mum, konfeti

## v0.1.0 — Whale Vampire

- G1 WS Worker, G2 Pyramid Canvas, L1-L2 vs L5 divergence

## Canlı

- https://tierflow.vercel.app (Vercel auto-deploy `main`)
- `npm install && npm run dev` → http://localhost:5173
- `npm test` → 25/25
