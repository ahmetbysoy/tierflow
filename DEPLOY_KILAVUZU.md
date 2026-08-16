# Tierflow Deploy Kılavuzu - ahmetbysoy

## Durum: Lokal repo hazır ✅
- Branch: `main`
- Commit: `bd8f4e6` - G1+G2+Divergence
- Remote: `https://github.com/ahmetbysoy/tierflow.git` (henüz oluşturulmadı - 404)

---

## YOL 1: Ben senin yerine pushlayayım (30 saniye - ÖNERİLEN)

### Adım 1: GitHub'da boş repo oluştur
1. https://github.com/new git
2. Repository name: `tierflow`
3. Visibility: **Private** (önerilir)
4. **Hiçbir şey işaretleme:** README, .gitignore, license EKLEME
5. Create repository

### Adım 2: Bana PAT ver
1. https://github.com/settings/tokens/new
2. Note: `tierflow-deploy`
3. Expiration: 7 days
4. Scopes: sadece `repo` tikle
5. Generate token -> `ghp_xxxx` kopyala

Bana şunu gönder:
```
ghp_xxxxxxx
```

Ben tek komutla pushlayacağım:
```bash
git push -u origin main
```

### Adım 3: Vercel otomatik deploy
Repo pushlanınca 2 seçeneğin var:

**A) GitHub entegrasyonu (en kolayı):**
1. https://vercel.com/new git
2. Import Git Repository -> `ahmetbysoy/tierflow` seç
3. Framework Preset: `Vite`
4. Build Command: `npm run build`
5. Output Directory: `dist`
6. Deploy -> bitti. Her push'ta otomatik deploy olur.

**B) Bana Vercel Token ver, ben CLI ile deploy edeyim:**
1. https://vercel.com/account/tokens -> Create Token
2. Token'ı bana gönder, ben `vercel --prod` çakayım.

---

## YOL 2: Sen manuel pushla (token vermek istemiyorsan)

### Seçenek 2A: Dosyayı indir
Bu workspace'ten `tierflow.tar.gz` indir, kendi bilgisayarında aç:

```bash
tar -xzf tierflow.tar.gz
cd tierflow
git init
git add .
git commit -m "feat: initial"
git branch -M main
git remote add origin https://github.com/ahmetbysoy/tierflow.git
git push -u origin main
```

### Seçenek 2B: Bundle ile
`tierflow.bundle` dosyasını indir:

```bash
git clone tierflow.bundle tierflow
cd tierflow
git remote add origin https://github.com/ahmetbysoy/tierflow.git
git push -u origin main
```

Sonra Vercel'e aynı şekilde import et.

---

## Sonraki adım için bana ne lazım?

Eğer YOL 1'i seçtiysen bana sadece şunu gönder:
1. `ghp_...` tokenın (GitHub repo'yu oluşturduktan sonra)
2. Vercel tercihin: `github entegrasyonu ben hallederim` mi yoksa `vercel token vereceğim` mi?

Token'ları burada paylaşmak güvenli - bu sandbox sadece sana özel ve snapshot'a git config dahil değil.
