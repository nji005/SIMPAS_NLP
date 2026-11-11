# Panduan Deploy Produksi SIPMAS

Panduan ini menjelaskan langkah menjalankan **SIPMAS** di satu VPS Ubuntu menggunakan image dari GitHub Container Registry (**GHCR**) dan **Cloudflare Tunnel** untuk domain `sipmas.my.id`.

> **Penting sebelum mulai:**
> - Server target memakai port host `80`, `443`, dan `8080` untuk Traefik bawaan penyedia VPS. **Jangan sentuh `/opt/vpsmurah`** maupun kontainer `traefik`, dan **jangan menambahkan `ports:`** di `docker-compose.prod.yml`.
> - Jangan pernah menyentuh database lain di server seperti `db_pengaduan`; seluruh aplikasi dan backup SIPMAS hanya memakai `db_sipmas`.
> - Di repositori ini juga terdapat berkas `AGENTS.md`.

---

## Ringkasan Komponen dan Berkas Deploy

- **`docker-compose.prod.yml`** — **Fungsi:** menjalankan semua layanan aplikasi (`mysql`, `nlp`, `backend`, `frontend`, `caddy`, dan opsional `cloudflared`) dari image jadi di GHCR tanpa melakukan build di VPS, dengan batas memori total aman untuk VPS RAM kecil.
- **`Caddyfile`** — **Fungsi:** menjadi pintu masuk internal di port `80` agar browser mengakses website (`/`) dan API/foto (`/api/*`, `/uploads/*`) lewat satu alamat yang sama sehingga cookie login bekerja aman, serta meneruskan IP asli pengunjung dari Cloudflare ke backend.
- **`.env.production.example`** — **Fungsi:** templat variabel lingkungan berisi daftar pengaturan wajib (kata sandi database, kunci JWT, akun email pengirim OTP) dan opsional (token tunnel, tag versi image) sebelum disalin menjadi `.env`.
- **`docker-compose.prod.local.yml`** — **Fungsi:** pengaturan tambahan khusus uji coba di laptop agar aplikasi bisa dibuka melalui `http://127.0.0.1:8088` tanpa Cloudflare Tunnel.
- **`infra/scripts/backup-db.sh`** — **Fungsi:** mencadangkan isi database `db_sipmas` secara otomatis dalam format terkompresi `.sql.gz` ke folder `backups/` dan menghapus arsip lama di atas 7 hari.

---

## 1. Terhubung ke VPS via SSH

Masuk ke VPS menggunakan port SSH `20166`:

```bash
ssh -p 20166 user@ALAMAT_IP_VPS
```

---

## 2. Siapkan Folder Deploy di VPS

Buat direktori kerja di VPS (misalnya `/opt/sipmas`) lalu salin berkas-berkas deploy berikut dari repositori lokal ke server:

- `docker-compose.prod.yml`
- `Caddyfile`
- `.env.production.example`
- Folder `infra/scripts/` (`backup-db.sh`, `restore-db.sh`, `backup-uploads.sh`)

Contoh menyalin dari laptop memakai `scp` port `20166`:

```bash
ssh -p 20166 user@ALAMAT_IP_VPS "mkdir -p /opt/sipmas/infra/scripts /opt/sipmas/backups"
scp -P 20166 docker-compose.prod.yml Caddyfile .env.production.example user@ALAMAT_IP_VPS:/opt/sipmas/
scp -P 20166 infra/scripts/*.sh user@ALAMAT_IP_VPS:/opt/sipmas/infra/scripts/
```

Di VPS, masuk ke folder deploy dan pastikan skrip backup bisa dieksekusi:

```bash
cd /opt/sipmas
chmod +x infra/scripts/*.sh
```

---

## 3. Buat dan Isi Berkas `.env`

Salin templat menjadi `.env` lalu amankan izin bacanya:

```bash
cp .env.production.example .env
chmod 600 .env
```

Buat kunci acak untuk `JWT_SECRET` dan dua kata sandi terpisah untuk `DB_PASSWORD` serta `DB_APP_PASSWORD` (format `-hex` menghasilkan satu baris utuh agar mudah disalin):

