# Tierflow — Whale Vampire 🧛

> Retail vs Whale Divergence Piramidi. Sıfır sunucu, sıfır 451 riski. Her şey kullanıcının browser'ından.

**Repo:** `tierflow` (kurumsal), kod adı `whale-vampire`  
**Bot:** `@WhaleDrainBot` (fallback `@ParaSayaciBot`)  
**Deploy:** Vercel Static (client-side WS)

### Mimari
- **G1 - WS Worker** (`src/workers/binance.ws.worker.ts`): Binance Futures Combined Stream (`fstream.binance.com`), depth20@100ms + aggTrade. 5s ping/pong, 3s stale kill, exponential backoff + jitter.
- **G2 - Pyramid Canvas** (`src/components/PyramidCanvas.tsx`): 12fps `requestAnimationFrame` lerp, Zustand'ı her tick render etmiyor.
- **Core - Divergence** (`src/lib/divergence.ts`): L1-L2 (retail 0-0.3%) vs L5 (whale 0.8-1.5%) imbalance farkı. Absorpsiyon + hacim doğrulaması.

### Eşikler (kilitli)
- **Entry:** Score > +75 LONG (L5 %70+ alıcı, L1-L2 %60+ satıcı + absorpsiyon) / < -75 SHORT tersi
- **TP:** L5 VWAP +%0.4
- **SL:** L5 likidite altı -%0.2
- **Cooldown:** 180s

### Test Sembolleri
- `BTCUSDT`, `ETHUSDT` (likit)
- `BLZUSDT`, `TRBUSDT` (düşük hacim / çöp - "yetersiz veri" ve ani absorpsiyon edge case'i için birebir)

### Çalıştır
```bash
npm install
npm run dev
# build
npm run build
# Vercel'e push'la, otomatik deploy
```

### Vercel Notu
Vercel'e GitHub repo'yu bağla, `vite build` output'u `dist`. Env yok, API key yok. Tüm WS client'tan.

### Sorumluluk Reddi
Yatırım tavsiyesi değildir. Sadece orderflow görselleştirme ve eğitim amaçlı.
