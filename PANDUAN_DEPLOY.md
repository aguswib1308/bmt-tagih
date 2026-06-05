# 🚀 Panduan Deploy Railway — BMT Amal Muslim

---

## 📁 Struktur Final Sebelum Upload

Pastikan folder project Dul seperti ini:

```
koperasi-app/
├── app.py                  ← (file baru, ganti yang lama)
├── init_db.py
├── requirements.txt
├── Procfile                ← (file baru)
├── railway.json            ← (file baru)
├── .gitignore              ← (file baru)
├── templates/
│   └── index.html          ← (pindahkan index.html ke sini)
└── static/
    ├── css/
    │   └── style.css
    ├── js/
    │   └── app.js          ← (file baru)
    └── manifest.json       ← (file baru)
```

---

## 🔧 Step 1 — Siapkan File

1. **Ganti** `app.py` dengan versi baru
2. **Pindahkan** `index.html` → ke folder `templates/index.html`
3. **Taruh** `app.js` di `static/js/app.js`
4. **Taruh** `manifest.json` di `static/manifest.json`
5. **Taruh** `Procfile`, `railway.json`, `.gitignore` di root folder

---

## 🐙 Step 2 — Upload ke GitHub

```bash
# Di terminal, masuk ke folder project
cd koperasi-app

# Init git (kalau belum)
git init
git add .
git commit -m "BMT Amal Muslim — initial deploy"

# Buat repo baru di github.com, lalu:
git remote add origin https://github.com/USERNAME/bmt-amal-muslim.git
git branch -M main
git push -u origin main
```

> ⚠️ Folder `data/` tidak akan ikut karena ada di .gitignore.
> Database akan dibuat otomatis saat pertama deploy.

---

## 🚂 Step 3 — Deploy di Railway

1. Buka **https://railway.app** → Login/daftar
2. Klik **"New Project"**
3. Pilih **"Deploy from GitHub repo"**
4. Pilih repo `bmt-amal-muslim`
5. Railway otomatis detect Python dan install requirements
6. Tunggu build selesai (~2-3 menit)

---

## 🔑 Step 4 — Set Environment Variables

Di Railway dashboard → project → **Variables**, tambahkan:

| Key | Value |
|-----|-------|
| `FONNTE_TOKEN` | Token dari fonnte.com |
| `SECRET_KEY` | String random panjang (misal: `bmt2026wonogiri!secret`) |

---

## 📊 Step 5 — Import Data Pertama

Setelah deploy berhasil:

1. Buka URL Railway yang dikasih (misal: `bmt-amal-muslim.up.railway.app`)
2. Login dengan `admin / admin123`
3. Buka menu **⚙️ Admin**
4. Upload file Excel tagihan bulan ini
5. Cek hasil import di Histori Import

---

## 📱 Step 6 — Install ke HP (PWA)

1. Buka URL Railway di **Chrome HP**
2. Tap menu **⋮** → **"Add to Home Screen"**
3. Bagikan URL ke semua marketing

---

## 🔔 Step 7 — Setup Fonnte (Notif WA)

1. Daftar di **https://fonnte.com**
2. Menu **"Device"** → **"Add Device"**
3. Scan QR dengan HP WA yang mau dipakai (HP khusus BMT)
4. Copy **API Token**
5. Paste ke Railway Variables → `FONNTE_TOKEN`

---

## ⚠️ Hal Penting

- **Ganti password default** setelah pertama login!
- Database Railway **tidak reset** selama app aktif
- Railway free tier: aktif 24/7, cukup untuk pemakaian internal
- Kalau mau tambah user marketing baru → tambah di `init_db.py` bagian seed users, lalu re-deploy

---

## 🆘 Kalau Error

| Error | Solusi |
|-------|--------|
| `ModuleNotFoundError` | Cek `requirements.txt` sudah lengkap |
| `500 Internal Server Error` | Cek Railway Logs → Deploy Logs |
| WA tidak terkirim | Cek `FONNTE_TOKEN` sudah diset + device Fonnte online |
| Login gagal | Pastikan `init_db.py` sudah jalan (cek logs) |