```bash
# Untuk JWT_SECRET (jalankan 1x):
openssl rand -hex 48

# Untuk DB_PASSWORD dan DB_APP_PASSWORD (jalankan 2x agar masing-masing unik):
openssl rand -hex 16
```

> **Catatan kata sandi database:** Kata sandi `DB_PASSWORD` dan `DB_APP_PASSWORD` **harus huruf dan angka saja** (tanpa karakter khusus seperti `@`, `:`, `/`, `?`, `#`, `&`) karena dimasukkan langsung ke URL koneksi `DATABASE_URL`. Hasil `openssl rand -hex 16` hanya berisi `0-9` dan `a-f`, sehingga aman digunakan.

Edit `.env` (`nano .env`) dan isi:
- **`DB_PASSWORD`**: hasil `openssl rand -hex 16` pertama (wajib, tidak boleh kosong, huruf dan angka saja).
- **`DB_APP_PASSWORD`**: hasil `openssl rand -hex 16` kedua (wajib, berbeda dari `DB_PASSWORD`, huruf dan angka saja).
- **`DATABASE_URL`**: samakan kata sandinya dengan `DB_APP_PASSWORD`:
  `mysql://sipmas_app:<DB_APP_PASSWORD>@mysql:3306/db_sipmas`
- **`JWT_SECRET`**: hasil `openssl rand -hex 48`.
- **`SMTP_HOST`**, **`SMTP_PORT`**, **`SMTP_USER`**, **`SMTP_PASS`**, **`SMTP_FROM`**: akun Gmail SMTP dengan App Password 16 huruf tanpa spasi untuk pengiriman OTP.
- **`FRONTEND_URL`**: isi `https://sipmas.my.id` bila memakai tunnel bernama (atau diperbarui setelah quick tunnel aktif).
- **`TRUST_PROXY`**: biarkan **`2`** (karena request melewati `cloudflared` lalu `caddy` menuju `backend`, sehingga backend membaca IP asli pengunjung untuk batas percobaan login).
- **`ADMIN_PASSWORD`**: **biarkan kosong (`""`)** di dalam `.env`. Kata sandi admin hanya dimasukkan sesaat ketika membuat akun admin pertama kali di langkah 6.

---

## 4. Akses Image dari GHCR

Image produksi dibangun otomatis ke GHCR oleh GitHub Actions setiap ada push ke branch utama:
- `ghcr.io/nji005/simpas_nlp-frontend`
- `ghcr.io/nji005/simpas_nlp-backend`
- `ghcr.io/nji005/simpas_nlp-nlp`

Pilih salah satu dari dua cara berikut di GitHub sebelum menjalankan `docker compose pull`:

1. **Jadikan paket GHCR bersifat Publik (paling praktis untuk tugas):**
   Di GitHub -> **Packages** -> pilih masing-masing paket (`simpas_nlp-frontend`, `simpas_nlp-backend`, `simpas_nlp-nlp`) -> **Package settings** -> ubah visibilitas ke **Public**. VPS tidak perlu `docker login` untuk mengunduh image.
2. **Atau pakai `docker login` jika paket tetap Privat:**
   Buat GitHub Personal Access Token (Classic) dengan izin **`read:packages`**, lalu login dari VPS:
   ```bash
   echo "TOKEN_GITHUB_ANDA" | docker login ghcr.io -u USERNAME_GITHUB --password-stdin
   ```

---

## 5. Unduh Image dan Jalankan Layanan

Unduh seluruh image terlebih dahulu:

```bash
docker compose -f docker-compose.prod.yml pull
```

Pilih salah satu mode Cloudflare Tunnel saat menyalakan stack:

### Pilihan A: Quick Tunnel (Sementara untuk Uji Coba)

Cocok untuk menguji akses internet sebelum domain `sipmas.my.id` terpasang. Alamat `trycloudflare.com` berubah setiap kontainer tunnel dimulai ulang.

```bash
docker compose -f docker-compose.prod.yml --profile tunnel-quick up -d
```

Cek alamat tunnel sementara dari log `cloudflared`:

