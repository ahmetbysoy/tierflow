# 05 · Faz 1 Kod Üretim Promptu & Görev Listesi

> Bu doküman, Claude / GPT-4 / Cursor gibi AI kodlama araçlarına TEK HAMLEDE verilecek MASTER PROMPT'u ve kontrol listesini içerir. Eksiksiz uygulanmalıdır.

---

## 🎯 AI KODLAMA PROMPTU (Kopyala & Yapıştır)

```text
Sen senior düzeyde Quant Developer ve Frontend Architect'sin. Sana verilen aşağıdaki mimari dokümanlara (Blueprint, Gereksinimler, Tasarım, İndikatör Matematiği) %100 sadık kalarak, Vite + React 19 + TypeScript + Zustand + Lightweight-Charts + Framer Motion kullanarak "Signal Radar" uygulamasının Faz 1'ini eksiksiz, üretime hazır ve sıfır hatalı olarak kodlayacaksın.

### 🎯 GENEL HEDEF
Klasik indikatörler (RSI, MACD vb.) YERİNE, ham WebSocket (WSS) veri akışından (trades, depth, mark price) türetilen özel metriklerle (CVD, Imbalance, Velocity) kompozit skor üreten, neon "Kokpit Radarı" temalı, mobil-öncelikli (max-width: 480px kanvas) bir trading radarı oluşturmak.

---

### 🛠️ TEKNOLOJİ VE BAĞIMLILIKLAR
- Vite, React 19, TypeScript
- State: Zustand (Data Store <= 10Hz throttle, Settings Store localStorage persist, UI Store)
- UI/Grafik: lightweight-charts, framer-motion, canvas-confetti, lucide-react
- Test: Vitest (saf fonksiyonlar ve durum makinesi için)
- CSS: Pure CSS Modules / Vanilla CSS Tokens (Tailwind YOK, tasarım token'ları kullanılacak)

---

### 🎨 TASARIM SİSTEMİ VE CSS TOKENS (`src/styles/tokens.css` & `global.css`)
Aşağıdaki CSS değişkenlerini `:root` seviyesinde tanımla ve tüm uygulamada kullan:
- `--bg: #070B14`, `--surface: #0F1626`, `--surface-2: #16203A`, `--border: #1E2A44`
- `--text: #E6EDF7`, `--muted: #7C8DB0`
- `--green: #34D399` (BUY), `--red: #F87171` (SELL), `--amber: #FBBF24` (Connecting), `--cyan: #22D3EE` (Price/Info), `--violet: #A78BFA` (Velocity)
- Fontlar: `--font-display: 'Space Grotesk', system-ui, sans-serif`, `--font-mono: 'JetBrains Mono', monospace`
- Masaüstünde tam ortalanmış, max-width: 480px olan "telefon kanvası" container'ı oluştur (dışı karartılmış, ince border'lı).
- Dokunma hedefleri minimum 44px.

---

### 🧮 İNDİKATÖR VE SİNYAL MOTORU KODLAMASI (`src/core/`)

Tüm fonksiyonlar `src/core/` altında UI'dan bağımsız SAF (PURE) FONKSİYONLAR olarak yazılacak:

1. `src/core/indicators/cvd.ts`:
   - Trade akışından CVD hesapla: `delta = side === 'buy' ? +qty : -qty`.
   - Son `window_s` (varsayılan 60 sn) pencereli birikim.
   - `CVD_norm = CVD / Sum(qty)` (range [-1, +1]).
   - `CVD_z = (CVD_norm - EMA(CVD_norm, 20)) / std(CVD_norm, 20)`.
   - Divergence Tespiti: Son 20 sn'de fiyat yeni yüksek tepe yaparken CVD_norm düşük tepe yapıyorsa bearish (-0.3 skor düzeltmesi); tersi bullish (+0.3 skor düzeltmesi).

2. `src/core/indicators/imbalance.ts` (OBI):
   - Son 20 derinlik seviyesinde: `B = Sum(bids.qty)`, `A = Sum(asks.qty)`.
   - `OBI_t = (B - A) / (B + A)`.
   - `OBI = EMA(OBI_t, alpha = 0.2)`.

3. `src/core/indicators/velocity.ts`:
   - 1 saniyelik pencerede fiyat hızı: `v_t = (P_t - P_{t-1}) / delta_t`.
   - `v = EMA(v_t, alpha = 0.3)`.
   - `v_z = (v - EMA(v, 30)) / std(v, 30)`.