```bash
docker logs sipmas-prod-cloudflared-quick 2>&1 | grep trycloudflare.com
```

Setelah mendapat alamat (misalnya `https://contoh-acak.trycloudflare.com`):
1. Ubah baris `FRONTEND_URL` di `.env` menjadi alamat tersebut.
2. Terapkan ke backend agar validasi CORS menerima alamat baru tersebut:
   ```bash
   docker compose -f docker-compose.prod.yml up -d backend
   ```

### Pilihan B: Named Tunnel (`https://sipmas.my.id`)

Cocok untuk alamat domain tetap menggunakan akun Cloudflare:
1. Di dashboard Cloudflare Zero Trust -> **Networks** -> **Tunnels**, buat tunnel baru dan salin **Token** tunnel.
2. Pada pengaturan **Public Hostname** tunnel tersebut, arahkan domain `sipmas.my.id` ke Service **`http://caddy:80`** (Type: `HTTP`).
3. Pastikan `FRONTEND_URL="https://sipmas.my.id"` dan isi `TUNNEL_TOKEN="..."` di berkas `.env` cukup satu kali saja.
4. Jalankan seluruh layanan beserta named tunnel:
   ```bash
   docker compose -f docker-compose.prod.yml --profile tunnel-named up -d
   ```

---

## 6. Buat Akun Admin Pertama Kali

Akun admin tidak dibuat otomatis saat startup. Jalankan perintah berikut satu kali setelah kontainer `backend` sehat, dengan mengganti `<ISI_PASSWORD_ADMIN>` (jangan disimpan di `.env`):

```bash
 docker compose -f docker-compose.prod.yml exec -e ADMIN_PASSWORD="<ISI_PASSWORD_ADMIN>" backend node prisma/seed.js
```

> **Catatan keamanan riwayat shell:** Perintah di atas **diawali satu spasi** di depan `docker` agar tidak tersimpan di riwayat shell (`~/.bash_history`) bila `HISTCONTROL=ignorespace` atau `HISTCONTROL=ignoreboth` aktif di terminal Anda.

Untuk menyinkronkan profil jika `ADMIN_EMAIL` / `ADMIN_NIK` / `ADMIN_NAMA` di `.env` ingin disesuaikan, cukup atur sebelum perintah seed dijalankan pertama kali. Perintah ini aman dijalankan ulang karena akan melewati pembuatan bila akun `ADMIN` sudah ada.

---

## 7. Memantau Status & Log Layanan

Periksa status kontainer dan konsumsi memori:

```bash
docker compose -f docker-compose.prod.yml ps
docker stats --no-stream
```

Lihat log layanan secara langsung:

```bash
docker compose -f docker-compose.prod.yml logs -f backend frontend caddy
```

Untuk memeriksa log tunnel saja:

```bash
docker compose -f docker-compose.prod.yml logs -f cloudflared-named
```

---

## 8. Memperbarui Aplikasi (Update)

Saat ada versi baru yang sudah dibangun ke GHCR:

```bash
cd /opt/sipmas
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml --profile tunnel-named up -d
```

*(Ganti `--profile tunnel-named` dengan `--profile tunnel-quick` bila memakai quick tunnel; ingat perbarui lagi `FRONTEND_URL` bila alamat quick tunnel berubah.)*

---

## 9. Backup dan Restore Data

> **Peringatan:** Jangan pernah menjalankan perintah Docker yang menghapus volume atau membersihkan volume yang terpasang, karena tindakan tersebut akan menghapus seluruh data database dan foto laporan warga.

### Backup Manual Database & Foto Upload

```bash
cd /opt/sipmas
# Backup database db_sipmas terkompresi (.sql.gz, retensi otomatis 7 hari):
bash infra/scripts/backup-db.sh

# Backup folder foto upload dari Docker volume produksi:
bash infra/scripts/backup-uploads.sh prod_backend_uploads
```

### Jadwal Backup Otomatis (Cron Harian)

Tambahkan jadwal cron (`crontab -e`) agar backup berjalan setiap hari pukul 02.00 dini hari:

```cron
0 2 * * * cd /opt/sipmas && bash infra/scripts/backup-db.sh >> /opt/sipmas/backups/backup-db.log 2>&1
15 2 * * * cd /opt/sipmas && bash infra/scripts/backup-uploads.sh prod_backend_uploads >> /opt/sipmas/backups/backup-uploads.log 2>&1
```

### Restore Database dari Backup

Disarankan menguji file backup ke database sementara terlebih dahulu (`db_sipmas_restore_test`) sebelum menyentuh database aktif:

```bash
# 1. Uji restore ke database sementara:
bash infra/scripts/restore-db.sh backups/db_sipmas_YYYYMMDD_HHMMSS.sql.gz db_sipmas_restore_test

# 2. Restore menimpa database aktif db_sipmas (wajib flag konfirmasi eksplisit):
bash infra/scripts/restore-db.sh backups/db_sipmas_YYYYMMDD_HHMMSS.sql.gz db_sipmas --yes-overwrite-sipmas
```

---

## 10. Rollback ke Versi Sebelumnya

Setiap build di GHCR ditandai dengan `latest` sekaligus **commit SHA** lengkap GitHub. Jika pembaruan bermasalah dan ingin kembali ke commit tertentu:

1. Buka tab **Actions** atau **Packages** di GitHub untuk menyalin commit SHA versi stabil sebelumnya.
2. Ubah `IMAGE_TAG` di `.env` dari `latest` menjadi SHA tersebut (misalnya `IMAGE_TAG=1c9a108...`).
3. Tarik image versi tersebut dan mulai ulang kontainer:
   ```bash
   docker compose -f docker-compose.prod.yml pull
   docker compose -f docker-compose.prod.yml --profile tunnel-named up -d
   ```
4. Jika sudah memperbaiki masalah di kode dan versi baru sudah terbit, kembalikan `IMAGE_TAG=latest` di `.env`, lalu ulangi langkah update.

---

## 11. Uji Coba Stack Produksi di Laptop (Opsional)

File `docker-compose.prod.local.yml` memakai `pull_policy: missing`: Docker akan memakai image lokal bila sudah tersedia, dan hanya menarik dari GHCR bila image lokal belum ada. Image GHCR baru tersedia setelah workflow CI pertama pada branch utama selesai berjalan dan paket GHCR sudah diubah menjadi publik (atau sudah `docker login ghcr.io`).

Jika ingin menguji di laptop sebelum CI push berjalan atau untuk mencoba perubahan lokal, bangun ketiga image secara lokal dengan tag yang sama seperti di `docker-compose.prod.yml`:

```bash
docker build -t ghcr.io/nji005/simpas_nlp-nlp:latest -f apps/nlp-service/Dockerfile ./apps/nlp-service
docker build -t ghcr.io/nji005/simpas_nlp-backend:latest -f apps/backend/Dockerfile .
docker build -t ghcr.io/nji005/simpas_nlp-frontend:latest --build-arg NEXT_PUBLIC_API_URL= --build-arg INTERNAL_API_URL=http://backend:5001 -f apps/frontend/Dockerfile .
```

Setelah image siap (atau tersedia di GHCR) dan `.env` terisi, jalankan stack produksi lokal (tanpa Cloudflare Tunnel, hanya mengekspos Caddy di `127.0.0.1:8088`):

```bash
docker compose -f docker-compose.prod.yml -f docker-compose.prod.local.yml up -d
```

Untuk database lokal yang masih kosong, buat akun admin uji sekali saja (awali perintah dengan satu spasi agar tidak tersimpan di riwayat shell bila `HISTCONTROL=ignorespace` aktif):

```bash
 docker compose -f docker-compose.prod.yml -f docker-compose.prod.local.yml exec -e ADMIN_PASSWORD="<ISI_PASSWORD_ADMIN>" backend node prisma/seed.js
```

Setelah kontainer sehat, buka `http://127.0.0.1:8088` melalui browser, atau cek `http://127.0.0.1:8088/api/health`. Untuk menghentikan uji coba **tanpa menghapus data**:

```bash
docker compose -f docker-compose.prod.yml -f docker-compose.prod.local.yml down
```