4. `src/core/signal/engine.ts` (Kompozit Skor ve Durum Makinesi):
   - `S = w1*CVD_z + w2*OBI + w3*v_z` (Ağırlıklar toplamı 1'e normalize edilir).
   - Durum Makinesi: `IDLE` -> `ARMED` (|S| >= threshold 2 tick üst üste korunursa) -> `FIRED` -> `COOLDOWN` (15 sn yeni sinyal yok) -> `IDLE`.
   - Histerezis: FIRED sonrası skor |S| < 0.3'e düşmeden karşı yön tetiklenemez.
   - Güven Yüzdesi: `confidence = min(100, Math.round(|S| / 1.2 * 100))`.

5. Ring Buffer (`src/core/buffers/ringBuffer.ts`):
   - Trades için max 1.000 kayıt tutan sabit boyutlu FIFO bellek yapısı.

---

### 🌐 WSS VERİ KATMANI VE ADAPTÖRLER (`src/core/ws/`)
- `WsAdapter` arayüzü: OKX (`wss://ws.okx.com:8443/ws/v5/public`) ve Binance Futures (`wss://fstream.binance.com/stream?...`).
- Normalize veri yapıları: `NormalizedTrade`, `NormalizedDepth`, `NormalizedMark`.
- OKX adaptörünü varsayılan yap (TR erişim garantisi için).
- Exponential backoff ile kopmalarda sonsuz otomatik yeniden bağlanma (1s -> 2s -> 4s ... max 30s).
- `document.hidden` durumunda socket akışını duraklat/resume et.

---

### 🔊 SÖZEL SES VE HAPTİK SİSTEMİ (`src/core/audio/sound.ts`)
WebAudio API ile harici dosya YÜKLEMEDEN dosyasız sentez:
- BUY sinyali: 880 Hz, 80ms ping ses tonu + 60ms titreşim.
- SELL sinyali: 330 Hz, 120ms dong ses tonu + 2x40ms titreşim.
- Bağlantı kopması: 200 Hz, 150ms ses.

---

### 🏪 ZUSTAND STORE YAPISI (`src/store/`)
1. `dataStore.ts`: Canlı fiyat, CVD, OBI, Velocity, Kompozit Skor, Durum Makinesi durumu, Son 200 Sinyal Geçmişi, Yerel toplanan 15 sn mum verileri. Güncelleme ritmi max 10 Hz (100ms throttle).
2. `settingsStore.ts`: Source (OKX/Binance), Symbol (BTC-USDT), Weights (w1, w2, w3), Threshold (0.6), Cooldown (15s), Sound (on/off), Haptics (on/off). `localStorage` ile persist edilir.
3. `uiStore.ts`: Aktif sekme (`radar` | `chart` | `signals` | `settings`).

---

### 📱 EKRANLAR VE BİLEŞENLER (`src/ui/`)

1. **Header (`Header.tsx`):**
   - Bağlantı Durumu Pili (Canlı: Yeşil pulse, Bağlanıyor: Amber, Kopuk: Kırmızı).
   - Sembol ve Ticker Fiyatı (Fiyat değişim yönüne göre yeşil/kırmızı tween animasyon).
   - Mute/Unmute butonu.

2. **Ekran 1: RADAR (`screens/RadarScreen.tsx`):**
   - **Radar Canvas Gauge:** Dönen conic-gradient tarama çizgisi (3 sn/tur rAF), merkezde BUY(yeşil) / SELL(kırmızı) / NÖTR(gri) nefes alan LED, ok şeklinde skor ibresi, güven yüzdesi.
   - **3 Dikey Metrik Barı:** CVD, IMB, VEL için anlık seviye barları ve z-score değerleri.
   - **Mini Sinyal Şeridi:** En son üretilen sinyal özeti.
   - **Sinyal Efekti:** Sinyal çaktığı an Canvas konfeti patlaması (60 parçacık) + halka pulse şok dalgası.

3. **Ekran 2: CHART (`screens/ChartScreen.tsx`):**
   - `lightweight-charts` ile çizilen yerel 15s mum grafiği.
   - Alt panelde CVD Histogramı (yeşil/kırmızı dikey çubuklar).
   - Sinyal çakılan yerlerde mum üzerinde/altında ▲/▼ marker'lar.

4. **Ekran 3: SIGNALS (`screens/SignalsScreen.tsx`):**
   - Üretilen sinyallerin geçmiş listesi (Zaman, Yön, Fiyat, Güven Barları, Skor Dökümü).
   - Boş durumda: "Henüz sinyal yok - radar tarıyor..." ve yavaş radar animasyonu.

5. **Ekran 4: SETTINGS (`screens/SettingsScreen.tsx`):**
   - Borsa Kaynağı (OKX/Binance) ve Sembol seçimi.
   - İndikatör Ağırlık Kaydırıcıları (Toplamı otomatik %100'e normalize eden slider'lar).
   - Sinyal Eşik (Threshold) ve Cooldown ayarları.
   - Ses/Titreşim aç/kapa toggles + "Test Sinyali Çak" butonu.
   - Kalıcı "⚠️ Eğlence ve eğitim amaçlıdır, yatırım tavsiyesi değildir" uyarısı.

6. **Bottom Navigation (`TabBar.tsx`):**
   - Radar, Chart, Signals, Settings sekmeleri (İkon + Etiket, Aktif sekmede neon glow efekti).

---

### 🧪 BİRİM TESTLERİ (`src/core/**/*.test.ts`)
Vitest kullanarak en az 8 birim testi yaz:
1. CVD birikimi ve yön hesaplama doğruluğu.
2. CVD Divergence tespiti ve skor düzeltmesi.
3. OBI uç değer (±1) sınır hesaplaması.
4. Velocity z-score ve EMA yumuşatma.
5. Kompozit skor ağırlık normalizasyonu.
6. Sinyal Durum Makinesi histerezis kontrolü.
7. Cooldown süresi engelleyici testi.
8. WS Bağlantı durum geçişleri.

---

### 📁 KLASÖR YAPISI
Projeyi birebir şu yapıda oluştur:
```
src/
├── app/
│   ├── App.tsx
│   └── main.tsx
├── core/
│   ├── audio/
│   │   └── sound.ts
│   ├── buffers/
│   │   └── ringBuffer.ts
│   ├── indicators/
│   │   ├── cvd.ts
│   │   ├── imbalance.ts
│   │   └── velocity.ts
│   ├── signal/
│   │   └── engine.ts
│   └── ws/
│       ├── adapters/
│       │   ├── binance.ts
│       │   └── okx.ts
│       ├── types.ts
│       └── wsManager.ts
├── store/
│   ├── dataStore.ts
│   ├── settingsStore.ts
│   └── uiStore.ts
├── styles/
│   ├── global.css
│   └── tokens.css
├── types/
│   └── index.ts
└── ui/
    ├── components/
    │   ├── CanvasConfetti.tsx
    │   ├── Header.tsx
    │   ├── MeterBar.tsx
    │   ├── PriceTicker.tsx
    │   ├── RadarGauge.tsx
    │   ├── SignalLed.tsx
    │   └── TabBar.tsx
    └── screens/
        ├── ChartScreen.tsx
        ├── RadarScreen.tsx
        ├── SettingsScreen.tsx
        └── SignalsScreen.tsx
```

HİÇBİR AŞAMAYI VEYA BİLEŞENİ EKSİK BIRAKMA. `npm install && npm run dev` DENDİĞİNDE UYGULAMA DİREKT ÇALIŞMALI, `npm test` TÜM TESTLERDEN YEŞİL GEÇMELİDİR. KODU YAZMAYA BAŞLA!
```

---

## Checklist (Definition of Done)

Proje üretildikten sonra aşağıdaki maddelerin yeşil yandığını teyit et:

- [ ] `npm install && npm run dev` komutu hatasız çalışıyor.
- [ ] Masaüstü görünümünde 480px kanvas ortalanmış ve kokpit teması aktif.
- [ ] WSS bağlantısı OKX üzerinden kuruluyor, fiyat ve metriklere veri akıyor.
- [ ] Radar ekranında dönen çizgi, skor ibresi ve canlı LED çalışıyor.
- [ ] Sinyal tetiklendiğinde WebAudio ses çıkarıyor, haptik titreşim atıyor, konfeti patlıyor.
- [ ] Chart ekranında yerel 15s mumları ve CVD histogramı çiziliyor.
- [ ] Ayarlar ekranındaki slider'lar ve toggles anında çalışıyor, localStorage'a kaydediliyor.
- [ ] `npm test` komutu çalıştırıldığında 8 birim testin tamamı geçiyor.
- [ ] Alt sekmede "⚠️ Eğlence amaçlıdır, yatırım tavsiyesi değildir" etiketi görünür durumda.
