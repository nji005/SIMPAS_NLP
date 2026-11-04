# AGENTS.md — SIPMAS (Sistem Pengaduan Masyarakat)

Dokumen ini adalah konteks wajib bagi AI coding agent (Antigravity) sebelum
melakukan perubahan apapun pada repo ini. Baca seluruh dokumen ini sampai
selesai sebelum menulis kode.

---

## 0. ATURAN PALING PENTING — BACA DULU

1. **DILARANG mengubah UI/UX dalam bentuk apapun**, kecuali disebutkan
   eksplisit sebaliknya di scope suatu fase. Definisi "UI/UX" di sini:
   - Markup JSX, urutan elemen, komponen visual, class Tailwind, warna,
     spacing, layout, animasi.
   - Teks/copy yang dilihat user (label tombol, pesan error yang tampil di
     UI, judul halaman, dll).
   - Alur navigasi yang dirasakan user (halaman mana yang muncul kapan).
   - Library UI, ikon, font.

   **Yang BOLEH diubah** meski menyentuh file frontend: cara data diambil
   (fetch ke backend baru, ganti base URL), mekanisme penyimpanan sesi
   (localStorage → cookie) **selama perilaku yang terlihat user identik**
   (tetap redirect ke `/login` kalau belum login, tetap menampilkan nama
   admin, dsb), lokasi file (pindah folder), path import.

   **Kalau ragu apakah suatu perubahan menyentuh UI/UX atau tidak — JANGAN
   jalan, tanya dulu ke user.**

2. **Kerjakan HANYA SATU FASE dalam satu waktu** (lihat Bagian 5). Jangan
   mengantisipasi/mengerjakan tugas fase berikutnya meskipun terlihat lebih
   efisien dilakukan sekaligus.

   > ⚠️ **Aturan ini PERNAH DILANGGAR.** Pada sesi kerja sebelumnya, seluruh
   > Fase 0 sampai 5 dikerjakan sekaligus dalam satu jalan tanpa berhenti
   > untuk review — padahal instruksi eksplisit meminta berhenti setelah
   > Fase 0 saja. Ini TIDAK BOLEH terulang. Setelah menyelesaikan tugas fase
   > yang sedang aktif: JANGAN membuat, mengedit, atau menghapus file apapun
   > yang termasuk scope fase berikutnya — dalam giliran/respons yang sama
   > maupun sesudahnya — sampai user secara eksplisit memberi prompt fase
   > berikutnya. Ini berlaku sekalipun perubahan itu terlihat trivial, kecil,
   > atau "sekalian saja karena sudah di situ". Mengerjakan lebih dari satu
   > fase dalam satu sesi dianggap kegagalan mengikuti instruksi yang sama
   > seriusnya dengan mengubah UI/UX tanpa izin.

3. **Jangan hapus/timpa kode lama sebelum penggantinya terbukti bekerja
   sama persis.** Migrasi dilakukan paralel dulu, verifikasi, baru bersihkan.

4. Setelah menyelesaikan scope satu fase: jalankan build/lint yang tersedia,
   laporkan hasilnya secara ringkas, tandai status fase sebagai
   **"Menunggu review"**, lalu **BERHENTI** dan tunggu konfirmasi user
   sebelum mulai fase berikutnya.

5. Commit kecil dan terpisah per sub-task, bukan satu commit raksasa per fase.

6. Pertahankan istilah domain berbahasa Indonesia yang sudah dipakai di
   codebase (`judul`, `isi`, `laporan`, `warga`, `kategori`, dll) — jangan
   diterjemahkan ke Inggris demi "konsistensi".

---

## 1. Tentang Project Ini

Aplikasi pengaduan masyarakat (nama produk: **SIPMAS** — Sistem Pengaduan
Masyarakat). Warga bisa
membuat akun (verifikasi via OTP email), mengirim laporan/aduan (dengan
foto), melihat riwayat laporan, dan melihat statistik. Admin bisa mengelola
laporan (ubah status), mengelola user (ubah role), dan melihat analytics.
Ada komponen klasifikasi teks (NLP, model SVM + TF-IDF, Python) yang
memprediksi kategori laporan dari isi teksnya.

## 2. Kondisi Saat Ini (Before Refactor)

Struktur real saat ini (bukan yang diinginkan — ini FAKTA kondisi kode):

```
pengaduan_masyarakat/
├── src/app/                 # Next.js App Router — halaman (UI)
├── src/app/api/**/route.ts  # "Backend" = Next.js Route Handlers, JADI SATU
│                              proses dengan frontend, akses Prisma langsung
├── src/lib/prisma.ts
├── src/components/Navbar.tsx
├── prisma/schema.prisma     # MySQL, connection string HARDCODED (bug)
├── nlp-service/             # Flask (Python), SVM + TF-IDF, dipanggil via
│   ├── app.py                 URL hardcoded http://127.0.0.1:5000
│   ├── train.py
│   └── dataset/*.csv
└── public/uploads/          # upload foto laporan, tanpa validasi
```

Masalah arsitektur & keamanan yang sudah teridentifikasi (jadi alasan
refactor ini dilakukan):

- **Tidak ada backend Node.js yang sesungguhnya** — logic backend menyatu
  di dalam Next.js. Ini akan dipisah jadi service Node.js mandiri.
- **Tidak ada sesi/JWT.** Auth hanya `localStorage.setItem("user", ...)` di
  client, dibaca ulang oleh `admin/layout.tsx` dan `Navbar.tsx` untuk
  menentukan akses — bisa dipalsukan dari DevTools.
- **Endpoint admin (`/api/admin/*`) tanpa cek role di server.**
- **IDOR**: `/api/riwayat` dan `/api/laporan` menerima `userId` mentah dari
  client tanpa verifikasi kepemilikan sesi.
- **Upload file tanpa validasi tipe/ukuran.**
- **OTP tanpa rate limiting.**
- **`schema.prisma` hardcode connection string**, mengabaikan `.env`.
- Field `kategori`/`lokasi`/`tanggal` digabung jadi satu string di kolom
  `Laporan.isi`, lalu di-parse ulang pakai regex di analytics — bukan kolom
  asli.
- Hasil prediksi NLP tidak pernah disimpan; analytics pakai regex manual
  yang terpisah dari model ML → dua sumber kebenaran yang tidak sinkron.
- `nlp-service` Flask jalan dengan dev server, endpoint `/train` publik
  tanpa proteksi, dependency tidak di-pin versinya.
- Tidak ada Docker sama sekali.

## 3. Target Arsitektur (After Refactor)

```
pengaduan-masyarakat/
├── apps/
│   ├── frontend/                # Next.js — UI MURNI, tanpa akses Prisma
│   │   ├── src/app/...          # isi halaman TIDAK BOLEH berubah tampilannya
│   │   ├── src/lib/api-client.ts
│   │   └── src/middleware.ts    # cek sesi di edge (Fase 2+)
│   ├── backend/                 # Node.js API mandiri (Express)
│   │   ├── src/modules/{auth,laporan,riwayat,admin,users}/
│   │   ├── src/middlewares/{authGuard,roleGuard,errorHandler,uploadValidator}.ts
│   │   ├── src/services/nlpClient.ts
│   │   ├── src/lib/prisma.ts
│   │   └── prisma/{schema.prisma,migrations/}
│   └── nlp-service/             # Python — API klasifikasi
│       ├── app/main.py
│       ├── app/model/{train.py,preprocess.py}
│       ├── app/artifacts/
│       └── dataset/
├── packages/
│   ├── shared-types/
│   ├── eslint-config/
│   └── tsconfig-base/
├── infra/docker/
│   ├── docker-compose.yml
│   └── docker-compose.prod.yml
├── .github/workflows/
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

## 4. Peta Status Fase

> Agent WAJIB update kolom Status di sini setiap kali menyelesaikan scope
> suatu fase, lalu berhenti.

| Fase | Nama | Status |
|---|---|---|
| 0 | Setup monorepo (tanpa ubah logic) | DONE* |
| 1 | Ekstraksi backend Node.js murni | DONE* |
| 2 | Autentikasi & otorisasi (JWT/cookie, guard) | DONE* |
| 3 | Perbaikan data model & integrasi NLP tersimpan | DONE* |
| 4 | NLP service production-ready | DONE* |
| 5 | Dockerize & CI | DONE* |
| 6 | Audit & remediasi keamanan (temuan review manual) | DONE |
| 7 | Rebranding: SuaraCilegon → SIPMAS | DONE |
| 8 | Database baru db_sipmas (additif, db_pengaduan tidak disentuh) | DONE |
| 9 | Hardening pasca-refactor: admin bootstrap, test, backup, logging, object storage | DONE |
| 10 | Perbaikan kecil: DATABASE_URL compose dev + ADMIN_PASSWORD fail-fast | DONE |
| 11 | Nonaktifkan MinIO (image Docker tidak lagi tersedia), fallback ke disk lokal | DONE |
| 12 | Perbaikan referensi basi: README setup & label dashboard monitoring | DONE |
| 13 | Tampilan mobile responsive (desktop tetap identik) | DONE |
| 13b | Perbaikan lanjutan Fase 13: sticky, toast desktop, catatan analytics publik | DONE |
| 14 | Ganti MYSQL_DATABASE jadi db_sipmas di kedua compose dev | DONE |
| 15 | Pengerasan keamanan P0 hasil audit eksternal (secret, OTP, proxy, monitoring, analytics, upload di git) | DONE |
| 16 | Pengerasan P1: Tahap A aplikasi (dependensi, helmet, upload, JWT, validasi, analytics SQL), Tahap B Docker/CI/backup | DONE |
| 17 | NLP dan kualitas data: evaluasi jujur, ambang keyakinan, hapus /train, tes | DONE |
| 18 | Kirim OTP lewat SMTP asli: compose meneruskan SMTP dari .env, modul mailer, dokumentasi | DONE |
| 19 | Pembersihan akhir sebelum hosting: commit pekerjaan, hapus berkas/kode/dependency mati, perbaiki README | DONE |
| 20 | Perbaikan tertunda (CI, teks audit, Prisma/Jest, favicon, backup foto) dan penyederhanaan menjadi 3 kategori + Lainnya | DONE |
| 21 | Bukti penyelesaian laporan: tanggapan wajib, foto bukti opsional, tampil di riwayat pelapor | DONE |
| 22 | Halaman detail laporan untuk pelapor: riwayat jadi daftar ringkas, detail di /user/riwayat/[id] | MENUNGGU REVIEW |

Status yang valid: `TODO`, `IN PROGRESS`, `MENUNGGU REVIEW`, `DONE`.

\* Fase 0–5 ditandai `DONE` karena kodenya memang sudah dibuat dan sudah
direview manual oleh user — tapi dikerjakan **sekaligus dalam satu sesi,
melanggar aturan satu-fase-per-sesi** di Bagian 0 poin 2. Dari review manual
tersebut ditemukan 2 celah keamanan yang sudah diperbaiki di **Fase 6**
(diverifikasi manual, tidak pakai tanda bintang karena dikerjakan sesuai
aturan satu-fase-per-sesi). **Fase 8** adalah satu-satunya fase yang aktif
sekarang; jangan sentuh fase lain.

---

## 5. Detail Tiap Fase

### Fase 0 — Setup Monorepo (tanpa mengubah logic apapun)

**Tujuan:** hanya menata ulang lokasi file, belum mengubah perilaku aplikasi
sedikitpun.

**Lakukan:**
- Inisialisasi pnpm workspace + Turborepo di root (`apps/`, `packages/`,
  `infra/`).
- Pindahkan seluruh isi project Next.js saat ini apa adanya ke
  `apps/frontend/` (termasuk `src/app/api/**` untuk sementara — JANGAN
  dihapus/dipindah dulu, itu tugas Fase 1).
- Pindahkan `nlp-service/` apa adanya ke `apps/nlp-service/`.
- Buat `.env.example` lengkap berdasarkan variabel yang benar-benar dipakai.
- Update path config yang perlu (tsconfig, package.json name/scripts)
  seminimal mungkin agar project tetap jalan dari lokasi baru.

**Dilarang di fase ini:**
- Membuat `apps/backend` (belum, itu Fase 1).
- Mengubah satupun file `.tsx`/`page.tsx`/`.css` isinya.
- Mengubah logic apapun di `route.ts`.

**Definition of Done:**
- `pnpm install` sukses dari root.
- `pnpm --filter frontend dev` menampilkan aplikasi **identik secara visual
  dan fungsional** dengan sebelum dipindah.
- `nlp-service` masih bisa dijalankan manual seperti sebelumnya dari lokasi
  barunya.

---

### Fase 1 — Ekstraksi Backend Node.js Murni

**Tujuan:** logic yang sekarang ada di `route.ts` pindah jadi service
Node.js/Express mandiri di `apps/backend`, frontend jadi murni UI yang
memanggil backend ini via HTTP.

**Lakukan:**
- Buat `apps/backend` (Express + TypeScript).
- Pindahkan `prisma/schema.prisma` dan folder migrations ke
  `apps/backend/prisma/`. Perbaiki schema agar pakai `env("DATABASE_URL")`
  (bukan hardcode) — **ini perbaikan bug, boleh dilakukan di fase ini**.
- Pindahkan logic tiap `route.ts` menjadi controller Express 1:1 (perilaku
  request/response harus identik dulu — jangan sambil memperbaiki
  keamanan, itu Fase 2):
  - `auth/login`, `auth/register`, `auth/send-otp`, `auth/verify-register`,
    `auth/reset`
  - `laporan` (create + upload), `riwayat`, `predict` (proxy ke
    nlp-service), `admin/laporan`, `admin/users`, `admin/analytics`
- Ganti hardcode `http://127.0.0.1:5000` jadi `process.env.NLP_SERVICE_URL`.
- Update `apps/frontend` **hanya pada bagian pemanggilan API** (fetch URL)
  agar mengarah ke `apps/backend`, lewat `NEXT_PUBLIC_API_URL`. Jangan
  ubah apapun selain endpoint yang dipanggil.
- Setelah backend baru diverifikasi memberi response yang sama persis
  untuk setiap endpoint, baru hapus folder `src/app/api` dari frontend.

**Dilarang di fase ini:**
- Mengganti mekanisme auth (masih tetap `localStorage` dulu — itu Fase 2).
- Mengubah struktur tabel database (itu Fase 3).
- Mengubah tampilan/JSX halaman manapun.

**Definition of Done:**
- Semua alur (login, register+OTP, submit laporan+upload foto, riwayat,
  dashboard admin, ubah status/role) berjalan sama persis seperti sebelum
  refactor, hanya lewat backend terpisah.
- Tidak ada satupun perubahan visual yang terlihat user.

---

### Fase 2 — Autentikasi & Otorisasi

**Tujuan:** menutup celah keamanan tanpa mengubah apa yang dilihat user.

**Lakukan:**
- Backend menerbitkan JWT via **httpOnly cookie** saat login berhasil.
- Tambah middleware `authGuard` (verifikasi cookie/JWT) dan
  `roleGuard('ADMIN')` di semua route yang butuh proteksi.
- Semua endpoint yang butuh identitas user (laporan, riwayat) ambil
  `userId` dari token yang tervalidasi di server — **hapus** kepercayaan
  pada `userId` yang dikirim client via body/query.
- Update logic (bukan tampilan) di `admin/layout.tsx`, `Navbar.tsx`,
  `page.tsx` yang saat ini baca `localStorage` → ganti jadi cek sesi lewat
  endpoint backend (mis. `GET /me`) atau via `middleware.ts` Next.js.
  **JSX, className, teks yang tampil harus sama persis** — hanya sumber
  data "apakah user login / role apa" yang berubah cara ambilnya.
- Tambah rate limiting di endpoint login, send-otp, verify-register, reset.
- Tambah validasi upload file (whitelist ekstensi/MIME, batas ukuran).

**Dilarang di fase ini:**
- Mengubah struktur tabel database (Fase 3).
- Redesign halaman login/admin.

**Definition of Done:**
- Memalsukan `localStorage` di browser TIDAK LAGI cukup untuk akses admin
  atau melihat data user lain.
- Semua alur auth (login, register, OTP, reset, logout, proteksi admin)
  tetap terlihat sama seperti sebelumnya bagi user, tapi divalidasi di
  server.

---

### Fase 3 — Perbaikan Data Model & Integrasi NLP Tersimpan

**Tujuan:** kategori/lokasi/tanggal jadi kolom asli, hasil klasifikasi NLP
disimpan sebagai sumber kebenaran tunggal.

**Lakukan:**
- Tambah kolom baru ke model `Laporan`: `kategori`, `lokasi`,
  `tanggalKejadian`, `kategoriPrediksi`, `confidenceScore`. Buat migration
  **baru** (jangan edit migration lama yang sudah ada).
- Buat script backfill untuk data laporan lama (parse dari kolom `isi` yang
  sudah ada, isi ke kolom baru).
- Backend memanggil `nlp-service` saat laporan dibuat (server-side, bukan
  hanya untuk preview di client), simpan hasilnya ke `kategoriPrediksi` +
  `confidenceScore`.
- Update `admin/analytics` agar baca dari kolom baru, bukan regex.

**Dilarang di fase ini:**
- Mengubah tampilan chart/komponen analytics — angka yang ditampilkan boleh
  jadi lebih akurat, tapi layout/visual komponen analytics tidak berubah.
- Menghapus data existing tanpa backfill terlebih dulu.

**Definition of Done:**
- Data laporan lama tetap terbaca benar setelah backfill.
- Analytics tampil identik secara visual, dengan sumber data yang benar.

---

### Fase 4 — NLP Service Production-Ready

**Lakukan:**
- Pisahkan `train.py` jadi CLI job terpisah dari serving API.
- Hapus atau proteksi (auth) endpoint `/train` agar tidak publik.
- Jalankan Flask via `gunicorn`, tambah endpoint `/health`.
- Pin semua versi di `requirements.txt`.

**Definition of Done:**
- `nlp-service` bisa dijalankan sebagai container mandiri.
- `/predict` memberi hasil kategori yang sama seperti sebelumnya.

---

### Fase 5 — Dockerize & CI

**Lakukan:**
- Dockerfile per service (`frontend`, `backend`, `nlp-service`).
- `infra/docker/docker-compose.yml` untuk dev (frontend, backend,
  nlp-service, mysql, mailhog opsional).
- `.dockerignore` per service.
- CI dasar (lint + build) di `.github/workflows`.

**Definition of Done:**
- `docker compose up` dari root menjalankan seluruh sistem dan aplikasi
  berfungsi identik dengan saat dev lokal.

---

### Fase 6 — Audit & Remediasi Keamanan

**Konteks:** Fase 0–5 sudah direview manual oleh user. Sebagian besar hasilnya
baik, tapi ditemukan 2 celah keamanan nyata dan 1 masalah kebersihan data
yang harus diperbaiki sebelum project ini di-push ke git / dianggap selesai.
Fase ini **hanya** memperbaiki 3 temuan spesifik di bawah — jangan
"sekalian" memperbaiki atau mengubah hal lain yang terlihat kurang optimal.

**Lakukan:**
1. **Perbaiki CORS di `apps/backend/src/server.ts`.** Saat ini ada fallback
   `return callback(null, true); // Dev flexible fallback` di baris terakhir
   fungsi origin-check, yang membuat SELURUH allowlist origin di atasnya
   tidak berarti — origin apapun tetap diterima. Ganti agar origin yang
   tidak ada di `allowedOrigins` benar-benar ditolak (`callback(new
   Error('Not allowed by CORS'))` atau `callback(null, false)`). Kalau perlu
   ada mode longgar untuk development, kontrol lewat env var eksplisit
   (mis. `CORS_ALLOW_ALL=true` hanya di `.env` development), jangan
   hardcode fallback `true` di kode.
2. **Perbaiki `JWT_SECRET` hardcoded fallback di
   `apps/backend/src/middlewares/authGuard.ts`** (dan file lain yang
   memakai pola serupa untuk sign/verify JWT, cek juga
   `auth.controller.ts`). Hapus string fallback
   `'suaracilegon-super-secret-jwt-key-2026-safe-and-secure'`. Sebagai
   gantinya, tambahkan validasi saat server start (di `server.ts`, sebelum
   `app.listen`) yang **menghentikan proses** (`process.exit(1)` atau
   `throw`) dengan pesan error yang jelas kalau `process.env.JWT_SECRET`
   tidak diset — jangan biarkan server tetap jalan diam-diam dengan secret
   lemah.
3. **Bersihkan duplikasi foto lama di `apps/frontend/public/uploads/`.**
   Backend (`apps/backend/public/uploads/`) sudah jadi sumber kebenaran
   untuk file upload, dan `next.config.mjs` sudah punya rewrite
   `/uploads/:path*` → backend. Hapus seluruh isi
   `apps/frontend/public/uploads/` (folder lama, hasil pemindahan awal)
   supaya tidak ada dua salinan yang bisa berbeda seiring waktu.
4. **Verifikasi dengan menjalankan, bukan hanya membaca kode.** Jalankan
   `pnpm install`, build setiap app (`frontend`, `backend`), dan jalankan
   `docker compose up` dari root. Laporkan hasil **aktual** dari
   command-command ini (termasuk kalau ada yang gagal) — jangan berasumsi
   "seharusnya berhasil" berdasarkan kode saja.

**Dilarang di fase ini:**
- Mengubah scope apapun di luar 4 poin di atas.
- Mengubah UI/UX.
- Menambah fitur atau "perbaikan" lain yang tidak diminta, sekecil apapun.

**Definition of Done:**
- Bisa dibuktikan (mis. lewat contoh request/fetch dari origin di luar
  allowlist) bahwa CORS sekarang menolak origin yang tidak diizinkan.
- Bisa dibuktikan bahwa server gagal start kalau `JWT_SECRET` tidak ada di
  environment.
- Tidak ada file foto tersisa di `apps/frontend/public/uploads/`.
- `pnpm install`, build tiap app, dan `docker compose up` benar-benar
  dijalankan dan hasilnya (sukses/gagal, termasuk pesan error bila ada)
  dilaporkan apa adanya.

---

### Fase 7 — Rebranding: SuaraCilegon → SIPMAS

**Tujuan:** Ganti nama produk dari "SuaraCilegon" menjadi **SIPMAS**
(singkatan dari **Sistem Pengaduan Masyarakat**), dan hapus penyebutan kota
"Cilegon" secara spesifik supaya cakupan produk terasa lebih luas (bukan
cuma satu kota) — di SELURUH codebase, KECUALI dataset training NLP (lihat
pengecualian di bawah).

**Konteks penting:**
- Pengecualian eksplisit dari larangan "jangan ubah UI/UX" di Bagian 0
  poin 1 — mengganti teks nama produk & menghapus elemen bermerek Cilegon
  MEMANG tujuan fase ini. Yang tetap tidak boleh diubah: layout, warna,
  komponen visual, posisi elemen — hanya teks/gambar bermerek yang diganti.
- **Dataset `apps/nlp-service/dataset/dataset_pengaduan_masyarakat_3000.csv`
  DIKECUALIKAN dari fase ini — JANGAN diedit.** Berisi 1.200+ baris data
  training yang menyebut "Cilegon" di teks keluhan. Ini data training untuk
  klasifikasi kategori (Infrastruktur/Lingkungan/Pelayanan), bukan yang
  tampil ke user, dan nama kota tidak memengaruhi akurasi klasifikasi.
  Mengedit satu-satu berisiko merusak kalimat untuk manfaat kecil. Ini
  keputusan sadar, bukan terlewat — jangan "sekalian" dikerjakan.
- Ada **2 file `docker-compose.yml`** yang isinya nyaris identik (root dan
  `infra/docker/`) — keduanya harus diupdate konsisten.
- Email pengirim OTP pakai `noreply@suaracilegon.go.id` (placeholder, bukan
  domain asli/terkonfigurasi SMTP) → ganti jadi `noreply@sipmas.go.id`,
  tetap placeholder, tidak mengaktifkan domain apapun.
- **Background hero SUDAH diganti user secara manual** — `page.tsx` dan
  `login/page.tsx` sekarang sudah pakai `/HERO_SECTION.jpg` (hasil export
  ilustrasi), bukan `/cilegon.jpg` lagi. Brand mark overlay "SUARA/CILEGON"
  di `login/page.tsx` juga sudah dihapus user. **Jangan sentuh/ganti lagi
  background atau elemen itu** — yang masih tersisa dari hero section
  hanyalah: (1) tagline teks di `page.tsx` ("Cilegon Hebat"), dan (2) file
  lama `apps/frontend/public/cilegon.jpg` yang sudah tidak direferensikan
  di manapun (orphan) — hapus file ini.
- **2 hal ini BUKAN sekadar ganti teks, tapi perubahan logic** (tetap
  dalam scope fase ini karena konsekuensi langsung dari memperluas
  cakupan produk, bukan penambahan fitur baru):
  1. `apps/backend/src/modules/admin/admin.controller.ts` punya array
     `cilegonKecamatanList` (8 kecamatan resmi Cilegon, hardcoded) untuk
     fitur hotspot analytics admin, plus logic pencocokan string
     `"Kecamatan Cilegon"`. Hapus hardcode ini, ganti jadi pengelompokan
     dinamis berdasarkan nilai `lokasi` yang benar-benar ada di data
     laporan (mis. hitung frekuensi tiap nilai `lokasi` unik, tampilkan
     sebagai hotspot) — supaya otomatis bekerja untuk wilayah manapun.
  2. Default fallback lokasi laporan yang sekarang otomatis
     `"Kota Cilegon"` (di `laporan.controller.ts` dan
     `backfill-laporan.ts`) — ganti jadi netral, misalnya
     `"Tidak diketahui"`, bukan nama kota tertentu.

**Lakukan — ganti setiap penyebutan "SuaraCilegon"/"Suara Cilegon" menjadi
"SIPMAS", dan setiap penyebutan kota "Cilegon" (berdiri sendiri) dengan
istilah netral yang sesuai konteks kalimatnya, di file-file berikut (hasil
grep menyeluruh — pakai ini sebagai checklist, jangan asumsikan ada di file
lain tanpa verifikasi):**

Frontend (teks yang tampil ke user):
- `apps/frontend/src/components/Navbar.tsx` — nama brand
- `apps/frontend/src/app/admin/layout.tsx` — nama brand
- `apps/frontend/src/app/admin/page.tsx` — subtitle "...warga Kota Cilegon
  terbaru." → "...masyarakat terbaru."
- `apps/frontend/src/app/admin/reports/page.tsx` — nama file CSV export,
  header & footer teks hasil cetak
- `apps/frontend/src/app/user/panduan/page.tsx` (2 kemunculan)
- `apps/frontend/src/app/user/statistik/page.tsx` — judul "Statistik
  Pengaduan Kota Cilegon" dan subtitle "...warga Cilegon"
- `apps/frontend/src/app/page.tsx` — HANYA tagline teks "Lapor Cepat,
  Cilegon Hebat." → tagline netral (contoh: "Lapor Cepat, Wujudkan
  Perubahan.", boleh disesuaikan asal mempertahankan pola/style tulisan
  yang sama). Background hero JANGAN disentuh, sudah diganti user.
- `apps/frontend/src/app/login/page.tsx` — **SUDAH SELESAI, jangan
  sentuh.** Background dan brand mark sudah diganti/dihapus user sendiri;
  tidak ada lagi penyebutan Cilegon di file ini.
- `apps/frontend/src/app/layout.tsx` — metadata `title`, jadi
  "SIPMAS - Portal Pengaduan" atau serupa
- `apps/frontend/public/cilegon.jpg` — file lama ini sudah TIDAK
  direferensikan di manapun (orphan, sisa sebelum user ganti background
  sendiri) — hapus file ini

Backend:
- `apps/backend/src/modules/monitoring/monitoring.controller.ts`
  (3 kemunculan, halaman monitoring internal)
- `apps/backend/src/modules/auth/auth.controller.ts` — nama pengirim email
  OTP + domain (2 kemunculan, lihat catatan domain di atas)
- `apps/backend/src/modules/admin/admin.controller.ts` — lihat perubahan
  logic hotspot di atas
- `apps/backend/src/modules/laporan/laporan.controller.ts` — default
  lokasi fallback
- `apps/backend/scripts/backfill-laporan.ts` — default lokasi fallback
- `apps/backend/.env` dan `.env.example` — nilai `TRAIN_API_KEY` dan
  `JWT_SECRET` yang masih mengandung kata "cilegon" (ganti nilainya, boleh
  string placeholder baru apapun asal tidak mengandung "cilegon")
- `apps/backend/Dockerfile` — komentar

NLP service:
- `apps/nlp-service/app/model/train.py` — deskripsi CLI
- `apps/nlp-service/app/main.py` — nama service, default `TRAIN_API_KEY`
- `apps/nlp-service/app.py` — docstring
- `apps/nlp-service/Dockerfile` — komentar
- `apps/nlp-service/requirements.txt` — komentar
- `apps/nlp-service/dataset/dataset_pengaduan_masyarakat_3000.csv` —
  **JANGAN DIUBAH**, lihat pengecualian di atas

Dokumentasi & infra:
- `README.md` — judul DAN kalimat deskripsi ("...untuk warga Kota
  Cilegon..." → "...untuk masyarakat umum...")
- `AGENTS.md` (file ini sendiri) — judul di baris 1 dan penyebutan nama
  produk di Bagian 1
- `docker-compose.yml` (root) — container_name, network name, volume name,
  nilai `JWT_SECRET`/`TRAIN_API_KEY`
- `infra/docker/docker-compose.yml` — sama
- `infra/docker/docker-compose.prod.yml` — sama
- `.github/workflows/ci.yml` — nama workflow & image tag

**Dilarang di fase ini:**
- Mengubah layout, styling, warna, atau komponen visual apapun — hanya
  teks/nama/gambar terkait brand & kota yang diganti.
- Mengedit `dataset_pengaduan_masyarakat_3000.csv` — dikecualikan (lihat
  konteks di atas).
- Mengubah nama teknis yang tidak berhubungan dengan brand: nama database
  (`db_pengaduan`), nama field di `package.json` (`frontend`, `backend`,
  `pengaduan-masyarakat-monorepo`), struktur folder `apps/`.
- Menambahkan logo/favicon baru — itu permintaan terpisah.
- Setup domain email asli — cukup ganti teks placeholder-nya saja.

**Setelah selesai:**
1. Jalankan `grep -rio "cilegon" .` dari root project (exclude
   `node_modules`, `.venv`, `dist`, `.next`, `.turbo`, DAN exclude folder
   `apps/nlp-service/dataset/`) dan pastikan hasilnya kosong. (Sengaja
   pakai "cilegon" saja, bukan "suaracilegon" — supaya penyebutan kota
   yang berdiri sendiri, seperti "Kota Cilegon" atau nama file
   `cilegon.jpg`, ikut ketangkap.)
2. Build ulang frontend & backend, pastikan tidak ada error.
3. Laporkan daftar file yang diubah, dan jelaskan singkat perubahan logic
   di `admin.controller.ts` (hotspot dinamis).
4. Update status Fase 7 di `AGENTS.md` menjadi "MENUNGGU REVIEW".
5. Berhenti dan tunggu review saya.

**Definition of Done:**
- `grep -rio "cilegon"` di seluruh project (dengan exclude di atas,
  termasuk folder dataset) hasilnya nihil.
- Hotspot analytics admin tidak lagi terbatas ke 8 kecamatan Cilegon —
  bekerja dinamis dari data `lokasi` yang ada.
- Tidak ada perubahan visual/layout di luar teks nama produk & penghapusan
  elemen bermerek Cilegon (foto, tagline).
- Build frontend & backend tetap sukses.
- Dataset training NLP tidak tersentuh sama sekali.

---

### Fase 8 — Database Baru db_sipmas (Additif, db_pengaduan Tidak Disentuh)

**Tujuan:** Buat database MySQL **BARU** bernama `db_sipmas` — database
terpisah yang berdampingan dengan `db_pengaduan` di server/instance MySQL
yang sama yang sekarang jalan di laptop user. `db_pengaduan` **TIDAK
disentuh sama sekali** (bukan di-rename, bukan dihapus, bukan diubah
strukturnya) — tetap ada persis seperti sekarang setelah fase ini selesai.
Setelah `db_sipmas` ada dan skemanya terbentuk, yang dialihkan hanyalah ke
mana APLIKASI connect (`DATABASE_URL`), bukan database `db_pengaduan` itu
sendiri. `db_sipmas` mulai dari kosong, tidak ada migrasi data.

**Konteks penting:**
- Ini operasi **murni ADDITIF**: `db_sipmas` adalah database baru yang
  dibuat dari nol, bukan hasil rename `db_pengaduan`. Setelah fase ini,
  harus ada DUA database di server MySQL yang sama: `db_pengaduan` (utuh,
  tidak berubah) dan `db_sipmas` (baru, kosong, dipakai aplikasi).
- `db_sipmas` HARUS dibuat lewat perintah SQL eksplisit
  `CREATE DATABASE db_sipmas;` (via MySQL client atau `docker exec` ke
  container MySQL yang sedang jalan) — **BUKAN** dengan mengubah env var
  `MYSQL_DATABASE` di `docker-compose.yml`. Alasan: env var itu cuma
  dieksekusi MySQL sekali saat volume container masih benar-benar kosong
  (first init); karena volume sekarang sudah berisi `db_pengaduan`,
  mengubahnya TIDAK akan membuat `db_sipmas`, dan berisiko membuat
  konfigurasi tidak sinkron dengan kenyataan. Karena alasan ini juga,
  `docker-compose.yml` (dev, root) **TIDAK PERLU dan TIDAK BOLEH diubah
  sama sekali** di fase ini — termasuk `MYSQL_DATABASE`-nya, biarkan tetap
  menunjuk/menyebut `db_pengaduan` seperti sekarang.
  > **[DIREVISI di Fase 14]** Larangan mengubah `MYSQL_DATABASE` ini
  > dicabut. Nilainya aman dan lebih baik diganti ke `db_sipmas` (lihat
  > Fase 14). Larangan menyentuh database `db_pengaduan` tetap berlaku.
- Karena mulai dari kosong, script `apps/backend/scripts/backfill-laporan.ts`
  (hasil Fase 3) **TIDAK PERLU** dijalankan di `db_sipmas`.
- **PENTING — `db_pengaduan` BUKAN cadangan/backup project ini.** User akan
  memakai `db_pengaduan` untuk **project lain yang terpisah sama sekali**.
  Ini bukan alasan administratif ringan ("siapa tahu nanti perlu data
  lama") — ini database aktif milik project lain. Larangan "jangan sentuh
  `db_pengaduan`" di seluruh `AGENTS.md` (Fase 8 dan seterusnya) berlaku
  dengan alasan ini, bukan karena jadi cadangan SIPMAS.

**Lakukan:**
1. Jalankan `CREATE DATABASE db_sipmas;` terhadap server MySQL yang sama
   yang sekarang dipakai (via `docker exec` ke container MySQL dev yang
   sedang jalan, atau client MySQL biasa). Jangan sentuh `db_pengaduan`
   dengan cara apapun di langkah ini.
2. Update `.env` dan `.env.example` (root, dan `apps/backend/`): ganti
   segmen nama database di `DATABASE_URL` dari `db_pengaduan` ke
   `db_sipmas` — host/port/user/password TIDAK berubah. Ini mengubah ke
   mana APLIKASI connect, bukan mengubah database `db_pengaduan`.
3. `docker-compose.yml` (root, dev) — **JANGAN diubah sama sekali**
   (lihat alasan di Konteks Penting).
4. `infra/docker/docker-compose.prod.yml` — environment ini deployment
   terpisah (bukan laptop user, tidak ada `db_pengaduan` di situ), jadi
   boleh set `MYSQL_DATABASE: db_sipmas` langsung di compose-nya (aman,
   karena container prod belum punya data apapun), dan ganti segmen nama
   database di string `DATABASE_URL` construct pada service `backend`
   jadi `db_sipmas`.
5. Ganti command startup backend di `docker-compose.prod.yml` dari
   `npx prisma db push --skip-generate && node dist/server.js` menjadi
   `npx prisma migrate deploy && node dist/server.js`.
6. Jalankan `npx prisma migrate deploy` terhadap `db_sipmas` (lokal), lalu
   verifikasi (`npx prisma studio` atau query sederhana) semua tabel &
   kolom sudah terbentuk sesuai `schema.prisma` saat ini — termasuk kolom
   hasil Fase 3 (`kategori`, `lokasi`, `tanggalKejadian`,
   `kategoriPrediksi`, `confidenceScore`).
7. Jalankan smoke test alur utama (register, login, submit laporan),
   pastikan data masuk ke `db_sipmas`. Lalu verifikasi terpisah: cek
   `db_pengaduan` masih ada dan isinya sama persis seperti sebelum fase
   ini (mis. jumlah baris tabel `User` dan `Laporan` sebelum vs sesudah).

**Dilarang di fase ini:**
- Menyentuh `db_pengaduan` dengan cara apapun — tidak rename, tidak drop,
  tidak alter struktur, tidak tulis data baru ke situ.
- Mengubah `docker-compose.yml` (dev, root) dengan cara apapun.
  *(Khusus baris `MYSQL_DATABASE`, larangan ini dicabut di Fase 14.)*
- Membuat `db_sipmas` lewat env var `MYSQL_DATABASE` di compose dev — harus
  lewat `CREATE DATABASE` eksplisit.
- Memindahkan/mengekspor data dari `db_pengaduan` ke `db_sipmas`.
- Mengubah `schema.prisma`.

**Setelah selesai:**
1. Laporkan output aktual `CREATE DATABASE db_sipmas;` dan
   `npx prisma migrate deploy` (bukan asumsi).
2. Laporkan hasil smoke test dan konfirmasi datanya masuk ke `db_sipmas`.
3. **Buktikan `db_pengaduan` masih utuh** — tunjukkan jumlah baris di
   tabel-tabel utamanya (`User`, `Laporan`) sama persis dengan sebelum
   fase ini dikerjakan.
4. Update status Fase 8 di `AGENTS.md` menjadi "MENUNGGU REVIEW".
5. Berhenti dan tunggu review saya.

**Definition of Done:**
- `db_sipmas` ada sebagai database terpisah, skemanya lengkap sesuai
  `schema.prisma`, isinya kosong.
- `db_pengaduan` 100% tidak berubah — sama nama, sama isi, sama struktur
  seperti sebelum fase ini, dan `docker-compose.yml` (dev) tidak ada
  perubahan sama sekali.
- Aplikasi (dev) connect ke `db_sipmas` lewat `.env`, bukan lagi ke
  `db_pengaduan` — tapi `db_pengaduan` tetap ada di server, sekadar sudah
  tidak dipakai aplikasi.
- Aplikasi (register/login/submit laporan) berfungsi normal terhadap
  `db_sipmas`.

---

### Fase 9 — Hardening Pasca-Refactor

**Tujuan:** Menutup celah operasional yang ditemukan setelah refactor
utama (Fase 0–8) selesai. Fase ini lebih besar dari fase sebelumnya dan
berisi **6 sub-bagian independen** (9.1–9.6) — kerjakan berurutan, dan
**laporkan hasil tiap sub-bagian sebelum lanjut ke sub-bagian berikutnya**
(laporan singkat per sub-bagian, bukan harus berhenti total, tapi jangan
diam-diam lompat-lompat). Kalau satu sub-bagian ternyata jauh lebih besar/
berisiko dari perkiraan, BERHENTI di situ, laporkan sejauh apa progressnya,
jangan dipaksakan sampai setengah jadi yang malah merusak fitur yang sudah
jalan.

**Konteks penting (berlaku untuk semua sub-bagian):**
- Target database untuk semua perubahan skema/data adalah `db_sipmas`
  (database aktif sekarang). **JANGAN sentuh `db_pengaduan` dengan cara
  apapun**, termasuk untuk sub-bagian backup — backup yang dimaksud di
  9.4 adalah backup `db_sipmas`, bukan `db_pengaduan`.
- Sub-bagian yang butuh akun/kredensial layanan eksternal (Sentry di 9.5)
  bersifat OPSIONAL dan dikondisikan pada env var tersedia — jangan
  memaksa setup kalau user belum punya akunnya, cukup buat kodenya siap
  pakai begitu env var diisi nanti.

---

**9.1 — Admin Bootstrap (Seed Script)**

Buat `apps/backend/prisma/seed.ts`: baca env `ADMIN_EMAIL`,
`ADMIN_PASSWORD`, `ADMIN_NIK`, `ADMIN_NAMA` (tambahkan placeholder-nya ke
`.env.example`). Kalau belum ada user dengan `role: ADMIN` di database,
buat satu — password di-hash pakai `bcrypt` (pola yang sama dengan
`auth.controller.ts`), `isVerified: true`. Kalau admin sudah ada, skip
(idempotent, aman dijalankan berkali-kali). Daftarkan di `package.json`
backend (`"prisma": { "seed": "..." }`) supaya bisa dijalankan dengan
`npx prisma db seed`. Tambahkan instruksi singkat di `README.md` cara
pakainya.

**9.2 — Automated Test Dasar (Backend)**

Setup Jest + ts-jest (+ supertest kalau perlu test level HTTP) di
`apps/backend`. Tulis smoke/unit test untuk bagian yang **paling kritis
secara keamanan** saja (ini riwayatnya pernah jadi sumber bug nyata di
Fase 6, jadi prioritas di sini):
- `authGuard` — request tanpa token ditolak, token invalid ditolak, token
  valid lanjut ke `next()`.
- `roleGuard('ADMIN')` — role bukan admin ditolak (403), admin lanjut.
- Logic origin-check CORS di `server.ts` — origin di luar allowlist
  ditolak, origin yang diizinkan diterima.
Tambahkan script `"test": "jest"` di `package.json`, tambahkan step
`npm test` di `.github/workflows/ci.yml` setelah build. **Jangan coba
kejar coverage tinggi atau test semua controller** — itu di luar scope
realistis fase ini, cukup 3 area di atas.

**9.3 — Catatan Tabel `RefreshToken` (dokumentasi saja, tanpa aksi)**

Tidak ada perubahan kode. Tambahkan satu catatan singkat di `README.md`
(bagian catatan/known issues) bahwa tabel `RefreshToken` ada di
`db_pengaduan` (database lama) sebagai sisa eksperimen, tidak terdaftar di
`schema.prisma`, tidak dipakai kode manapun, dan **sengaja tidak
disentuh**. Tidak ada tindakan lain di sub-bagian ini.

**9.4 — Backup Strategy untuk `db_sipmas`**

Buat `infra/scripts/backup-db.sh`: jalankan `mysqldump` terhadap
`db_sipmas` (pakai `DATABASE_URL`/env yang sudah ada, jangan hardcode
kredensial), output ke file `.sql` dengan timestamp di folder
`backups/` (tambahkan `backups/` ke `.gitignore`, jangan sampai file
backup ter-commit). Dokumentasikan di `README.md` cara menjalankannya
manual, dan beri catatan singkat bahwa menjadwalkannya (cron/fitur backup
hosting) adalah keputusan operasional user sendiri — jangan coba setup
cron job otomatis di sini.

**9.5 — Structured Logging (+ Sentry Opsional)**

Ganti `console.log`/`console.error` HANYA di error handler global
(`server.ts`) dan event otentikasi penting (login gagal, JWT invalid) jadi
logger terstruktur ringan (mis. `pino`) — jangan rewrite semua
`console.log` di seluruh codebase, itu di luar scope. Tambahkan integrasi
Sentry yang **dikondisikan** pada env var `SENTRY_DSN`: kalau env var itu
tidak ada/kosong, aplikasi tetap jalan normal tanpa Sentry (skip diam-diam,
bukan error). Dokumentasikan di `.env.example` sebagai opsional.

**9.6 — Object Storage untuk Upload Foto (PRIORITAS PALING RENDAH)**

Kerjakan ini TERAKHIR, dan hanya kalau 9.1–9.5 sudah beres. Tambahkan
service MinIO (S3-compatible, self-hosted — tidak butuh akun cloud) ke
`docker-compose.yml` (dev) dan `docker-compose.prod.yml`. Update
`laporan.controller.ts`/`uploadValidator.ts` supaya file foto laporan
diupload ke bucket MinIO, bukan disk lokal. **Upload lokal yang sudah ada
dan berjalan sekarang HARUS tetap berfungsi** kalau sub-bagian ini tidak
sempat selesai — jangan sampai setengah-jadi malah merusak fitur upload
yang sudah ada. Kalau terlalu kompleks untuk diselesaikan dalam satu
sesi ini, STOP, laporkan progressnya, dan biarkan upload lokal tetap jadi
mekanisme yang aktif.

---

**Dilarang di fase ini (berlaku semua sub-bagian):**
- Menyentuh `db_pengaduan` dengan cara apapun.
- Memaksa setup layanan eksternal (Sentry) tanpa kredensial yang user
  sediakan sendiri.
- Mengubah layout/styling/UI — ini murni pekerjaan backend/infra.
- Merusak fitur upload foto yang sudah berjalan (lihat 9.6).

**Setelah selesai (seluruh 9.1–9.6, atau sejauh yang berhasil diselesaikan):**
1. Laporkan status tiap sub-bagian (selesai / sebagian / dilewati) beserta
   alasannya kalau ada yang tidak selesai.
2. Laporkan output aktual test (`npm test`) — bukan asumsi lulus.
3. Konfirmasi fitur upload foto tetap berfungsi normal (terlepas dari
   status 9.6).
4. Update status Fase 9 di `AGENTS.md` menjadi "MENUNGGU REVIEW".
5. Berhenti dan tunggu review saya.

**Definition of Done:**
- 9.1–9.5 selesai penuh. 9.6 boleh sebagian/ditunda asal tidak merusak
  upload yang sudah ada dan progressnya dilaporkan jujur.
- `db_pengaduan` tidak tersentuh sama sekali.
- `npm test` di backend jalan dan lulus.
- Aplikasi (register/login/submit laporan/admin) tetap berfungsi normal.

---

### Fase 10 — Perbaikan Kecil: DATABASE_URL Compose Dev + ADMIN_PASSWORD Fail-Fast

**Tujuan:** Dua perbaikan kecil dan independen yang ketemu saat review
Fase 8 & 9. Keduanya cepat, tapi penting — satu soal fungsi (database
masih salah tersambung), satu soal keamanan (password admin predictable).

**Konteks penting:**
- **Bug #1 ini kesalahan scoping di Fase 8, bukan kesalahan eksekusi
  agent sebelumnya.** Dulu `docker-compose.yml` (dev) sengaja dilarang
  diubah sama sekali untuk melindungi `db_pengaduan` dari tersentuh — tapi
  larangan itu salah sasaran: baris `DATABASE_URL` di service `backend`
  cuma menentukan ke mana APLIKASI connect, sama sekali tidak menyentuh
  database `db_pengaduan` itu sendiri. Jadi larangan "jangan sentuh
  `db_pengaduan`" tetap berlaku untuk database-nya, TAPI baris config ini
  memang harus diperbaiki.
- `docker-compose.yml` ini tidak pakai `env_file`, jadi env var yang
  di-hardcode di blok `environment:` SELALU menang dibanding apapun yang
  ada di `.env` — ini kenapa bug #1 penting: kalau tidak diperbaiki di
  compose langsung, project masih connect ke `db_pengaduan` setiap kali
  dijalankan lewat `docker-compose up`, terlepas dari apa isi `.env`.

**Lakukan:**
1. **Bug #1 — `docker-compose.yml` (root, dev):** ganti baris
   `DATABASE_URL: "mysql://root:@mysql:3306/db_pengaduan"` di service
   `backend` menjadi `.../db_sipmas`. Baris `MYSQL_DATABASE: db_pengaduan`
   di service `mysql` **TIDAK perlu diubah** (itu cuma dieksekusi MySQL
   saat volume kosong/first init, sudah tidak relevan lagi, dan
   mengubahnya tidak menyentuh database apapun — boleh dibiarkan apa
   adanya sebagai catatan historis).
   > **[DIREVISI di Fase 14]** Ternyata lebih baik diganti ke `db_sipmas`:
   > kalau volume suatu hari dihapus, yang terbuat otomatis harus
   > `db_sipmas`, bukan database milik project lain. Aman diganti karena
   > nilainya diabaikan MySQL selama volume masih terisi.
2. **Bug #2 — `apps/backend/prisma/seed.ts`:** hapus fallback hardcoded
   untuk `ADMIN_PASSWORD` (pola yang sama persis dengan bug `JWT_SECRET`
   yang diperbaiki di Fase 6). Kalau `process.env.ADMIN_PASSWORD` (atau
   `ADMIN_EMAIL`/`ADMIN_NIK`/`ADMIN_NAMA`) tidak diset, script HARUS
   berhenti dengan pesan error yang jelas (`process.exit(1)` atau
   `throw`), bukan diam-diam membuat admin dengan password default yang
   sama untuk semua orang yang clone repo ini.

**Dilarang di fase ini:**
- Menyentuh `db_pengaduan` dengan cara apapun.
- Mengubah hal lain di luar 2 bug spesifik ini.
- Mengubah `MYSQL_DATABASE` di service `mysql` pada `docker-compose.yml`.
  *(Larangan ini dicabut di Fase 14.)*

**Setelah selesai:**
1. Tunjukkan baris `DATABASE_URL` yang sudah benar di
   `docker-compose.yml`.
2. Jalankan `docker-compose up` (atau restart service `backend`-nya saja)
   dan buktikan backend benar-benar connect ke `db_sipmas` sekarang (mis.
   lewat log koneksi Prisma atau query sederhana).
3. Buktikan `npx prisma db seed` sekarang gagal dengan pesan jelas kalau
   `ADMIN_PASSWORD` tidak diset, dan berhasil normal kalau diset.
4. Update status Fase 10 di `AGENTS.md` menjadi "MENUNGGU REVIEW".
5. Berhenti dan tunggu review saya.

**Definition of Done:**
- Backend yang dijalankan lewat `docker-compose up` (dev) benar-benar
  connect ke `db_sipmas`, terbukti bukan cuma diasumsikan.
- `db_pengaduan` tidak tersentuh sama sekali.
- `seed.ts` gagal jelas tanpa `ADMIN_PASSWORD` di env, tidak ada fallback
  password hardcoded tersisa di kode.

---

### Fase 11 — Nonaktifkan MinIO (Image Docker Tidak Lagi Tersedia)

**Tujuan:** Nonaktifkan service MinIO yang ditambahkan di Fase 9 (9.6),
karena `minio/minio` sudah tidak tersedia lagi di Docker Hub — MinIO Inc.
berhenti mempublikasikan image Docker sejak Oktober 2025 dan mengarsipkan
proyek open-source-nya. Kembalikan ke penyimpanan lokal, yang sudah jadi
fallback otomatis `storageService.ts` sejak Fase 9.

**Konteks penting:**
- **Ini bukan bug di kode kita** — MinIO Inc. sendiri yang menghentikan
  distribusi image Docker mereka. `storageService.ts` sudah didesain sejak
  Fase 9 untuk otomatis fallback ke disk lokal kalau env var S3 tidak
  diset, jadi perbaikan ini murni di level infrastruktur Docker — **tidak
  perlu mengubah kode aplikasi sama sekali**.
- MinIO ditambahkan di **3 file compose**: `docker-compose.yml` (root,
  dev), `infra/docker/docker-compose.yml` (duplikat dev), dan
  `infra/docker/docker-compose.prod.yml`. Ketiganya perlu diperbaiki
  konsisten.
- `.env.example` untuk `S3_ENDPOINT`/`S3_ACCESS_KEY`/`S3_SECRET_KEY`
  sudah default kosong (`""`) — ini sudah benar, tidak perlu diubah.
- Kalau nanti ingin object storage self-hosted lagi, pertimbangkan
  **Garage** atau **SeaweedFS** (masih aktif dipelihara) — tapi itu di
  luar scope fase ini, jangan dikerjakan sekarang.

**Lakukan:**
1. Di `docker-compose.yml` (root, dev), `infra/docker/docker-compose.yml`,
   dan `infra/docker/docker-compose.prod.yml`: hapus atau comment-out
   seluruh service `minio`/`minio` (prod: `sipmas-prod-minio`), termasuk
   entry volume-nya (`minio_data`/`prod_minio_data`) di top-level
   `volumes:`, dan `depends_on: minio` di service `backend` kalau ada.
2. Di ketiga file yang sama, pastikan `S3_ENDPOINT`, `S3_ACCESS_KEY`,
   `S3_SECRET_KEY` di blok `environment:` service `backend` TIDAK diset
   sebagai nilai aktif (hapus baris-barisnya, atau beri komentar jelas
   "MinIO dinonaktifkan sementara — lihat AGENTS.md Fase 11").

**Dilarang di fase ini:**
- Mengubah `storageService.ts` atau `laporan.controller.ts` — sudah benar
  apa adanya, fallback terjadi otomatis begitu env var S3 kosong.
- Mencari image MinIO alternatif dari registry lain (quay.io, dll) sebagai
  pengganti — itu cuma dapat image versi lama yang beku, tidak akan dapat
  update keamanan lagi, bukan solusi jangka panjang yang baik.
- Menghapus kode `storageService.ts` sepenuhnya — biarkan tetap ada
  (dormant) untuk dipakai lagi nanti kalau pindah ke object storage lain
  yang S3-compatible.

**Setelah selesai:**
1. Tunjukkan ketiga file compose yang sudah tidak punya service `minio`
   aktif lagi.
2. Buktikan `docker compose up -d` jalan sukses tanpa error pull image
   apapun.
3. Konfirmasi upload foto laporan tetap berfungsi normal (tersimpan di
   disk lokal).
4. Update status Fase 11 di `AGENTS.md` menjadi "MENUNGGU REVIEW".
5. Berhenti dan tunggu review saya.

**Definition of Done:**
- `docker compose up -d` sukses tanpa error pull image apapun.
- Upload foto laporan tetap berfungsi normal lewat disk lokal.
- Tidak ada perubahan di `storageService.ts`/`laporan.controller.ts`.

---

### Fase 12 — Perbaikan Referensi Basi + Audit Final `db_pengaduan`

**Tujuan:** Perbaiki 2 referensi basi ke `db_pengaduan` yang masih
menyesatkan (bukan koneksi aktif — itu sudah benar ke `db_sipmas` sejak
Fase 8/10 — tapi dokumentasi & tampilan yang ketinggalan), **DAN**
lakukan audit final supaya tidak ada lagi kejutan referensi basi lain.
Fase ini dirancang jadi penutup — setelah ini, tidak ada lagi perbaikan
terkait `db_pengaduan` yang perlu dikerjakan.

**Konteks penting — hasil audit menyeluruh (per hari ini), 2 kategori:**

**Kategori A — HARUS DIPERBAIKI (referensi basi/salah):**
1. `README.md` baris ~39, ~54, ~121 — bagian "Setup Database" masih
   menyuruh `CREATE DATABASE db_pengaduan;` dan contoh
   `DATABASE_URL="mysql://root:@127.0.0.1:3306/db_pengaduan"`. Ini
   instruksi onboarding developer baru — kalau diikuti apa adanya, orang
   akan setup database yang salah.
2. `apps/backend/src/modules/monitoring/monitoring.controller.ts` — label
   "Database Target" di dashboard monitoring internal berisi STRING TETAP
   `db_pengaduan`, padahal baris persis di atasnya (`Latensi Query`) sudah
   dinamis (`${health.database.latencyMs}`). Perbaiki supaya **dinamis**
   juga (ambil dari nama database yang benar-benar aktif dipakai
   `DATABASE_URL`/koneksi Prisma saat itu) — JANGAN cuma diganti jadi
   string tetap `"db_sipmas"`, karena itu cuma mindahkan masalah yang
   sama ke masa depan kalau database pindah lagi nanti.

**Kategori B — SUDAH DICEK, SENGAJA DIBIARKAN (jangan diubah):**
1. `docker-compose.yml` (root) & `infra/docker/docker-compose.yml`, baris
   `MYSQL_DATABASE: db_pengaduan` — inert, cuma riwayat first-init MySQL,
   sudah dibahas panjang di Fase 10. Biarkan.
   > **[DIREVISI di Fase 14]** Butir ini tidak berlaku lagi: setelah
   > Fase 14 kedua baris itu menjadi `db_sipmas`, sehingga kedua file
   > compose tidak lagi menyebut `db_pengaduan` sama sekali. Daftar
   > Kategori B yang masih sah: butir 2 sampai 5.
2. `infra/scripts/backup-db.sh` — komentar yang menyebut `db_pengaduan`
   sebagai penegasan bahwa script ini TIDAK menyentuhnya. Biarkan.
3. `README.md` bagian **"Catatan Basis Data (`db_sipmas` & `db_pengaduan`)"**
   (termasuk catatan `RefreshToken` legacy) — dokumentasi yang memang
   sengaja dibuat di Fase 9 untuk menjelaskan ada 2 database. Biarkan.
4. `AGENTS.md` (file ini sendiri) — seluruh riwayat Fase 8–12 yang
   menyebut `db_pengaduan` adalah dokumentasi proses, bukan konfigurasi
   aplikasi. Biarkan apa adanya, jangan di-edit untuk "menghapus jejak".
5. Database `db_pengaduan` itu sendiri di MySQL laptop user — **tetap
   harus ada, utuh, tidak dihapus**, karena akan dipakai untuk **project
   lain yang terpisah sama sekali dari SIPMAS** (bukan cadangan/backup
   project ini). "Tidak ada lagi `db_pengaduan`" di judul fase ini
   artinya tidak ada lagi *referensi basi yang salah/menyesatkan* di
   project SIPMAS, BUKAN menghapus database milik project lain itu.

**Lakukan:**
1. Perbaiki 2 item di Kategori A seperti dijelaskan di atas.
2. Jalankan audit final: `grep -rni "db_pengaduan" .` dari root project
   (exclude `node_modules`, `.venv`, `.next`, `.turbo`, `dist`, `.git`,
   `dataset`). Cocokkan setiap hasil terhadap daftar Kategori B di atas —
   kalau ada hasil yang TIDAK masuk daftar Kategori B manapun, itu
   referensi basi lain yang terlewat; perbaiki juga (tetap dalam semangat
   fase ini: ganti ke `db_sipmas` kalau itu memang seharusnya menunjuk ke
   database aktif, atau laporkan ke saya dulu kalau tidak yakin itu harus
   diapakan).

**Dilarang di fase ini:**
- Menghapus/drop database `db_pengaduan` dengan cara apapun.
- Mengedit riwayat Fase 0–11 di `AGENTS.md` untuk "membersihkan" sebutan
  `db_pengaduan` — itu dokumentasi proses, bukan bug.
- Mengubah `MYSQL_DATABASE` di `docker-compose.yml`/`infra/docker/docker-compose.yml`.
  *(Larangan ini dicabut di Fase 14.)*

**Setelah selesai:**
1. Tunjukkan isi `README.md` bagian Setup Database yang sudah benar.
2. Tunjukkan kode `monitoring.controller.ts` yang sekarang dinamis,
   bukan hardcoded, dan screenshot/laporan hasil dashboard menampilkan
   `db_sipmas` secara nyata (bukan cuma dari kode).
3. Tempelkan HASIL LENGKAP `grep -rni "db_pengaduan" .` final beserta
   penjelasan tiap baris masuk Kategori B yang mana — supaya jadi bukti
   audit tuntas, bukan klaim kosong.
4. Update status Fase 12 di `AGENTS.md` menjadi "MENUNGGU REVIEW".
5. Berhenti dan tunggu review saya.

**Definition of Done:**
- README setup instructions mengarahkan ke `db_sipmas`, bukan
  `db_pengaduan`.
- Label "Database Target" di dashboard monitoring dinamis, menampilkan
  nama database yang benar-benar aktif.
- Audit `grep -rni "db_pengaduan"` final sudah dijalankan dan SETIAP hasil
  (kalau ada) sudah dicocokkan secara eksplisit ke Kategori B, tidak ada
  yang tersisa tanpa penjelasan.
- `db_pengaduan` (database-nya) tetap ada, utuh, tidak dihapus.

### Fase 13 — Tampilan Mobile Responsive (Desktop Tetap Identik)

**Tujuan:** Membuat seluruh halaman nyaman dipakai di HP (lebar 360px ke
atas) tanpa mengubah tampilan desktop sedikitpun. Sebelumnya UI hanya
dirancang untuk desktop.

**Pengecualian eksplisit dari larangan ubah UI/UX di Bagian 0 poin 1:**
fase ini MEMANG mengubah layout untuk layar kecil. Tapi aturannya ketat:
**tampilan desktop tidak boleh berubah**. Gunakan pendekatan *additive*:
nilai desktop yang sekarang dipertahankan lewat prefix breakpoint
(`md:` / `lg:`), dan nilai mobile menjadi default tanpa prefix. Contoh:
`p-10` menjadi `p-4 md:p-10` (desktop tetap `p-10`). Warna, font, logo,
copy teks, dan alur halaman TIDAK diubah.

**Hasil analisis kondisi saat ini (dari kode, bukan tebakan):**
- Grid dan tabel sebagian sudah responsif (`sm:grid-cols-2`,
  `overflow-x-auto` di semua tabel) — **jangan dirombak**, cukup dicek.
- **Penghalang utama #1 — `apps/frontend/src/app/admin/layout.tsx`:**
  sidebar `w-[260px] fixed` selalu tampil, konten `pl-[260px]`, topbar
  `px-10`, main `p-10`. Di HP konten tersisa sekitar 115px.
- **Penghalang utama #2 — `apps/frontend/src/components/Navbar.tsx`:**
  menu tengah `hidden md:flex` tanpa alternatif mobile, jadi Riwayat,
  Statistik, Panduan tidak bisa diakses dari HP. Blok kanan (Panel Admin
  + "Halo, nama" + Keluar) dengan `px-8` juga akan meluap.
- Judul `text-4xl`/`text-5xl`/`text-6xl` dan padding `p-10`/`px-8`/`px-10`
  tanpa varian mobile tersebar di hampir semua halaman.
- `h-screen` dipakai di hero `page.tsx`, `login`, `lupa-sandi`,
  `riwayat`, `statistik`, `panduan`.
- Input memakai `text-sm` (14px): di iOS Safari input di bawah 16px
  memicu auto-zoom saat difokus.
- `login/page.tsx` sudah menyembunyikan panel gambar kiri di mobile
  (`hidden md:flex`) — itu sudah benar, jangan diubah.

**Keputusan desain (sudah ditetapkan, jangan diubah tanpa tanya):**
- Breakpoint navbar user: hamburger di bawah `md` (768px).
- Breakpoint admin: sidebar berubah jadi drawer di bawah `lg` (1024px);
  di `lg` ke atas sidebar tetap persis seperti sekarang.
- Tanpa library baru. Pakai Tailwind + ikon `lucide-react` yang sudah
  terpasang (mis. `Menu`, `X`).

**Pecah jadi sub-bagian, kerjakan berurutan, laporkan tiap selesai:**

**13.1 — Fondasi**
- Pastikan viewport meta benar (Next 14 App Router menyediakan default
  `width=device-width, initial-scale=1`; cukup verifikasi, atau tambahkan
  export `viewport` eksplisit di `layout.tsx` tanpa mengubah hal lain).
- `globals.css`: tambahkan aturan mobile-only supaya input/select/textarea
  berukuran 16px di layar kecil (mencegah auto-zoom iOS), dan pastikan
  tidak ada scroll horizontal di level halaman. Hanya berlaku di bawah
  `sm`/`md`, desktop tidak berubah.
- Ganti `h-screen` dengan `min-h-screen` (atau `min-h-[100svh]`) di bagian
  yang kontennya bisa lebih tinggi dari layar (hero, login, lupa-sandi,
  dll). Di desktop hasil visualnya harus sama.

**13.2 — Navbar (user)**
- Tambahkan tombol hamburger (hanya tampil di bawah `md`) yang membuka
  panel menu: tautan Beranda/Riwayat/Statistik/Panduan, tombol Panel Admin
  (jika ADMIN), nama user, dan Keluar/Masuk. Tutup otomatis saat pindah
  halaman atau saat tautan diklik.
- Di mobile, ringkas blok kanan header (sembunyikan teks "Halo, nama" dan
  pindahkan ke panel), kurangi `px-8` jadi `px-4 md:px-8`.
- Desktop (>= md): header identik dengan sekarang, termasuk posisi menu
  tengah `absolute left-1/2 -translate-x-1/2` yang sengaja dipilih user.

**13.3 — Layout admin**
- Di bawah `lg`: sidebar jadi drawer off-canvas (geser dari kiri) dengan
  overlay gelap dan tombol hamburger di topbar; konten tanpa `pl-[260px]`.
  Drawer menutup saat tautan diklik, overlay diklik, atau tombol Esc.
- Di `lg` ke atas: sidebar, topbar, dan konten persis seperti sekarang.
- Padding: topbar `px-4 lg:px-10`, main `p-4 sm:p-6 lg:p-10`.

**13.4 — Halaman user**
`page.tsx` (hero + form lapor), `login`, `lupa-sandi`, `user/riwayat`,
`user/statistik`, `user/panduan`:
- Judul besar dikecilkan di mobile (mis. `text-3xl md:text-5xl`).
- Padding card/form dikecilkan di mobile (mis. form lapor `p-5 md:p-10`,
  section `px-4 md:px-8`).
- Pastikan toast `fixed top-24` tidak melebihi lebar layar (`max-w`).
- Tombol dan target sentuh minimal sekitar 44px tingginya di mobile.

**13.5 — Halaman admin**
`admin/page.tsx`, `complaints`, `analytics`, `users`, `reports`:
- Judul `text-4xl` jadi `text-2xl sm:text-3xl lg:text-4xl` (desktop tetap).
- `complaints`: filter status (SEMUA/PENDING/PROSES/SELESAI) tidak boleh
  meluap — boleh `overflow-x-auto` atau `flex-wrap`. Modal detail pengaduan
  harus muat di layar kecil, scroll di dalam modal bila panjang.
- `analytics`: pastikan grafik/komponen visual mengecil mengikuti lebar
  container, tidak memicu scroll horizontal halaman.
- Tabel (`users`, `reports`, `admin/page`) sudah `overflow-x-auto` —
  verifikasi saja tetap nyaman di-scroll, jangan diubah jadi kartu.
- Gaya cetak laporan (`print:` di `reports/page.tsx`) JANGAN dirusak.

**13.6 — Verifikasi lintas ukuran**
- Uji di lebar 360, 390, 768, 1024, 1440 (DevTools responsive mode atau
  Playwright/headless screenshot). Untuk tiap halaman dan tiap lebar, cek
  `document.documentElement.scrollWidth <= window.innerWidth` (tidak ada
  scroll horizontal halaman).
- Bandingkan tampilan 1440px (dan 1024px untuk admin) sebelum vs sesudah
  fase ini — harus identik secara visual.

**Dilarang di fase ini:**
- Mengubah tampilan desktop (>= md untuk user, >= lg untuk admin).
- Redesign: warna, font, logo, copy teks, urutan konten, atau alur halaman.
- Menambah library UI/CSS baru.
- Menyentuh backend, API, autentikasi, atau logic bisnis apapun.
- Menyentuh dataset NLP, database, atau file docker/infra.
- Mengubah `/HERO_SECTION.jpg` dan `/SIPMAS.jpg` atau cara background
  dipasang selain yang dibutuhkan agar tidak overflow di mobile.

**Setelah selesai (laporkan per sub-bagian 13.1–13.6):**
1. Daftar file yang diubah dan ringkas perubahannya.
2. Hasil `npm run build` frontend (output aktual, bukan asumsi).
3. Hasil cek scroll horizontal per halaman per lebar (tabel singkat).
4. Konfirmasi tampilan desktop tidak berubah (jelaskan cara membuktikannya).
5. Update status Fase 13 di `AGENTS.md` menjadi "MENUNGGU REVIEW".
6. Berhenti dan tunggu review saya.

**Definition of Done:**
- Semua halaman bisa dipakai di lebar 360px tanpa scroll horizontal
  halaman dan tanpa elemen terpotong.
- Navigasi user dan admin bisa diakses penuh dari mobile.
- Tampilan desktop identik dengan sebelum fase ini.
- `npm run build` frontend sukses; `npm test` backend tetap lulus.

### Fase 13b — Perbaikan Lanjutan Fase 13 (Sticky, Toast Desktop, Catatan Analytics)

**Tujuan:** Menutup 2 regresi tampilan DESKTOP yang ketemu saat review
Fase 13, plus 1 catatan dokumentasi. Fase 13 sendiri sudah disetujui;
fase kecil ini hanya merapikan sisanya. Aturan Fase 13 tetap berlaku:
tampilan desktop tidak boleh berubah.

**Konteks penting:**
- `globals.css` sekarang memasang `overflow-x: hidden` di `html` DAN `body`
  untuk semua lebar layar. Kombinasi ini umumnya membuat `body` menjadi
  scroll container sendiri sehingga `position: sticky` berhenti bekerja.
  Elemen sticky di project ini: topbar admin (`sticky top-0` di
  `admin/layout.tsx`) dan panel gambar kiri (`sticky top-0 h-screen` di
  `login/page.tsx`).
- Toast di `page.tsx` kini `w-[90vw] max-w-md text-center` tanpa prefix,
  sehingga di desktop selalu selebar 448px, padahal sebelumnya mengikuti
  lebar isi.
- Perubahan di luar fase ini yang dibuat user sendiri dan sudah direview:
  `GET /api/admin/analytics` sengaja dibuat publik (dipindah ke atas
  `authGuard`/`roleGuard` di `admin.routes.ts`) supaya halaman statistik
  publik bisa memuatnya. Response-nya hanya agregat (total, kategori,
  hotspot lokasi, rata-rata), tanpa `judul`, `isi`, atau `userId`.
  **JANGAN dikembalikan ke terproteksi.**

**Lakukan:**
1. `apps/frontend/src/app/globals.css`: ganti `overflow-x: hidden` di
   `body` menjadi `overflow-x: clip` (tidak membuat scroll container),
   dan di `html` pakai `overflow-x: clip` juga atau hapus kalau tidak
   diperlukan. Tujuannya tetap mencegah scroll horizontal halaman di
   mobile, tanpa merusak sticky. Pertahankan `overflow-y: scroll` dan
   `scroll-behavior: smooth` yang sudah ada di `html`.
2. `apps/frontend/src/app/page.tsx`: toast `fixed top-24 ...` ubah
   `w-[90vw] max-w-md text-center` menjadi `w-[90vw] md:w-auto max-w-md
   md:max-w-none text-center md:text-left` agar di desktop kembali
   mengikuti lebar isi seperti sebelum Fase 13. Di mobile tetap
   `w-[90vw] max-w-md text-center`.
3. `README.md` (dokumentasi saja): tambahkan catatan singkat di bagian
   catatan keamanan/known issues bahwa `GET /api/admin/analytics` publik
   by design, hanya mengembalikan data agregat tanpa data pribadi, dan
   endpoint admin lain (`/api/admin/laporan`, `/api/admin/users`, dst)
   tetap wajib login + role ADMIN.

**Dilarang di fase ini:**
- Mengubah hal lain di luar 3 item di atas, termasuk rate limit atau
  logic `getAdminAnalytics` (kalau perlu, jadi permintaan terpisah).
- Mengembalikan `/api/admin/analytics` ke terproteksi.
- Mengubah tampilan mobile hasil Fase 13.
- Menyentuh database, Docker, atau `MYSQL_DATABASE` (ada tugas terpisah
  yang dijadwalkan setelah fase ini).

**Setelah selesai:**
1. Tunjukkan diff `globals.css` dan toast di `page.tsx`.
2. Buktikan sticky kembali berfungsi di desktop (lebar >= 1024px): topbar
   admin tetap menempel saat halaman di-scroll, dan panel kiri login tetap
   menempel. Beri bukti nyata (screenshot atau pengamatan), bukan asumsi.
3. Buktikan di mobile (360px) halaman tetap tanpa scroll horizontal
   (`document.documentElement.scrollWidth <= window.innerWidth`).
4. Output aktual `npm run build` frontend.
5. Update status Fase 13b di `AGENTS.md` menjadi "MENUNGGU REVIEW".
6. Berhenti dan tunggu review saya.

**Definition of Done:**
- Sticky topbar admin dan panel login bekerja di desktop.
- Toast di desktop selebar isi seperti sebelum Fase 13.
- Tidak ada scroll horizontal halaman di lebar 360px.
- README mencatat analytics publik by design.
- `npm run build` frontend sukses.

### Fase 14 — Ganti `MYSQL_DATABASE` Jadi `db_sipmas` di Kedua Compose Dev

**Tujuan:** Mengganti `MYSQL_DATABASE: db_pengaduan` menjadi
`MYSQL_DATABASE: db_sipmas` di `docker-compose.yml` (root) dan
`infra/docker/docker-compose.yml`. Ini menutup keputusan yang sengaja
ditunda sampai Fase 13 selesai, dan merevisi larangan lama di Fase 8, 10,
dan 12 (sudah ditandai `[DIREVISI di Fase 14]` di dokumen ini).

**Konteks penting:**
- `MYSQL_DATABASE` hanya dibaca image MySQL saat folder datanya masih
  kosong (inisialisasi pertama). Volume `mysql_data` sudah terisi, jadi
  mengubah nilai ini **tidak membuat, mengubah, atau menghapus database
  apapun** yang sekarang ada.
- Manfaatnya: kalau suatu hari volume dihapus dan MySQL init ulang, yang
  terbuat otomatis adalah `db_sipmas` (yang dipakai aplikasi), bukan
  `db_pengaduan` milik project lain. Compose SIPMAS juga tidak lagi
  menyebut nama database project lain.
- `infra/docker/docker-compose.prod.yml` sudah memakai `db_sipmas` sejak
  Fase 8, jadi TIDAK perlu diubah.
- `db_pengaduan` tetap milik project lain: larangan menyentuh
  database-nya tidak berubah.

**Lakukan:**
1. (Pengaman, opsional tapi dianjurkan) jalankan
   `infra/scripts/backup-db.sh` sebelum mengubah apa pun, untuk backup
   `db_sipmas`.
2. Di kedua file compose di atas, ubah HANYA baris `MYSQL_DATABASE` pada
   service `mysql` menjadi `db_sipmas`. Jangan ubah baris lain.
3. Dari root project jalankan `docker compose up -d`. Container `mysql`
   akan dibuat ulang karena env berubah; data aman di volume
   `mysql_data`. Tunggu service `backend` sehat.
4. Verifikasi (hanya perintah baca/read-only):
   - `SHOW DATABASES;` harus masih menampilkan `db_pengaduan` dan
     `db_sipmas`.
   - Jumlah baris `User` dan `Laporan` di `db_sipmas` sama dengan sebelum
     perubahan (catat sebelum dan sesudah).
   - Backend tetap bisa login dan menampilkan data.
5. Jalankan audit: `grep -rni "db_pengaduan" .` (exclude `node_modules`,
   `.venv`, `.next`, `.turbo`, `dist`, `.git`, `dataset`). Kedua file
   compose harus bersih. Sisa hasil yang sah hanya: komentar di
   `infra/scripts/backup-db.sh`, bagian "Catatan Basis Data" di
   `README.md`, dan riwayat di `AGENTS.md`/`PROMPTS.md`. Cocokkan satu per
   satu di laporan.

**Dilarang di fase ini:**
- `docker compose down -v`, `docker volume rm`, `DROP DATABASE`, atau
  perintah apa pun yang menghapus volume atau database.
- Menyentuh isi atau struktur `db_pengaduan`.
- Mengubah baris lain di file compose, atau mengubah
  `docker-compose.prod.yml`.
- Mengubah kode aplikasi, `schema.prisma`, atau `.env`.

**Setelah selesai:**
1. Tunjukkan diff kedua file compose (hanya satu baris berubah di
   masing-masing).
2. Tempel output aktual `SHOW DATABASES;` dan jumlah baris `User`/`Laporan`
   sebelum vs sesudah.
3. Tempel hasil audit `grep` dan cocokkan tiap barisnya.
4. Update status Fase 14 di `AGENTS.md` menjadi "MENUNGGU REVIEW".
5. Berhenti dan tunggu review saya.

**Definition of Done:**
- Kedua compose dev memakai `MYSQL_DATABASE: db_sipmas`.
- `db_pengaduan` dan `db_sipmas` keduanya masih ada, jumlah baris
  `db_sipmas` tidak berubah.
- Tidak ada volume atau database yang dihapus.
- Audit `grep` hanya menyisakan hasil yang sah (butir 5 di atas).

### Fase 15 — Pengerasan Keamanan P0 (Hasil Audit Eksternal)

**Tujuan:** Menutup temuan keamanan prioritas tertinggi (P0) dari dua audit
eksternal atas kode Fase 14. Semua temuan di bawah sudah diverifikasi
langsung ke kode, bukan sekadar dipercaya dari laporan. Fase ini wajib
selesai sebelum ada data warga nyata masuk ke sistem.

**Pengecualian dari aturan Bagian 0:** fase ini mengubah perilaku backend
dan (terbatas) dua teks/placeholder di frontend. Tidak ada perubahan
layout, warna, atau tampilan lain.

**Langkah manual user — HARUS dilakukan SEBELUM prompt Fase 15 dijalankan
(agent tidak boleh membuat atau menulis secret asli):**
1. Buat secret baru: `openssl rand -base64 64` untuk `JWT_SECRET`,
   `openssl rand -hex 32` untuk `TRAIN_API_KEY`, dan password kuat untuk
   `DB_PASSWORD` (produksi).
2. Taruh nilainya di `.env` root dan `apps/backend/.env` (file tidak
   ter-track git). Compose root membaca `.env` root otomatis; untuk
   `infra/docker/docker-compose.yml` jalankan dengan
   `--env-file ../../.env`.
3. Kredensial SMTP asli (jika ada di `.env`) ikut dirotasi, karena `.env`
   pernah ikut terkirim di arsip zip.
4. Jika repo ini pernah dipush ke tempat publik, anggap semua secret lama
   bocor (rotasi di langkah 1 menjawabnya). Membersihkan riwayat git
   (mis. `git filter-repo`) adalah keputusan user sendiri, BUKAN tugas
   agent.
5. Setelah `JWT_SECRET` diganti, semua pengguna harus login ulang dan OTP
   yang sedang berlaku menjadi tidak valid. Itu wajar.

**Konteks penting (hasil verifikasi):**
- `JWT_SECRET` aktif identik dengan nilai yang tertulis di `README.md`,
  `docker-compose.yml`, dan `infra/docker/docker-compose.yml` (ter-track
  git). `TRAIN_API_KEY` punya fallback hardcoded di
  `apps/nlp-service/app/main.py`. Compose prod punya fallback `DB_PASSWORD`
  yang lemah.
- OTP dibuat dengan `Math.random()`, disimpan plaintext, tanpa batas
  percobaan per akun; rate limit hanya per IP. `server.ts` memakai
  `trust proxy = 1` padahal port 5001 dipublikasikan langsung, sehingga
  header `X-Forwarded-For` palsu dapat melewati rate limit.
- `GET /` dan `GET /api/status` (monitoring) publik tanpa guard.
- `getAdminAnalytics` mengembalikan angka karangan: `avgResolution` 2,4
  dan `accuracy` 98,2 saat data kosong. Catatan: `accuracy` TIDAK
  ditampilkan di UI manapun (hanya ada di JSON API dan state awal
  halaman); yang tampil di UI adalah `avgResolution` ("Durasi Resolusi"
  di statistik, "Rata-rata Resolusi" di admin analytics).
- 9 file di `apps/backend/public/uploads/` ter-track git, termasuk file
  yang namanya memuat nama lengkap orang.
- Endpoint `GET /api/admin/analytics` **tetap publik** (keputusan user,
  jangan dikembalikan ke terproteksi). Hanya angka fallback-nya yang
  diperbaiki.

**Pecah jadi sub-bagian, kerjakan berurutan, laporkan tiap selesai:**

**15.1 — Secret keluar dari repo**
- `docker-compose.yml` (root) dan `infra/docker/docker-compose.yml`:
  `JWT_SECRET` dan `TRAIN_API_KEY` (service `backend` dan `nlp-service`)
  menjadi `${JWT_SECRET:?JWT_SECRET wajib diisi}` dan
  `${TRAIN_API_KEY:?TRAIN_API_KEY wajib diisi}`.
- `infra/docker/docker-compose.prod.yml`: `DB_PASSWORD`, `JWT_SECRET`,
  `TRAIN_API_KEY` wajib (`:?`), hapus fallback password lemah. Aplikasi
  tetap memakai user DB root di fase ini (pembuatan user DB khusus aplikasi
  dijadwalkan di fase berikutnya, jangan dikerjakan sekarang).
- `README.md`: hapus nilai `JWT_SECRET` yang tertulis; ganti petunjuk
  membuat secret (`openssl rand -base64 64`). `.env.example`: JWT_SECRET
  dan TRAIN_API_KEY berisi placeholder jelas ("ganti dengan ...") dan
  ditandai wajib; tambahkan `TRUST_PROXY=` (lihat 15.4) sebagai komentar.
- `apps/nlp-service/app/main.py`: hapus fallback `TRAIN_API_KEY`. Bila env
  tidak diset, `POST /train` menolak SEMUA permintaan dengan 503
  ("belum dikonfigurasi"); `/predict` dan `/health` tetap normal. Bandingkan
  token dengan `hmac.compare_digest`. Jangan lagi mengembalikan `str(e)`
  ke klien (log di server, balas pesan generik).
- Jangan pernah mencetak nilai secret di output/log/laporan. Untuk
  membuktikan bersih, jalankan `git grep -F "<nilai JWT_SECRET dari
  apps/backend/.env>"` lewat shell tanpa menampilkan nilainya dan laporkan
  hanya jumlah hasil (harus 0).

**15.2 — Perkuat OTP (`auth.controller.ts`)**
- Buat `apps/backend/src/lib/otp.ts` berisi: `generateOtp()` memakai
  `crypto.randomInt(100000, 1000000)`; `hashOtp(otp)` memakai HMAC-SHA256
  dengan kunci `JWT_SECRET`; `verifyOtpHash(otp, hash)` dengan
  `crypto.timingSafeEqual`; konstanta `MAX_OTP_ATTEMPTS = 5`; dan
  `maskEmail(email)`.
- Simpan HASH OTP di kolom `otpCode` (tidak ada lagi OTP plaintext di DB).
  Email tetap berisi kode asli.
- Tambah kolom `otpAttempts Int @default(0)` ke model `User`. **Aturan
  migrasi (kritis):** tulis folder migration BARU secara manual dengan
  nama berstempel waktu setelah `20260928143000` berisi
  ``ALTER TABLE `User` ADD COLUMN `otpAttempts` INTEGER NOT NULL DEFAULT 0;``,
  ubah `schema.prisma`, lalu terapkan dengan `npx prisma migrate deploy`
  terhadap `db_sipmas`. **DILARANG** menjalankan `prisma migrate dev`,
  `prisma migrate reset`, `prisma db push --force-reset`, atau opsi
  `--accept-data-loss`: dev compose memakai `db push`, jadi `migrate dev`
  bisa mendeteksi drift dan meminta reset database.
- `verifyRegister` dan `resetPassword`: bila OTP salah, naikkan
  `otpAttempts` secara atomik (`{ increment: 1 }`); bila mencapai 5,
  kosongkan `otpCode` dan `otpExpires` lalu balas 429 ("Terlalu banyak
  percobaan, minta kode baru"). Setiap OTP baru (`register`, `sendOtp`)
  mereset `otpAttempts` ke 0; verifikasi berhasil juga mengosongkan OTP
  dan mereset counter.
- `resetPassword`: wajib memvalidasi `newPassword` minimal 8 karakter,
  pesan setara dengan `register`. Perilaku menandai `isVerified: true`
  setelah OTP benar dipertahankan.
- Tambah test Jest `src/__tests__/otp.test.ts`: OTP selalu 6 digit; hash
  bukan plaintext dan konsisten; `verifyOtpHash` benar/salah;
  `maskEmail`.

**15.3 — Respons seragam (anti-enumerasi) dan log aman**
- `login`: email tidak terdaftar dan password salah sama-sama membalas
  401 dengan pesan yang sama ("Email atau password salah."). Respons 403
  untuk akun belum terverifikasi tetap hanya muncul setelah password
  benar.
- `sendOtp`: untuk email tidak terdaftar, balas 200 dengan pesan yang sama
  seperti jalur sukses ("Jika email terdaftar, kode OTP telah dikirim.")
  tanpa mengirim email. Frontend `lupa-sandi` tetap berfungsi tanpa
  perubahan UI.
- Semua log yang menulis email lengkap diganti `maskEmail(email)`.
  `register` yang membalas 409 untuk email/NIK terdaftar dibiarkan
  (secara alami membocorkan itu; di luar scope).

**15.4 — Proxy, rate limit, dan port**
- `server.ts`: hapus `app.set('trust proxy', 1)` tanpa syarat. Aktifkan
  hanya bila env `TRUST_PROXY` diisi (angka jumlah hop, mis. `1`); default
  tidak ada trust proxy. Dokumentasikan di `.env.example` dan komentar
  compose prod: isi `TRUST_PROXY=1` hanya bila backend benar-benar berada
  di belakang reverse proxy.
- Kedua compose dev: publikasi port MySQL dan NLP hanya ke loopback
  (`"127.0.0.1:${MYSQL_PORT:-3307}:3306"` dan `"127.0.0.1:5000:5000"`);
  UI MailHog juga ke `127.0.0.1`. Port frontend (3000) dan backend (5001)
  TIDAK diubah, karena dipakai menguji dari perangkat lain di jaringan
  lokal.
- Bukti: kirim lebih dari 20 permintaan login salah dengan nilai
  `X-Forwarded-For` berbeda-beda; permintaan ke-21 harus 429. Restart
  backend sesudahnya agar counter limiter bersih.

**15.5 — Kunci monitoring**
- `monitoring.routes.ts`: `GET /` dan `GET /api/status` dipasang
  `authGuard` + `roleGuard('ADMIN')`. `GET /health` di `server.ts` tetap
  publik dan minimal (hanya `status` dan `service`). Perbarui README
  (backend 5001 kini perlu login ADMIN untuk halaman monitoring).
- Bukti: tanpa cookie → 401; dengan cookie admin → 200.

**15.6 — Hapus angka karangan di analytics**
- `getAdminAnalytics`: `avgResolution` bernilai `null` bila belum ada
  laporan SELESAI (tidak ada lagi nilai 2,4). Ganti `accuracy` menjadi
  `avgConfidence` (rata-rata `confidenceScore` × 100, satu desimal),
  bernilai `null` bila belum ada skor (tidak ada lagi nilai 98,2).
- Frontend `user/statistik/page.tsx` dan `admin/analytics/page.tsx`: ubah
  nilai awal state (hapus 2.4 dan 98.2) dan tampilkan "—" dengan
  keterangan "Belum ada data" saat `avgResolution` null. **Hanya itu**
  perubahan UI yang diizinkan di fase ini; layout, warna, dan komponen
  lain tidak boleh berubah. Pastikan juga halaman yang memakai analytics
  (mis. `admin/page.tsx`) tidak rusak oleh nilai `null`.

**15.7 — Keluarkan upload dari git**
- `git rm -r --cached apps/backend/public/uploads` (file di disk TIDAK
  dihapus), tambahkan aturan `.gitignore` untuk isi folder tersebut dan
  `.gitkeep` agar folder tetap ada untuk bind mount Docker. Folder
  `public/uploads` kosong di `apps/frontend` tidak perlu diubah.
- Jangan menulis ulang riwayat git dan jangan force-push.
  Membersihkan riwayat adalah keputusan user.

**Dilarang di fase ini:**
- Mengembalikan `GET /api/admin/analytics` ke terproteksi.
- Menyentuh `db_pengaduan` dengan cara apapun, atau menjalankan perintah
  Prisma yang bisa me-reset database (lihat 15.2).
- Menulis, mencetak, atau meng-commit nilai secret asli.
- Mengubah tampilan di luar dua placeholder pada 15.6, atau menyentuh
  fitur di luar 15.1–15.7 (mis. helmet, paginasi, upload magic bytes,
  revokasi JWT, dan perbaikan NLP dijadwalkan di fase berikutnya).
- Menghapus file upload dari disk.

**Setelah selesai (laporkan per sub-bagian 15.1–15.7):**
1. Ringkasan perubahan per file.
2. Output aktual `pnpm --filter backend test` (semua lulus, termasuk
   `otp.test.ts`) dan `pnpm build`.
3. Bukti 15.1: `docker compose config` gagal bila env wajib kosong, dan
   hasil `git grep` secret lama = 0 hasil (tanpa menampilkan nilainya).
4. Bukti 15.2: output `prisma migrate deploy` pada `db_sipmas`, serta uji
   nyata 5 OTP salah berturut-turut menghasilkan 429 dan OTP dibatalkan.
5. Bukti 15.3, 15.4, 15.5 seperti dijelaskan di tiap sub-bagian (curl
   asli, bukan asumsi).
6. Bukti 15.6: `/api/admin/analytics` pada database tanpa laporan
   selesai mengembalikan `avgResolution: null` dan `avgConfidence: null`,
   dan kedua halaman menampilkan "Belum ada data" tanpa error.
7. `git ls-files | grep public/uploads` hanya menampilkan `.gitkeep`.
8. Update status Fase 15 di `AGENTS.md` menjadi "MENUNGGU REVIEW".
9. Berhenti dan tunggu review saya.

**Definition of Done:**
- Tidak ada secret aktif di file ter-track; compose menolak start tanpa
  env wajib; `/train` tidak punya kunci bawaan.
- OTP dibuat dengan CSPRNG, disimpan sebagai hash, dibatasi 5 percobaan
  per akun; reset password memvalidasi panjang minimal 8.
- Login dan `send-otp` tidak membedakan email terdaftar/tidak; tidak ada
  email lengkap di log.
- `X-Forwarded-For` palsu tidak lagi melewati rate limit; port MySQL dan
  NLP hanya di loopback pada compose dev.
- Monitoring hanya untuk ADMIN, `/health` tetap publik dan minimal.
- Analytics tidak lagi mengembalikan angka karangan.
- Upload tidak lagi ter-track git, file di disk utuh.
- Semua test lulus dan `pnpm build` sukses.

---

### Fase 16 — Pengerasan P1 (Tahap A: Aplikasi, Tahap B: Infrastruktur)

**Prasyarat:** Fase 15 sudah `DONE` (OTP ter-hash, `src/lib/otp.ts`,
kolom `otpAttempts`, `TRUST_PROXY`, monitoring terkunci, secret keluar
dari repo).

**Tujuan:** Menutup temuan prioritas P1 dari dua audit eksternal yang
sudah diverifikasi ke kode: dependensi usang, header keamanan, upload,
sesi/JWT, validasi dan beban query, serta Docker/CI/backup. Fase besar
ini dibagi **dua tahap**. Setelah Tahap A (16.1–16.7) agent **berhenti**,
melapor, dan menunggu perintah "lanjut Tahap B" dari user.

**Aturan keras (berlaku semua sub-bagian):**
- Jangan sentuh `db_pengaduan`. Jangan jalankan `prisma migrate dev`,
  `prisma migrate reset`, `prisma db push --force-reset`, atau
  `--accept-data-loss`. Migration baru ditulis MANUAL (folder berstempel
  waktu setelah migration terakhir) lalu diterapkan dengan
  `prisma migrate deploy` ke `db_sipmas`.
- `GET /api/admin/analytics` tetap publik. Jangan mencetak atau
  meng-commit nilai secret.
- Tidak ada perubahan layout/warna/tampilan, kecuali yang disebut
  eksplisit. Jangan melompat ke Next.js 15.

**Fakta hasil verifikasi yang mendasari fase ini:** `next` 14.2.7 dan
`multer` 1.4.5-lts.1; helmet tidak terpasang; upload hanya diperiksa MIME
dan ekstensi dari klien, nama file asli ikut tersimpan, dan `/uploads`
disajikan publik lewat `express.static`; `authGuard` tidak mengecek DB dan
role tertanam di JWT 7 hari; `findMany` tanpa batas; analytics memuat
seluruh tabel `Laporan`; tidak ada `@@index`; Dockerfile backend memakai
`pnpm@latest`, tanpa lockfile, tanpa `USER`, devDependencies ikut ke
image; lockfile ada di root monorepo di luar build context; dev memakai
`prisma db push` sedangkan prod `migrate deploy`; image mailhog tidak
di-pin; aplikasi prod login sebagai root MySQL; CI punya typo cache,
tanpa audit dan secret scanning; backup tanpa enkripsi dan retensi,
restore belum pernah diuji.

#### Tahap A — Aplikasi (16.1–16.7)

**16.1 — Dependensi dan CI**
- Naikkan `next` dan `eslint-config-next` ke patch terbaru seri 14.2.x
  (minimal 14.2.25) dan `multer` ke 2.x (plus `@types/multer`); sesuaikan
  kode bila API berubah. Jalankan `pnpm audit` dan laporkan hasilnya apa
  adanya (nomor CVE dari laporan audit belum terverifikasi; percayai
  output audit). Perbaiki hanya yang aman tanpa breaking change, sisanya
  dicatat.
- `.github/workflows/ci.yml`: perbaiki `restore-keys` menjadi
  `${{ runner.os }}-pnpm-store-`; tambah step `pnpm audit --prod
  --audit-level=high` dengan `continue-on-error: true` (informasional
  dulu) dan secret scanning gitleaks yang gagal bila menemukan secret.
- Bukti: `pnpm build` dan test lulus; smoke test halaman utama, login,
  admin.

**16.2 — Header keamanan**
- Backend: pasang `helmet` global. Halaman monitoring (HTML dengan
  inline style/script dan Google Fonts) diberi CSP khusus atau CSP
  dimatikan hanya pada route itu; set `crossOriginResourcePolicy` ke
  `cross-origin` agar gambar upload tetap termuat; HSTS hanya di
  production.
- Frontend `next.config.mjs`: tambah `headers()` untuk semua route:
  `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`
  minimal. JANGAN menambah CSP untuk frontend (risiko merusak skrip
  inline Next; dijadwalkan terpisah).
- Bukti: `curl -I` menampilkan header; monitoring (login admin),
  frontend, dan tampilan foto tetap normal.

**16.3 — Satu jalur API (relatif)**
- `lib/api-client.ts`: `API_BASE_URL` memakai `NEXT_PUBLIC_API_URL` bila
  diisi; kosong berarti jalur relatif `/api/...` yang diteruskan rewrite
  Next ke backend. Set build arg `NEXT_PUBLIC_API_URL` kosong di ketiga
  compose. Alasan: satu origin menghilangkan masalah cookie lintas situs
  dan CSRF, dan uji dari HP lewat IP LAN tidak lagi mengarah ke
  `localhost` perangkat itu. Pastikan tidak ada URL absolut tertanam di
  kode frontend; rewrite di `next.config.mjs` tetap.
- **Kriteria batal:** uji unggah foto 5 MB lewat jalur relatif. Bila
  gagal atau terpotong, kembalikan perubahan 16.3, laporkan
  penyebabnya, dan lanjut ke sub-bagian berikutnya.
- Bukti: login, buat laporan dengan foto, riwayat, admin ubah status —
  semua lewat jalur relatif; browser tidak memanggil `localhost:5001`.

**16.4 — Panggilan NLP dan `/api/predict`**
- `nlpClient.ts`: timeout 5 detik (`AbortController`); timeout/error
  tetap menghasilkan `null`.
- `/api/predict`: rate limiter khusus (30 per menit per IP) di
  `rateLimiter.ts` dan batas panjang teks 2000 karakter (400 bila
  lebih).
- NLP `main.py`: batas panjang teks 5000 (400) dan hapus `CORS(app)`
  (hanya diakses backend, server ke server).
- Test Jest: fetch yang menggantung tetap menghasilkan `null` dalam
  waktu wajar.

**16.5 — Upload aman**
- Nama file tersimpan = UUID + ekstensi hasil deteksi (bukan nama
  asli).
- Cek magic bytes (JPEG `FFD8FF`, PNG `89504E470D0A1A0A`, WEBP `RIFF`
  dan `WEBP`); tidak cocok → hapus file dan balas 400.
- Proses ulang dengan `sharp`: `rotate()` lalu simpan tanpa metadata
  (EXIF/GPS terbuang), batasi sisi terpanjang (mis. 2560 px) dan
  `limitInputPixels`. Izinkan build script `sharp` di `allowBuilds` pnpm
  bila perlu.
- Akses file: ganti `express.static('/uploads')` dengan handler ber-
  `authGuard`: hanya ADMIN atau pemilik laporan (cari `Laporan.foto =
  '/uploads/<nama>'` milik `req.user.id`) yang boleh; selain itu 404.
  Header cache `private`. Pertahankan fallback `storageService`.
  Pastikan `<img src="/uploads/...">` di riwayat warga dan modal admin
  tetap tampil (cookie ikut karena satu origin lewat rewrite). File lama
  tidak diubah atau dihapus.
- Test: file palsu (ekstensi `.jpg` isi teks) ditolak; EXIF hilang pada
  hasil; akses tanpa login tidak berhasil.

**16.6 — JWT dan pengelolaan admin**
- Migration manual: `ALTER TABLE` pada `User` menambah kolom
  `tokenVersion INTEGER NOT NULL DEFAULT 0`, plus perubahan
  `schema.prisma`.
- `authGuard`: `jwt.verify` dengan `algorithms: ['HS256']` (sign juga
  HS256). Setelah token valid, ambil user dari DB (`id`, `role`,
  `isVerified`, `tokenVersion`): user tidak ada atau belum terverifikasi
  → 401; `tv` di token ≠ `tokenVersion` → 401; `req.user.role` diambil
  dari DB, bukan dari token. `login` memasukkan `tv` ke token;
  `resetPassword` menaikkan `tokenVersion` (sesi lama batal).
- `patchAdminUsers`: admin tidak boleh menurunkan role dirinya sendiri
  dan tidak boleh menurunkan admin terakhir (400 dengan pesan jelas);
  perubahan role menaikkan `tokenVersion` pengguna target.
- Perbarui test `authGuard` (mock Prisma) dan tambah: user tidak ada →
  401, role dari DB menimpa token, `tokenVersion` berbeda → 401,
  algoritma selain HS256 ditolak.

**16.7 — Validasi, paginasi, analytics SQL, indeks**
- Validasi terpusat dengan `zod` dan middleware `validate(schema)` untuk
  `createLaporan` (judul ≤ 150, isi ≤ 5000, lokasi ≤ 191, tanggal valid
  atau kosong, kategori di luar daftar putih menjadi `Lainnya`) dan body
  PATCH admin (id integer, enum status/role). Id yang tidak ada → 404
  (tangkap Prisma `P2025`), bukan 500. Tipe kolom `judul` tidak perlu
  diubah.
- Paginasi kompatibel: `getAdminLaporan`, `getAdminUsers`, `getRiwayat`
  mendukung `page` dan `limit`; tanpa parameter tetap mengembalikan array
  seperti sekarang tetapi dibatasi 500 data terbaru; `limit` maksimum 500;
  tambah header `X-Total-Count`. Frontend TIDAK diubah (paginasi UI
  adalah permintaan terpisah).
- `getAdminAnalytics` tanpa memuat seluruh tabel: `groupBy` pada
  kombinasi `status`/`kategori`/`kategoriPrediksi`/`lokasi`, `aggregate`
  untuk rata-rata confidence, `$queryRaw` untuk rata-rata durasi SELESAI;
  normalisasi kategori tetap di JavaScript atas hasil group; filter
  `range` dan `category` pindah ke `where` dengan semantik yang sama.
  **Bukti kesetaraan:** pada data uji yang sama, bandingkan keluaran
  fungsi lama vs baru; angka harus sama (jelaskan bila ada selisih).
  Tambah cache memori 60 detik per `(range, category)` dan rate limit 60
  per menit per IP pada route analytics (tetap publik).
- Indeks lewat migration manual: `@@index([status])`,
  `@@index([createdAt])`, `@@index([kategori])`,
  `@@index([userId, createdAt])` pada `Laporan`.
- Ganti sisa `console.log/error` di `apps/backend/src` dengan `logger`
  (pino). Tambah test: skema validasi laporan dan pemetaan `P2025` →
  404.

**Setelah Tahap A:** laporkan per sub-bagian, tempel output aktual
`pnpm audit`, `pnpm --filter backend test`, `pnpm build`, hasil `curl`
yang diminta, dan hasil bukti kesetaraan analytics. Update status Fase 16
menjadi "IN PROGRESS (Tahap A selesai, menunggu review)" lalu **berhenti**
dan tunggu "lanjut Tahap B".

#### Tahap B — Infrastruktur (16.8–16.10)

**16.8 — Docker reproducible dan non-root**
- Backend dan frontend: build context ke root monorepo (compose
  `context: .` dengan `dockerfile: apps/<app>/Dockerfile`) agar
  `pnpm-lock.yaml` ikut; pin pnpm sesuai field `packageManager` di root
  (bukan `latest`); `pnpm install --frozen-lockfile` (dengan filter
  workspace). Image runner hanya berisi dependensi produksi (CLI
  `prisma` tetap tersedia untuk `migrate deploy`: pindahkan ke
  `dependencies` atau pakai `pnpm deploy`, pilih yang berhasil), berjalan
  sebagai `USER` non-root dengan `public/uploads` dapat ditulis. Image
  NLP juga non-root. Tambah `.dockerignore` root (node_modules, .git,
  backups, .venv). Hapus volume `backend_uploads` yang tak terpakai.
- Bukti: `docker compose build --no-cache` sukses, `up -d` sehat,
  `docker exec <kontainer> id` bukan root, unggah foto berhasil menulis ke
  folder upload, `prisma migrate deploy` sukses.

**16.9 — Konsistensi compose dev/prod**
- Dev: ganti `prisma db push` menjadi `prisma migrate deploy` (sama
  dengan prod); pin image `mailhog/mailhog:v1.0.1`.
- Prod: buat user MySQL khusus aplikasi lewat `MYSQL_USER` dan
  `MYSQL_PASSWORD` (env wajib `DB_APP_PASSWORD`, tanpa fallback);
  `DATABASE_URL` memakai user itu, bukan root (password root hanya untuk
  kontainer MySQL). `SMTP_HOST` prod wajib dari env (`:?`) karena servis
  mailhog tidak ada di prod. Catatan: user MySQL ini hanya terbuat pada
  inisialisasi volume baru; untuk volume prod yang sudah ada, dokumentasikan
  perintah GRANT manual di README.
- README bagian "Deploy produksi": reverse proxy dengan TLS (Caddy atau
  Nginx), `TRUST_PROXY=1`, dan jangan membuka port 3000/5001 langsung ke
  internet. Reverse proxy sendiri TIDAK dibuat di fase ini.
- Uji dengan nilai env sementara di shell; jangan commit nilai apa pun.

**16.10 — Backup: retensi, enkripsi, restore teruji**
- `infra/scripts/backup-db.sh`: retensi (hapus backup `db_sipmas_*` lebih
  tua dari `BACKUP_RETENTION_DAYS`, default 14, hanya di folder
  `backups/`); enkripsi opsional `gpg --symmetric` bila
  `BACKUP_GPG_PASSPHRASE` diset (passphrase dari env lewat stdin/fd, bukan
  argumen; hapus `.sql` plaintext setelah terenkripsi).
- Buat `infra/scripts/restore-db.sh`: argumen wajib file backup dan nama
  database target; SELALU menolak target `db_pengaduan`; menolak
  `db_sipmas` kecuali dengan flag `--yes-overwrite-sipmas`; saran target
  `db_sipmas_restore_test`.
- Uji restore: backup → restore ke `db_sipmas_restore_test` → bandingkan
  jumlah baris `User` dan `Laporan` dengan `db_sipmas` → hapus HANYA
  database `db_sipmas_restore_test` (satu-satunya `DROP DATABASE` yang
  diizinkan, dengan pemeriksaan nama persis). Laporkan hasil.
- README: dokumentasikan backup, restore, retensi, enkripsi.

**Langkah manual user sebelum Tahap B:** siapkan `DB_APP_PASSWORD`
(password kuat), dan `BACKUP_GPG_PASSPHRASE` bila ingin backup
terenkripsi.

**Dilarang di fase ini:** Next.js 15; CSP untuk frontend; perubahan UI di
luar yang disebut; menyentuh `db_pengaduan`; mereset database; mengembalikan
analytics ke terproteksi; mencetak atau meng-commit secret.

**Definition of Done:**
- Tahap A: audit dijalankan dan dilaporkan; helmet dan header aktif; upload
  tervalidasi isi, tanpa EXIF, nama acak, dan hanya bisa diakses
  pemilik/ADMIN; role dan sesi dicek ke DB dengan `tokenVersion`; validasi
  input terpusat; analytics tidak memuat seluruh tabel dan hasilnya setara;
  seluruh test lulus dan `pnpm build` sukses.
- Tahap B: build Docker reproducible dan non-root; dev dan prod sama-sama
  `migrate deploy`; prod memakai user DB non-root; backup berenkripsi
  opsional dengan retensi; restore terbukti di `db_sipmas_restore_test`.

---

### Fase 17 — NLP dan Kualitas Data

**Prasyarat:** Fase 16 `DONE`.

**Tujuan:** Membuat klasifikasi kategori jujur dan aman dipakai: evaluasi
yang bermakna, jalur "tidak yakin", training dipisah dari serving, dan
dokumentasi batasan model. Semua temuan berikut sudah diverifikasi:
dataset 3.000 baris hanya berisi 478 teks unik (berbasis template);
tumpang-tindih data latih dan uji ±99,8% sehingga akurasi 100% tidak
bermakna; model hanya 3 kelas (Infrastruktur, Lingkungan, Pelayanan)
sementara aplikasi mengenal 5 kategori; "ada begal di perempatan semalam"
diprediksi Infrastruktur (0,57) dan "halo" diprediksi Pelayanan (0,34)
tanpa jalur "tidak yakin"; form saat ini memblokir pengiriman bila kategori
tidak terdeteksi; `/train` berjalan di Gunicorn 2 worker sehingga hanya
worker penerima yang memuat model baru; file model tersalin di beberapa
lokasi.

**Keputusan default (user boleh membatalkan SEBELUM menjalankan fase ini):**
1. Laporan tetap bisa dikirim saat NLP gagal atau tidak yakin, dengan
   kategori `Lainnya` (menggantikan perilaku memblokir).
2. Kategori "Keamanan" tetap ada di aplikasi tetapi tidak diprediksi
   model karena belum ada data latih nyata. Agent DILARANG mengarang data
   laporan "nyata" untuk kelas ini. Bila user menyediakan laporan nyata
   berlabel, itu menjadi fase tambahan.
3. Endpoint `POST /train` dihapus; pelatihan ulang dilakukan lewat build
   ulang image atau CLI.

**Aturan keras:** jangan sentuh `db_pengaduan`; jangan mengubah layout
frontend (hanya logika dan teks pada 17.3); jangan mengarang data
pelaporan warga; jangan mencetak secret.

**17.1 — Audit dataset dan versi training minimal**
- Buat `apps/nlp-service/scripts/audit_dataset.py`: laporkan jumlah baris,
  teks unik (setelah `clean_text`), distribusi kelas, teks sama berlabel
  berbeda, dan apakah kolom NIK/email tampak sintetis. Simpan ringkasan ke
  `apps/nlp-service/dataset/dataset_audit.md`.
- Hasilkan `dataset/dataset_training.csv` hanya berisi kolom `text` dan
  `label` (unik menurut teks bersih; konflik label dibuang dan dilaporkan).
  Training memakai file ini. File CSV asli TIDAK diubah atau dihapus.

**17.2 — Evaluasi jujur**
- `app/model/train.py`: `StratifiedGroupKFold` 5 lipatan (group = teks
  bersih) dan laporkan akurasi, macro-F1, precision/recall/F1 per kelas,
  dan confusion matrix. Simpan `metrics.json` di samping model.
- Buat `apps/nlp-service/tests/ood_smoke.csv` yang ditulis manual:
  minimal 10 kalimat natural per kelas dengan variasi gaya/slang/panjang
  plus minimal 10 kalimat tidak relevan berlabel `uncertain` ("halo",
  "tes", dan sejenisnya). Ini bukan data latih dan model tidak boleh
  dilatih dengannya. Laporkan hasil model pada set ini apa adanya.

**17.3 — Ambang keyakinan dan kebijakan "tidak yakin"**
- `/predict` mengembalikan `{category, confidence, uncertain}`; ambang
  dari env `NLP_MIN_CONFIDENCE` (default 0.5; tentukan angka dengan
  melihat sebaran confidence di smoke set dan laporkan alasannya).
- Backend `nlpClient` meneruskan `uncertain`; `createLaporan`: bila
  null/uncertain → `kategori = 'Lainnya'`; `kategoriPrediksi` dan
  `confidenceScore` tetap disimpan bila ada.
- Frontend `page.tsx` (hanya logika dan teks): kategori tidak
  terdeteksi/uncertain tidak lagi memblokir pengiriman; kotak kategori
  menampilkan "Lainnya (belum terdeteksi otomatis)" dan hidden `kategori`
  bernilai `lainnya`; pesan pemblokiran lama dihapus. Layout dan komponen
  lain tidak berubah.

**17.4 — Pisahkan training dari serving**
- Hapus `POST /train` dan semua jejak `TRAIN_API_KEY` (main.py, ketiga
  compose, `.env.example`, README, CI bila ada). Model dibuat saat build
  image dan lewat CLI `python -m app.model.train`.
- Hapus lokasi model ganda: hanya `app/artifacts/nlp_model.pkl` (hapus
  salinan kompatibilitas di root dan fallback pemuatannya). Tulis model
  secara atomik (file sementara lalu `os.replace`).
- `/health` menyertakan info model: `trained_at`, `n_samples`,
  `classes`.

**17.5 — Pilihan model**
- Bandingkan pada CV yang sama: `SVC(kernel='linear', probability=True)`
  (sekarang), `LogisticRegression`, dan `LinearSVC` +
  `CalibratedClassifierCV`. Pilih berdasarkan macro-F1 CV dan kualitas
  kalibrasi pada smoke set; jelaskan pilihan (default Logistic Regression
  bila setara). Jangan mengubah `clean_text`/stop words tanpa bukti dari
  evaluasi.

**17.6 — Tes**
- NLP: `pytest` (`requirements-dev.txt`) untuk `clean_text`, `/predict`
  (valid, kosong → 400, terlalu panjang → 400, uncertain) dan `/health`;
  job CI NLP menjalankan pytest dan pelatihan.
- Backend Jest: pemetaan `uncertain` di `nlpClient` dan fallback kategori
  `Lainnya` di `createLaporan` (dengan mock).

**17.7 — Dokumentasi**
- README bagian "Model NLP dan batasannya": 3 kelas; dataset sintetis
  berbasis template (±478 teks unik) sehingga akurasi 100% pada split
  biasa tidak bermakna; ambang keyakinan; "Keamanan" belum punya data
  latih; cara melatih ulang (build ulang image); cara menambah data
  nyata.

**Dilarang di fase ini:** mengarang data pelaporan; menambah kelas
Keamanan ke model tanpa data nyata dari user; mengubah layout; menyentuh
`db_pengaduan`.

**Setelah selesai (laporkan per sub-bagian):** hasil audit dataset;
tabel metrik CV dan hasil smoke set; ambang yang dipilih beserta alasan;
output aktual `pytest`, `pnpm --filter backend test`, `pnpm build`;
bukti bahwa NLP dimatikan tidak lagi menghalangi pengiriman laporan.
Update status Fase 17 menjadi "MENUNGGU REVIEW" lalu berhenti.

**Definition of Done:**
- Evaluasi memakai split berkelompok dan metrik per kelas; ada smoke set
  di luar data latih dan hasilnya dilaporkan jujur.
- `/predict` punya jalur "tidak yakin"; laporan tetap terkirim dengan
  `Lainnya` saat NLP gagal atau tidak yakin.
- Tidak ada `/train` dan tidak ada `TRAIN_API_KEY` tersisa; satu lokasi
  model.
- Test NLP dan backend lulus; README menjelaskan batasan model.

**Backlog (belum dijadwalkan, butuh keputusan atau data dari user):**
lapisan service/repository, `middleware.ts` Next.js, `packages/shared-types`,
CSP frontend, paginasi di UI, audit log dan riwayat status, nomor tiket dan
notifikasi ke pelapor, enkripsi/masking NIK dan kebijakan retensi, reverse
proxy TLS terpasang, dan pemindahan upload ke object storage.

---

### Fase 18 - Kirim OTP Lewat SMTP Asli (Gmail App Password atau Layanan Email)

**Prasyarat:** Fase 15 sampai 17 sudah `DONE`.

**Tujuan:** Membuat kode OTP (registrasi dan lupa sandi) bisa terkirim ke
inbox penerima yang sebenarnya lewat server SMTP asli, bukan hanya
MailHog/Mailpit. MailHog tetap menjadi default untuk pengembangan. Tidak
ada perubahan logika OTP, tampilan, atau alur halaman.

**Konteks penting (hasil verifikasi ke kode dan ke log nyata):**
- Penerima OTP selalu `to: email` dari form pengguna (`register` dan
  `sendOtp` di `auth.controller.ts`). Akun di `SMTP_USER` hanya akun
  PENGIRIM. Jangan diubah menjadi penerima tetap.
- Backend membaca `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` dari
  environment. Bila `SMTP_HOST` kosong, kode jatuh ke `localhost` dengan
  port 1025 (alamat Mailpit Laragon), sehingga salah konfigurasi tidak
  menimbulkan error, hanya email masuk ke Mailpit.
- Dua cara menjalankan membaca file `.env` yang BERBEDA:
  1. `pnpm dev`: `dotenv.config()` membaca `apps/backend/.env`.
  2. `docker compose`: Compose hanya membaca `.env` di root (folder yang
     sama dengan `docker-compose.yml`), dan hanya variabel yang
     diteruskan eksplisit di blok `environment:`.
- `docker-compose.yml` (root) dan `infra/docker/docker-compose.yml`
  saat ini mengunci `SMTP_HOST: "mailhog"` dan `SMTP_PORT: 1025`, serta
  tidak meneruskan `SMTP_USER`/`SMTP_PASS`. Akibatnya `.env` apapun
  diabaikan dan OTP tetap masuk MailHog. Inilah akar masalah yang
  ditemukan di lapangan.
- `dotenv` tidak menimpa variabel yang sudah ada di environment sistem
  atau terminal. Variabel `SMTP_*` yang tertinggal di sistem mengalahkan
  `.env`.
- Alamat pengirim `noreply@sipmas.go.id` tertanam di kode. Gmail
  menggantinya dengan alamat akun pengirim, tetapi layanan seperti Brevo
  atau Resend menolak alamat pengirim yang belum terverifikasi.
- Port 587 memakai STARTTLS (Nodemailer menaikkan koneksi otomatis bila
  `secure` tidak diset), port 465 memakai TLS langsung dan butuh
  `secure: true`.

**Langkah manual user, HARUS dilakukan sebelum prompt Fase 18 dijalankan
(agent dilarang membuat, meminta, atau menulis kredensial asli):**
1. Buat App Password baru di https://myaccount.google.com/apppasswords
   (verifikasi 2 langkah harus aktif). Disarankan memakai akun Gmail
   khusus aplikasi, karena alamat akun pengirim terlihat oleh semua
   penerima OTP. Bila App Password lama pernah tertempel di chat atau
   dokumen, hapus dan buat ulang.
2. Buat `JWT_SECRET` baru (`openssl rand -base64 64`, atau perintah
   PowerShell di README). Jangan memakai nilai lama dari README atau
   compose.
3. Isi nilainya hanya di file `.env` yang tidak ter-track git: `.env`
   root untuk Docker, `apps/backend/.env` untuk `pnpm dev`.
4. Matikan proses lama yang memakai port 5001 (container `sipmas-backend`
   atau proses Node), dan hapus variabel `SMTP_*` di environment sistem
   bila ada.

**Lakukan, kerjakan berurutan dan laporkan tiap sub-bagian:**

**18.1 - Compose meneruskan SMTP dari `.env`**
- `docker-compose.yml` (root) dan `infra/docker/docker-compose.yml`,
  service `backend`: ganti dua baris SMTP terkunci menjadi
  `SMTP_HOST: "${SMTP_HOST:-mailhog}"`,
  `SMTP_PORT: "${SMTP_PORT:-1025}"`, `SMTP_USER: "${SMTP_USER:-}"`,
  `SMTP_PASS: "${SMTP_PASS:-}"`, `SMTP_FROM: "${SMTP_FROM:-}"`. Tanpa
  isian di `.env`, perilaku tetap MailHog seperti sekarang.
- `infra/docker/docker-compose.prod.yml`: tambahkan `SMTP_FROM` dengan
  pola yang sama (`:-` kosong). `SMTP_HOST` prod tetap wajib (`:?`).
  Jangan ubah baris lain.
- Bukti: `docker compose config` (jangan tempel hasilnya ke laporan,
  karena memuat secret) menunjukkan `SMTP_HOST` berubah sesuai `.env`
  uji; tanpa isian kembali ke `mailhog`.

**18.2 - Satu modul pengirim email**
- Buat `apps/backend/src/lib/mailer.ts` berisi `createMailTransport()`
  dan `getMailFrom(label)`. Transport: `host` dari `SMTP_HOST` (fallback
  `localhost` seperti sekarang), `port` dari `SMTP_PORT` (fallback 1025),
  `secure: true` hanya bila port 465, `auth` hanya bila `SMTP_USER` dan
  `SMTP_PASS` keduanya terisi, serta `connectionTimeout`,
  `greetingTimeout`, dan `socketTimeout` sekitar 10 detik agar permintaan
  tidak menggantung. `getMailFrom` memakai `SMTP_FROM` bila diisi, bila
  tidak memakai `"<label>" <noreply@sipmas.go.id>` seperti sekarang.
- `auth.controller.ts`: `register` dan `sendOtp` memakai modul ini
  menggantikan dua blok `createTransport` yang duplikat. Isi email,
  subjek, `to: email`, hash OTP, dan batas percobaan TIDAK diubah.
- Jangan pernah mencatat `SMTP_PASS` atau isi email di log; log hanya
  memuat `maskEmail(email)` seperti sekarang. Bila `sendMail` gagal, log
  pesan error Nodemailer (tanpa kredensial) dan balas pesan generik ke
  klien, tanpa membocorkan detail SMTP.
- Test Jest `src/__tests__/mailer.test.ts`: `secure` true hanya di port
  465; `auth` tidak dipasang bila user atau pass kosong; `SMTP_FROM`
  dipakai bila ada dan fallback bila kosong; fallback host ke localhost.

**18.3 - Dokumentasi dan contoh env**
- `.env.example` (root dan `apps/backend/`): blok SMTP diberi komentar
  jelas: nilai default MailHog untuk dev, contoh Gmail
  (`smtp.gmail.com`, 587, `SMTP_USER`, `SMTP_PASS` = App Password tanpa
  spasi), `SMTP_FROM` opsional. Isi hanya placeholder, DILARANG menulis
  email atau password asli di file contoh.
- `README.md`: bagian baru "Mengirim OTP ke email asli": jelaskan
  perbedaan `.env` untuk `pnpm dev` (di `apps/backend/`) dan untuk Docker
  (di root), cara membuat App Password, perintah
  `docker compose up -d --force-recreate backend` (restart biasa tidak
  membaca env baru), bahwa mode `tsx watch` tidak memantau `.env` sehingga
  perlu restart manual, tabel gejala dan penyebab (OTP masuk Mailpit,
  "Terjadi kesalahan jaringan", `FATAL: JWT_SECRET`, `EADDRINUSE`,
  `Invalid login`), batas Gmail sekitar 500 email per hari, dan saran
  layanan email transaksional (Brevo, Resend, Mailgun dengan SPF/DKIM)
  untuk produksi publik.
- Halaman monitoring: label SMTP tetap seperti sekarang (hanya
  tampilan), tidak perlu diubah.

**Dilarang di fase ini:**
- Menulis, meminta, mencetak, atau meng-commit kredensial SMTP, App
  Password, atau secret asli (termasuk di `.env.example`, README, log,
  dan laporan).
- Mengubah logika OTP (pembuatan, hash, kedaluwarsa, batas percobaan),
  teks email, penerima, atau menambah penerima tetap.
- Mengubah UI/UX, `schema.prisma`, atau menyentuh `db_pengaduan`.
- Menjalankan `docker compose down -v`, mereset database, atau perintah
  Prisma yang berisiko (lihat aturan Fase 15.2).
- Menghapus MailHog dari compose dev. Ia tetap menjadi default.

**Setelah selesai (laporkan per sub-bagian):**
1. Ringkasan perubahan per file.
2. Output aktual `pnpm --filter backend test` (termasuk `mailer.test.ts`)
   dan `pnpm build`.
3. Bukti 18.1: dengan `.env` uji yang berisi nilai SMTP palsu non-rahasia,
   `docker compose config` menunjukkan `SMTP_HOST` terisi dari `.env`;
   tanpa isian, nilainya `mailhog`. Jangan tempel keluaran penuh.
4. Bukti default tetap aman: tanpa isian SMTP, OTP registrasi masih
   tertangkap di UI MailHog.
5. Pengiriman ke Gmail asli dilakukan dan diverifikasi OLEH USER di
   inboxnya sendiri. Agent hanya melaporkan bahwa jalur kode siap.
6. Update status Fase 18 di `AGENTS.md` menjadi "MENUNGGU REVIEW" lalu
   berhenti dan tunggu review saya.

**Definition of Done:**
- Isi `.env` (root untuk Docker, `apps/backend/` untuk `pnpm dev`)
  menentukan server SMTP yang dipakai; tanpa isian tetap MailHog.
- Penerima OTP tetap alamat yang diketik pengguna, pengirim bisa diatur
  lewat `SMTP_FROM`.
- Satu modul pengirim email dipakai kedua alur, dengan timeout dan
  tanpa kebocoran kredensial di log.
- Tidak ada kredensial asli di file ter-track git.
- Semua test lulus dan `pnpm build` sukses.

---

### Fase 19 - Pembersihan Akhir Sebelum Hosting

**Prasyarat:** Fase 16, 17, dan 18 sudah direview user. Ini fase penutup
pengembangan sebelum aplikasi dipresentasikan dan dihosting.

**Tujuan:** Merapikan repo tanpa mengubah perilaku atau tampilan
aplikasi: mengamankan pekerjaan yang belum di-commit, menghapus berkas
dan baris kode yang terbukti tidak dipakai, membuang dependency mati,
dan membetulkan dokumentasi yang salah. Prinsipnya: lebih baik
melewatkan satu kandidat daripada menghapus sesuatu yang ternyata
dipakai. Setiap penghapusan harus punya bukti, bukan dugaan.

**Hasil audit (diverifikasi langsung ke repo, bukan tebakan):**
- **Pekerjaan belum di-commit:** sekitar 92 perubahan (berkas
  dimodifikasi, dihapus, dan belum ter-track) hasil Fase 15 sampai 18
  belum pernah di-commit. Commit terakhir masih perubahan gaya halaman
  login. Hosting biasanya mengambil kode dari git, jadi tanpa commit
  seluruh pengerasan keamanan tidak ikut ter-deploy. Ini prioritas
  pertama dan juga jaring pengaman untuk pembersihan berikutnya.
- **Aset frontend tanpa rujukan** (grep di `apps/frontend/src` dan
  `next.config.mjs` = 0 hasil): `file.svg`, `globe.svg`, `next.svg`,
  `vercel.svg`, `window.svg` (bawaan `create-next-app`) dan
  `HERO_SECTION.jpg` (halaman kini memakai `SIPMAS.jpg` dan `login.jpg`).
- **Import dan variabel tidak terpakai** (`tsc --noUnusedLocals`):
  - Frontend, semuanya ikon `lucide-react` yang diimpor tapi tidak
    dirender: `admin/analytics/page.tsx` (Calendar, LayoutGrid),
    `admin/complaints/page.tsx` (Loader2, Filter), `admin/layout.tsx`
    (Search, Bell, Settings, HelpCircle), `admin/page.tsx` (Loader2,
    Play), `admin/reports/page.tsx` (Loader2, Calendar, FileText),
    `admin/users/page.tsx` (Loader2, Users, ShieldAlert),
    `login/page.tsx` (EyeOff, ArrowRight), `lupa-sandi/page.tsx`
    (KeyRound), `user/statistik/page.tsx` (BarChart3, MapPin, Loader2).
  - Backend: import `AuthUser` di `middlewares/authGuard.ts`, import
    `path` di `services/storageService.ts`, dan fungsi ekspor
    `clearAnalyticsCache` di `admin.controller.ts` yang tidak dipanggil
    di mana pun.
- **Dependency mati:** `flask-cors==6.0.5` di
  `apps/nlp-service/requirements.txt`, padahal `app/main.py` tidak lagi
  mengimpornya sejak CORS dihapus.
- **Dokumentasi salah:** `README.md` bagian "Kategori Keamanan &
  Kesehatan" menyebut kategori "Kesehatan" dan "Pelayanan Publik". Kode
  (`validate.ts`, `admin.controller.ts`, `page.tsx`) hanya mengenal 5
  kategori: Infrastruktur, Lingkungan, Keamanan, Pelayanan, Lainnya.
- **Sisa lokal yang tidak ter-track git** (aman dihapus dari disk, tidak
  memengaruhi repo): `next-env.d.ts` di root (sisa sebelum monorepo,
  sudah di-gitignore), folder kosong `public/` di root,
  `packages/public/`, dan `scratch/`.

**Sengaja DIPERTAHANKAN (jangan dihapus walau terlihat tidak aktif):**
- `apps/backend/src/services/storageService.ts` dan `@aws-sdk/client-s3`:
  dormant sesuai keputusan Fase 11, disiapkan untuk object storage nanti.
- `packages/.gitkeep`: tempat `shared-types` di backlog.
- `apps/nlp-service/app.py`, `train.py`, `wsgi.py`: entrypoint tipis yang
  masih dipakai (dev server, CLI training, Gunicorn).
- Seluruh folder `prisma/migrations/`: riwayat skema, tidak boleh
  dihapus atau digabung.
- `backups/`: berisi data asli `db_sipmas`, sudah di-gitignore.
- `apps/nlp-service/dataset/dataset_pengaduan_masyarakat_3000.csv`:
  arsip dataset mentah.
- `console.error` di `monitoring.controller.ts`: bagian dari skrip
  browser di halaman monitoring, bukan log server.
- `.env.example` (root dan backend) dan MailHog di compose dev.

**Langkah manual user sebelum menjalankan prompt Fase 19:**
1. Pastikan `.env` root dan `apps/backend/.env` sudah memakai secret
   baru: `JWT_SECRET` hasil generate (bukan nilai lama dari README) dan
   App Password Gmail baru (yang lama sempat tertempel di chat).
2. Tentukan apakah Fase 16, 17, dan 18 disetujui menjadi `DONE`. Agent
   hanya mengubah status bila diberi tahu.
3. Matikan `pnpm dev` dan container yang sedang jalan agar build dan
   test berjalan bersih.

**Lakukan, kerjakan berurutan dan laporkan tiap sub-bagian:**

**19.0 - Amankan kondisi sekarang ke git (wajib pertama)**
- Sebelum commit: pastikan `git ls-files` tidak memuat `.env`,
  `apps/backend/.env`, `apps/frontend/.env`, isi `backups/`, atau foto di
  `apps/backend/public/uploads/` (kecuali `.gitkeep`). Jalankan
  `git grep` untuk nilai `JWT_SECRET` dan `SMTP_PASS` dari `.env` lewat
  shell tanpa menampilkan nilainya; laporkan hanya jumlah hasil (harus
  0). Bila tersedia, jalankan gitleaks pada working tree.
- Commit perubahan Fase 15 sampai 18 dalam beberapa commit kecil
  bertema (misalnya keamanan backend, migration, NLP, Docker/CI,
  dokumentasi), bukan satu commit raksasa. Penghapusan foto upload dari
  index git (Fase 15.7) ikut di-commit; file di disk tidak disentuh.
- JANGAN push, force-push, atau menulis ulang riwayat. Push adalah
  keputusan user.

**19.1 - Hapus berkas tidak terpakai**
- Sebelum menghapus tiap berkas, ulangi grep nama berkas ke seluruh repo
  (kecuali `node_modules`, `.next`, `.git`) dan tempel hasilnya. Hapus
  hanya bila 0 rujukan.
- Hapus 5 SVG bawaan dan `HERO_SECTION.jpg` dari `apps/frontend/public/`
  dengan `git rm` (tetap tersimpan di riwayat git bila dibutuhkan lagi).
- Hapus sisa lokal yang tidak ter-track: `next-env.d.ts` root, folder
  kosong `public/` root, `packages/public/`, dan `scratch/`. Pastikan
  dulu folder-folder itu benar-benar kosong.
- Bila menemukan kandidat lain di luar daftar audit, JANGAN langsung
  dihapus: masukkan ke laporan sebagai saran dan tunggu keputusan user.

**19.2 - Hapus import dan kode mati**
- Hapus hanya nama-nama di daftar audit dari baris `import` masing-masing.
  JSX, className, teks, urutan elemen, dan logika tidak berubah sama
  sekali. Bila satu baris import menjadi kosong, hapus barisnya.
- Hapus import `AuthUser` (authGuard) dan `path` (storageService), serta
  fungsi `clearAnalyticsCache` beserta komentarnya bila ada. Struktur
  cache analytics dan TTL 60 detik tetap seperti sekarang.
- Bukti: `npx tsc --noEmit --noUnusedLocals` di frontend dan backend
  tidak lagi melaporkan TS6133 untuk berkas `src/` (berkas test boleh
  dikecualikan).

**19.3 - Dependency**
- Hapus `flask-cors` dari `apps/nlp-service/requirements.txt`. Pastikan
  `pip install -r requirements-dev.txt` dan `pytest` tetap lulus, dan
  image NLP tetap ter-build.
- Jalankan pemeriksaan dependency JavaScript yang tidak terpakai
  (misalnya `pnpm dlx knip` atau `pnpm dlx depcheck`) HANYA sebagai
  laporan. Jangan menghapus paket JavaScript berdasarkan alat itu tanpa
  persetujuan user, karena sering salah mendeteksi paket yang dipakai
  lewat konfigurasi atau Docker.

**19.4 - Dokumentasi**
- `README.md`: perbaiki bagian kategori menjadi 5 kategori yang benar
  (Infrastruktur, Lingkungan, Keamanan, Pelayanan, Lainnya); jelaskan
  model hanya mengenal 3 kelas (Infrastruktur, Lingkungan, Pelayanan),
  sedangkan Keamanan belum punya data latih. Hapus penyebutan
  "Kesehatan" dan "Pelayanan Publik" sebagai nama kategori.
- Pastikan README tidak lagi merujuk berkas yang dihapus di 19.1, dan
  bagian struktur folder sesuai kondisi akhir.

**19.5 - Verifikasi akhir**
- Jalankan dan tempel output aktual: `pnpm install --frozen-lockfile`,
  `pnpm build`, `pnpm --filter backend test`, `pytest` di
  `apps/nlp-service`, dan `docker compose build`.
- Smoke test manual: halaman utama, daftar (OTP masuk MailHog atau email
  asli sesuai `.env`), login, kirim laporan dengan foto, riwayat,
  statistik, dashboard admin, ubah status laporan, halaman monitoring
  admin. Bandingkan tampilan sebelum dan sesudah: harus identik.
- `git status` bersih setelah semua commit Fase 19. Jalankan ulang cek
  secret di 19.0 (hasil tetap 0).

**19.6 - Status**
- Ubah status Fase 16, 17, dan 18 menjadi `DONE` HANYA bila user
  menyatakannya di prompt. Ubah status Fase 19 menjadi
  `MENUNGGU REVIEW`.

**Dilarang di fase ini:**
- Mengubah UI/UX, teks, alur halaman, atau perilaku aplikasi apa pun.
  Pembersihan hanya boleh menghapus yang terbukti tidak dipakai.
- Menghapus berkas di daftar "Sengaja DIPERTAHANKAN".
- Menghapus atau mengubah migration, `schema.prisma`, dataset NLP, atau
  model terlatih.
- Menyentuh `db_pengaduan`, menjalankan perintah reset database, atau
  `docker compose down -v`.
- Push, force-push, menulis ulang riwayat git, atau meng-commit secret.
- Menambah fitur, refactor besar, atau mengerjakan item backlog.

**Setelah selesai:** laporkan per sub-bagian (daftar berkas dihapus
beserta bukti grep, daftar baris import yang dihapus, hasil semua
perintah verifikasi, daftar commit yang dibuat, kandidat lain yang
disarankan tapi tidak dihapus), update status di `AGENTS.md`, lalu
berhenti dan tunggu review saya.

**Definition of Done:**
- Seluruh pekerjaan Fase 15 sampai 19 tersimpan dalam commit kecil yang
  rapi, tanpa secret, `git status` bersih.
- Tidak ada aset, import, fungsi, atau dependency Python yang terbukti
  tidak dipakai tersisa dari daftar audit.
- README sesuai kode (kategori benar).
- Build, test backend, pytest, dan build Docker lulus; tampilan dan
  perilaku aplikasi identik dengan sebelum fase ini.

---

### Fase 20 - Perbaikan Tertunda dan Penyederhanaan Menjadi 3 Kategori

**Prasyarat:** Fase 19 sudah selesai dan repo sudah di-push ke GitHub.
Pengembangan sempat dihentikan untuk presentasi; fase ini dibuka kembali
atas keputusan user.

**Tujuan:** (1) menyelesaikan kekurangan kecil yang ditemukan setelah
Fase 19 (CI rusak, teks laporan audit rusak, peringatan Prisma dan Jest,
favicon bawaan, foto upload belum ikut dicadangkan); (2) menyederhanakan
kategori laporan sesuai keputusan user: **hanya 3 kategori resmi, yaitu
Infrastruktur, Lingkungan, dan Pelayanan**, ditambah **Lainnya** sebagai
kategori cadangan sistem (bukan pilihan resmi). Dengan begitu kategori
aplikasi selaras dengan model NLP yang memang hanya mengenal 3 kelas.

**Hasil audit (diverifikasi langsung ke repo, bukan tebakan):**
- **`.github/workflows/ci.yml` tidak valid sebagai YAML.** Baris
  `monorepo-lint-and-build:` bergeser menjadi 4 spasi dan
  `DATABASE_URL` di bawah `env:` tidak menjorok, sehingga parser YAML
  gagal ("expected block end"). GitHub akan menolak seluruh workflow
  ("Invalid workflow file"), jadi CI tidak berjalan sama sekali.
- **`apps/nlp-service/scripts/audit_dataset.py` (perubahan lokal belum
  di-commit):** penghapusan kata fase membuat teks laporan menjadi
  "dalam rangka **0 SIPMAS**". Bila skrip dijalankan ulang,
  `dataset_audit.md` ikut memuat teks rusak itu.
- **Peringatan Prisma:** `package.json#prisma` (berisi perintah seed)
  sudah deprecated dan akan dihapus di Prisma 7.
- **Peringatan Jest:** "A worker process has failed to exit gracefully"
  di akhir `pnpm --filter backend test` (semua 59 test tetap lulus).
- **Favicon** masih ikon bawaan Next.js (`apps/frontend/src/app/favicon.ico`).
- **Foto upload tidak dicadangkan:** `infra/scripts/backup-db.sh` hanya
  membackup database, padahal foto laporan disimpan di disk
  (`apps/backend/public/uploads/` di dev, volume `prod_backend_uploads`
  di produksi).
- **Kategori "Keamanan" masih ada di kode**, padahal model tidak punya
  kelasnya:
  - Backend: `middlewares/validate.ts` (daftar `allowed`),
    `modules/admin/admin.controller.ts` (`normalizeCategory`,
    `kategoriCount`, cabang `KEAMANAN` dan istilah keamanan/ketertiban
    di cabang `LAINNYA` pada `buildSqlQueryConditions`),
    `scripts/verify-analytics-equivalence.ts`, `scripts/backfill-laporan.ts`.
  - Frontend: `admin/complaints/page.tsx` (pemetaan "Ketertiban &
    Keamanan" dan opsi filter `KEAMANAN`), `admin/reports/page.tsx`
    (pemetaan dan opsi filter), `admin/analytics/page.tsx` (opsi filter),
    `user/riwayat/page.tsx` (pemetaan "Ketertiban & Keamanan").
  - Teks "Verifikasi Keamanan" di `lupa-sandi/page.tsx` dan label pengirim
    email "SIPMAS Keamanan" BUKAN kategori; jangan diubah.

**Keputusan yang sudah diambil user (jangan ditawar ulang):**
- Kategori resmi: Infrastruktur, Lingkungan, Pelayanan.
- "Lainnya" tetap ada sebagai penampung otomatis: dipakai bila NLP tidak
  yakin (di bawah `NLP_MIN_CONFIDENCE`), layanan NLP mati, atau kategori
  dari klien di luar daftar putih. Laporan warga tidak boleh terblokir.
- Laporan lama berkategori Keamanan/Ketertiban dipindahkan ke "Lainnya".
- Model NLP, dataset, dan `metrics.json` TIDAK diubah (sudah 3 kelas).

**Langkah manual user sebelum menjalankan prompt Fase 20:**
1. Pastikan `AGENTS.md` dan `PROMPTS.md` ada di root repo lokal. Karena
   `AGENTS.md` sudah dikeluarkan dari git, tambahkan keduanya ke
   `.git/info/exclude` agar tidak ikut ter-commit (lihat catatan di
   `PROMPTS.md`).
2. Backup database dulu: `bash infra/scripts/backup-db.sh` (fase ini
   memuat migration data).
3. Matikan `pnpm dev` dan container yang sedang jalan.

**Lakukan, kerjakan berurutan dan laporkan tiap sub-bagian:**

**20.0 - Perbaikan CI dan teks audit (wajib pertama)**
- Perbaiki indentasi awal job pertama di `ci.yml` menjadi: dua spasi
  sebelum `monorepo-lint-and-build:`, empat spasi sebelum `runs-on`,
  `name`, `env`, dan `steps`, serta enam spasi sebelum
  `DATABASE_URL: mysql://build:build@localhost:3306/build`. Tambahkan
  baris baru di akhir berkas. Langkah `Generate Prisma Client` tetap ada.
- Bukti: parse berkas dengan parser YAML (misalnya
  `python -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"`)
  dan tempel daftar job yang terbaca (harus 3 job).
- Di `audit_dataset.py`, ganti "dalam rangka **0 SIPMAS**" menjadi
  "dalam rangka audit dataset SIPMAS". Jangan jalankan ulang skrip itu
  dan jangan ubah `dataset_audit.md` maupun `dataset_training.csv`.
- Commit terpisah untuk masing-masing.

**20.1 - Peringatan Prisma dan Jest**
- Pindahkan perintah seed dari `package.json#prisma` ke `prisma.config.ts`
  (`migrations.seed`) HANYA bila versi Prisma terpasang mendukungnya.
  Bukti: `pnpm --filter backend exec prisma db seed` tetap berjalan dan
  peringatan deprecated hilang. Bila belum didukung, jangan diubah dan
  laporkan alasannya.
- Cari penyebab "worker process has failed to exit gracefully" dengan
  `jest --detectOpenHandles`. Perbaiki di sisi test (misalnya menutup
  timer/koneksi di `afterAll`, atau `.unref()` pada timer), bukan dengan
  mengubah perilaku kode produksi. Bila penyebabnya ada di kode produksi
  (misalnya interval cache), boleh `.unref()` selama perilaku sama.
  Jangan menambahkan `--forceExit`.

**20.2 - Favicon**
- Ganti favicon bawaan Next.js dengan ikon dari `LOGO.png` (misalnya
  `apps/frontend/src/app/icon.png` hasil resize persegi, lalu hapus
  `favicon.ico` bawaan). Ini satu-satunya perubahan visual di 20.2 dan
  sudah disetujui user. Tidak ada perubahan lain pada `layout.tsx`
  selain yang diperlukan untuk ikon.

**20.3 - Backup foto upload**
- Tambah `infra/scripts/backup-uploads.sh` dengan pola yang sama seperti
  `backup-db.sh`: arsip `tar.gz` folder uploads ke `backups/`, nama berisi
  timestamp, retensi `BACKUP_RETENTION_DAYS`, enkripsi GPG opsional lewat
  `BACKUP_GPG_PASSPHRASE`. Sumber bisa folder lokal
  (`apps/backend/public/uploads`) atau volume Docker
  (`prod_backend_uploads`) lewat argumen/variabel.
- Skrip hanya MEMBACA folder uploads; tidak boleh menghapus atau
  memindahkan foto asli. `.gitkeep` boleh ikut terarsip.
- Dokumentasikan di README bagian backup.

**20.4 - Penyederhanaan menjadi 3 kategori (backend)**
- `validate.ts`: daftar putih menjadi
  `['Infrastruktur', 'Lingkungan', 'Pelayanan', 'Lainnya']`. Kategori di
  luar daftar (termasuk "Keamanan") tetap otomatis menjadi "Lainnya".
- `admin.controller.ts`:
  - `normalizeCategory`: hapus pemetaan keamanan/ketertiban, sehingga
    keduanya jatuh ke "Lainnya".
  - `kategoriCount`: hapus kunci `Keamanan`.
  - `buildSqlQueryConditions`: hapus cabang `KEAMANAN`; di cabang
    `LAINNYA`, hapus syarat `NOT LIKE '%keamanan%'` dan
    `NOT LIKE '%ketertiban%'` agar laporan lama seperti itu terhitung
    "Lainnya". Hasilnya harus konsisten dengan `normalizeCategory`.
- `scripts/verify-analytics-equivalence.ts` dan
  `scripts/backfill-laporan.ts`: samakan pemetaannya (keamanan,
  ketertiban, polisi, maling menjadi "Lainnya"). Jalankan
  `verify-analytics-equivalence.ts` terhadap `db_sipmas` dan tempel
  hasilnya (harus setara).
- **Migration data** baru (misalnya `remove_kategori_keamanan`), hanya
  berisi:
  `UPDATE Laporan SET kategori = 'Lainnya' WHERE LOWER(kategori) LIKE '%keamanan%' OR LOWER(kategori) LIKE '%ketertiban%';`
  Kolom `kategoriPrediksi` tidak disentuh (itu keluaran NLP). Tidak ada
  perubahan skema. Laporkan jumlah baris terdampak di `db_sipmas` sebelum
  dan sesudah (`SELECT kategori, COUNT(*) ... GROUP BY kategori`).
- Test: tambah kasus di `validation.test.ts` bahwa "Keamanan" dan
  "keamanan" dinormalisasi menjadi "Lainnya", dan kasus untuk
  `normalizeCategory` (keamanan/ketertiban menjadi Lainnya). Seluruh test
  lain tetap lulus.

**20.5 - Penyederhanaan menjadi 3 kategori (frontend)**
- Perubahan UI berikut sudah disetujui user dan hanya ini:
  - Hapus opsi filter `KEAMANAN` di `admin/complaints/page.tsx`,
    `admin/reports/page.tsx`, dan `admin/analytics/page.tsx`. Opsi lain,
    urutannya, dan gayanya tetap.
  - Hapus pemetaan "ketertiban" menjadi "Ketertiban & Keamanan" di
    `admin/complaints/page.tsx` dan `user/riwayat/page.tsx`, serta
    pemetaan keamanan di `admin/reports/page.tsx`, sehingga kategori
    tersebut tampil sebagai "Lainnya".
- Jangan ubah teks "Verifikasi Keamanan" di `lupa-sandi/page.tsx`.
- Halaman utama (`page.tsx`) tidak perlu diubah karena kategori di sana
  berasal dari NLP (3 kelas) atau "lainnya".

**20.6 - Dokumentasi**
- README bagian "Kategori Laporan & Cakupan Model NLP": 3 kategori resmi
  (Infrastruktur, Lingkungan, Pelayanan) sesuai 3 kelas model, ditambah
  "Lainnya" sebagai penampung otomatis (NLP tidak yakin, NLP mati, atau
  kategori di luar daftar). Hapus kalimat "Keamanan belum punya data
  latih".
- README bagian backup: tambahkan `backup-uploads.sh` (20.3).
- README bagian CI (bila ada): sebutkan `DATABASE_URL` tiruan di level
  job dan langkah `prisma generate`.

**20.7 - Verifikasi akhir**
- Tempel output aktual: `pnpm install --frozen-lockfile`, `pnpm lint`,
  `pnpm build`, `pnpm --filter backend test` (tanpa peringatan worker),
  `pytest` di `apps/nlp-service`, `docker compose build`, dan parse YAML
  `ci.yml`.
- Smoke test manual: kirim laporan (kategori otomatis tetap tampil),
  riwayat, dashboard dan analitik admin (filter kategori tinggal
  Infrastruktur, Lingkungan, Pelayanan, Lainnya), laporan admin, favicon
  baru terlihat di tab browser.
- Setelah push oleh user, tab Actions harus menjalankan ketiga job.

**Dilarang di fase ini:**
- Mengubah UI/UX selain yang disebut eksplisit di 20.2 dan 20.5.
- Mengubah model NLP, dataset, `metrics.json`, atau menjalankan ulang
  `audit_dataset.py`.
- Menghapus atau mengedit migration lama.
- Menyentuh `db_pengaduan`, reset database, atau `docker compose down -v`.
- Mengerjakan fitur bukti penyelesaian (itu Fase 21).
- Push, force-push, menulis ulang riwayat git, atau meng-commit secret,
  `AGENTS.md`, maupun `PROMPTS.md`.

**Setelah selesai:** laporkan per sub-bagian (hasil parse YAML, perubahan
per berkas, jumlah baris terdampak migration, hasil verifikasi, daftar
commit), ubah status Fase 20 di `AGENTS.md` menjadi `MENUNGGU REVIEW`,
lalu berhenti.

**Definition of Done:**
- `ci.yml` valid dan memuat 3 job; teks audit benar.
- Tidak ada lagi kategori Keamanan di kode aplikasi (kecuali teks
  non-kategori yang disebut di atas); data lama sudah menjadi "Lainnya".
- Test backend lulus tanpa peringatan worker; peringatan Prisma hilang
  atau alasannya dilaporkan.
- Favicon SIPMAS tampil; skrip backup foto tersedia dan terdokumentasi.
- Tampilan lain identik dengan sebelum fase ini.

---

### Fase 21 - Bukti Penyelesaian Laporan untuk Pelapor

**Prasyarat:** Fase 20 sudah direview dan disetujui user.

**Masalah yang ditemukan user (dari sisi penggunaan, bukan kode):** saat
laporan dinyatakan selesai, pelapor hanya melihat label "Selesai" tanpa
bukti atau penjelasan apa pun. Diverifikasi di kode: tabel `Laporan`
hanya punya kolom `foto` (foto dari pelapor), dan
`PATCH /api/admin/laporan` hanya menerima `{ id, status }`. Tidak ada
tempat untuk tanggapan, foto hasil pekerjaan, atau waktu penyelesaian.

**Keputusan rancangan yang sudah disetujui user:**
- **Tanggapan tertulis WAJIB** setiap kali laporan diselesaikan, apa pun
  kategorinya. Ini bukti utama, karena laporan kategori Pelayanan
  (misalnya kinerja administrasi instansi) tidak punya objek fisik yang
  bisa difoto.
- **Foto bukti OPSIONAL.** Biasanya diisi untuk Infrastruktur dan
  Lingkungan (foto sesudah perbaikan), boleh dikosongkan untuk Pelayanan.
- **Waktu penyelesaian dicatat otomatis.**
- Pelapor melihat tanggapan, tanggal selesai, dan foto bukti (bila ada)
  di halaman riwayat, berdampingan dengan foto laporannya sendiri.

**Lakukan, kerjakan berurutan dan laporkan tiap sub-bagian:**

**21.1 - Database (migration additif)**
- Tambah tiga kolom opsional di model `Laporan`:
  - `catatanSelesai String? @db.Text` (tanggapan/tindak lanjut admin),
  - `fotoSelesai String?` (path foto bukti, format sama dengan `foto`,
    yaitu `/uploads/<uuid>.<ext>`),
  - `selesaiAt DateTime?` (waktu dinyatakan selesai).
- Buat migration baru dengan `prisma migrate dev --create-only`, periksa
  SQL-nya hanya berisi `ALTER TABLE ... ADD COLUMN`, lalu terapkan.
- Laporan lama yang sudah SELESAI dibiarkan dengan nilai NULL (tidak
  di-backfill).

**21.2 - Backend: endpoint penyelesaian**
- Route baru di `admin.routes.ts` (sudah di bawah
  `authGuard + roleGuard('ADMIN')`):
  `POST /api/admin/laporan/:id/selesai`, multipart/form-data dengan
  field `catatanSelesai` (wajib) dan `foto` (opsional). Rantai
  middleware: `validateUpload` (pengamanan yang sama: magic bytes, sharp,
  buang EXIF/GPS, nama UUID, maks 5MB) lalu `validate(selesaikanLaporanSchema)`
  lalu controller `selesaikanLaporan`.
- Skema zod `selesaikanLaporanSchema` di `validate.ts`:
  `catatanSelesai` string, di-trim, minimal 10 dan maksimal 2000
  karakter, dengan pesan error berbahasa Indonesia. `id` dari
  `req.params` divalidasi sebagai integer positif (di controller atau
  skema terpisah).
- Controller `selesaikanLaporan` di `admin.controller.ts`:
  1. Laporan tidak ada: 404 "Laporan tidak ditemukan."
  2. Laporan sudah `SELESAI`: 409 "Laporan sudah diselesaikan."
  3. Bila ada `req.file`, simpan lewat `storageService.upload` (sama
     seperti `createLaporan`).
  4. Satu `prisma.laporan.update`: `status: 'SELESAI'`,
     `catatanSelesai`, `fotoSelesai` (atau null), `selesaiAt: new Date()`.
  5. Bila update gagal setelah foto tersimpan, hapus foto itu
     (best effort, catat di log tanpa data pribadi).
  6. Balas 200 dengan laporan terbaru.
  7. Log memakai `logger`, tanpa mencatat isi tanggapan.
- `PATCH /api/admin/laporan` (ubah status biasa):
  - `patchLaporanStatusSchema` hanya menerima `PENDING` dan `PROSES`.
    Permintaan status `SELESAI` lewat endpoint ini ditolak 400 dengan
    pesan yang mengarahkan ke form penyelesaian.
  - Laporan yang sudah `SELESAI` tidak boleh diubah statusnya lewat
    endpoint ini (409). Membuka kembali laporan selesai adalah backlog,
    bukan scope fase ini.
- Akses foto `GET /uploads/:filename` di `server.ts`: warga diizinkan
  bila nama file cocok dengan `foto` ATAU `fotoSelesai` pada laporan
  miliknya (`userId` sama). Admin tetap boleh semua. Selain itu tetap 404.
- `GET /api/riwayat` dan `GET /api/admin/laporan` otomatis ikut
  mengembalikan kolom baru; pastikan riwayat tetap hanya mengembalikan
  laporan milik `req.user.id`.
- Analitik dan statistik publik TIDAK berubah dan tidak boleh
  mengembalikan `catatanSelesai` atau `fotoSelesai`.

**21.3 - Backend: test**
- Berkas test baru (misalnya `penyelesaian.test.ts`), minimal:
  tanpa catatan ditolak 400; catatan kurang dari 10 karakter ditolak 400;
  laporan tidak ada 404; laporan sudah selesai 409; berhasil tanpa foto
  (`fotoSelesai` null, `selesaiAt` terisi, status SELESAI); berhasil
  dengan foto; PATCH status `SELESAI` ditolak 400; PATCH pada laporan
  yang sudah selesai ditolak 409; warga pemilik boleh mengakses
  `fotoSelesai`; warga lain mendapat 404.
- Sesuaikan test lama yang mengharapkan `patchLaporanStatusSchema`
  menerima `SELESAI`.
- Database tetap di-mock seperti test lain.

**21.4 - Frontend admin (perubahan UI yang disetujui)**
- Di `admin/complaints/page.tsx`, tombol "SELESAI" (di daftar dan di
  modal detail) tidak lagi langsung mengubah status. Tombol itu membuka
  form penyelesaian berisi:
  - kolom teks wajib "Tanggapan / tindak lanjut" (10 sampai 2000
    karakter, dengan penghitung karakter),
  - unggah foto bukti opsional (JPG, PNG, WEBP, maks 5MB) dengan
    pratinjau dan keterangan "Opsional, misalnya foto hasil perbaikan",
  - tombol "Batal" dan "Simpan & Selesaikan" (nonaktif selama
    mengirim, tampilkan pesan error dari backend bila gagal).
- Form memakai gaya modal yang sudah ada di halaman itu (warna, radius,
  tipografi, ikon `lucide-react` yang sudah dipakai), responsif di
  mobile sesuai pola Fase 13. Kirim sebagai `FormData` dengan
  `credentials` yang sama seperti panggilan API lain.
- Setelah berhasil, status di daftar dan modal diperbarui tanpa reload.
- Modal detail laporan yang sudah selesai menampilkan tanggapan, tanggal
  selesai, dan foto bukti bila ada.
- Tombol "PROSES" dan alur lain tidak berubah.

**21.5 - Frontend pelapor (perubahan UI yang disetujui)**
- Di `user/riwayat/page.tsx`, laporan berstatus SELESAI menampilkan
  bagian "Tanggapan Penyelesaian": teks tanggapan, tanggal selesai
  (format tanggal Indonesia seperti yang sudah dipakai di halaman), dan
  foto bukti bila ada.
- Bila laporan punya foto awal dan foto bukti, tampilkan berdampingan
  dengan label "Sebelum" dan "Sesudah" (bertumpuk di mobile).
- Laporan selesai yang dibuat sebelum fitur ini (tanpa tanggapan)
  menampilkan keterangan singkat "Belum ada tanggapan tercatat." Tidak
  ada perubahan lain pada halaman riwayat.

**21.6 - Dokumentasi**
- README: jelaskan alur penyelesaian (tanggapan wajib, foto opsional),
  endpoint baru, dan aturan akses foto bukti.

**21.7 - Verifikasi akhir**
- Tempel output aktual: `pnpm lint`, `pnpm build`,
  `pnpm --filter backend test`, `prisma migrate status`, dan
  `docker compose build`.
- Smoke test manual dengan dua akun warga dan satu admin:
  1. Warga A kirim laporan Infrastruktur dengan foto; admin selesaikan
     dengan tanggapan dan foto bukti; warga A melihat "Sebelum" dan
     "Sesudah" serta tanggapannya.
  2. Warga A kirim laporan Pelayanan tanpa foto; admin selesaikan dengan
     tanggapan saja; warga A melihat tanggapan tanpa foto.
  3. Warga B tidak bisa membuka URL foto bukti milik warga A (404).
  4. Mencoba menyelesaikan tanpa tanggapan ditolak, dan laporan yang
     sudah selesai tidak bisa diselesaikan ulang.

**Dilarang di fase ini:**
- Mengubah UI/UX selain yang disebut eksplisit di 21.4 dan 21.5.
- Mengubah migration lama, `db_pengaduan`, reset database, atau
  `docker compose down -v`.
- Menampilkan tanggapan atau foto bukti di statistik publik/analitik.
- Mengerjakan backlog terkait (buka kembali laporan, konfirmasi
  "sudah sesuai" dari pelapor, notifikasi email, audit log).
- Push, force-push, menulis ulang riwayat git, atau meng-commit secret,
  `AGENTS.md`, maupun `PROMPTS.md`.

**Setelah selesai:** laporkan per sub-bagian (SQL migration, endpoint dan
aturan validasinya, daftar test baru beserta hasilnya, tangkapan layar
atau deskripsi form admin dan tampilan riwayat, hasil verifikasi, daftar
commit), ubah status Fase 21 di `AGENTS.md` menjadi `MENUNGGU REVIEW`,
lalu berhenti.

**Definition of Done:**
- Admin tidak bisa menyelesaikan laporan tanpa tanggapan; foto bukti
  opsional dan melewati pengamanan upload yang sama.
- Pelapor melihat tanggapan, tanggal selesai, dan foto bukti (bila ada)
  di riwayat; foto bukti hanya bisa dibuka pemilik laporan dan admin.
- Test baru dan lama lulus; build dan Docker lulus.
- Tampilan lain identik dengan sebelum fase ini.

---

### Fase 22 - Halaman Detail Laporan untuk Pelapor

**Prasyarat:** perbaikan hasil review Fase 21 sudah selesai dan Fase 21
disetujui user.

**Masalah yang ditemukan user:** halaman `user/riwayat` menampilkan
seluruh isi laporan, foto lampiran, tanggapan penyelesaian, dan foto
Sebelum/Sesudah sekaligus di setiap kartu. Bila laporan bertambah,
halaman menjadi sangat panjang dan sulit dipindai.

**Keputusan rancangan yang disetujui user:**
- Halaman riwayat menjadi **daftar ringkas**: tiap laporan tampil sebagai
  kartu kecil tanpa foto dan tanpa isi lengkap.
- Isi lengkap, foto, dan tanggapan penyelesaian dipindah ke **halaman
  detail baru** `/user/riwayat/[id]`.

**Hasil audit (diverifikasi langsung ke repo):**
- `GET /api/riwayat` (`riwayat.controller.ts`) mengembalikan seluruh
  laporan milik `req.user.id`, belum ada endpoint untuk satu laporan.
- `user/riwayat/page.tsx` memuat fungsi bantu `parseComplaintBody`,
  `getStatusBadge`, dan `formatTanggal` yang nanti dibutuhkan juga oleh
  halaman detail.
- `Navbar.tsx` menandai menu aktif dengan `pathname === item.href`,
  sehingga di `/user/riwayat/5` menu "Riwayat" tidak akan tampak aktif.

**Lakukan, kerjakan berurutan dan laporkan tiap sub-bagian:**

**22.1 - Backend: endpoint detail milik sendiri**
- Tambah `GET /api/riwayat/:id` di `riwayat.routes.ts` dengan
  `authGuard`, controller `getRiwayatDetail` di `riwayat.controller.ts`.
- `id` harus integer positif; selain itu 400 "ID laporan tidak valid."
- Ambil dengan `prisma.laporan.findFirst({ where: { id, userId: req.user.id } })`.
  Laporan milik orang lain dan laporan yang tidak ada sama-sama dibalas
  **404** "Laporan tidak ditemukan." (jangan 403, agar keberadaan laporan
  orang lain tidak bisa ditebak).
- Kembalikan kolom yang sama seperti satu elemen di `GET /api/riwayat`.
  `GET /api/riwayat` sendiri tidak diubah.
- Test baru (misalnya `riwayatDetail.test.ts`): pemilik mendapat 200;
  laporan milik warga lain 404; laporan tidak ada 404; ID bukan angka
  400; tanpa login 401. Database di-mock seperti test lain.

**22.2 - Frontend: fungsi bantu bersama**
- Pindahkan `parseComplaintBody`, `getStatusBadge`, dan `formatTanggal`
  dari `user/riwayat/page.tsx` ke satu berkas bersama (misalnya
  `apps/frontend/src/lib/laporan-format.tsx`), lalu impor dari halaman
  riwayat dan halaman detail. Isi fungsinya tidak berubah.

**22.3 - Frontend: halaman riwayat menjadi daftar ringkas (perubahan UI yang disetujui)**
- Tiap kartu hanya berisi: badge status, kategori, tanggal kirim, judul,
  lokasi (bila ada), cuplikan isi maksimal 2 baris (`line-clamp-2`, kelas
  yang sudah dipakai di halaman admin), serta penanda kecil berupa ikon
  dan teks pendek bila laporan punya lampiran foto ("Ada lampiran") atau
  sudah ada tanggapan penyelesaian ("Ada tanggapan").
- Tidak ada foto, isi lengkap, maupun blok "Tanggapan Penyelesaian" di
  halaman daftar.
- Seluruh kartu dapat diklik (pakai `Link` ke `/user/riwayat/[id]`),
  ditambah teks "Lihat detail" dengan ikon panah di pojok kartu. Kartu
  tetap bisa diakses dengan keyboard (fokus terlihat).
- Gaya kartu, warna, radius, bayangan, tipografi, judul halaman, keadaan
  kosong ("Belum ada laporan"), dan skeleton loading mengikuti yang sudah
  ada. Kartu boleh lebih ringkas (padding lebih kecil). Tata letak mobile
  tetap rapi sesuai pola Fase 13.

**22.4 - Frontend: halaman detail baru (perubahan UI yang disetujui)**
- Berkas baru `apps/frontend/src/app/user/riwayat/[id]/page.tsx`,
  client component, mengambil data dari `GET /api/riwayat/:id` dengan
  `credentials: "include"`. Belum login: arahkan ke `/login` dengan cara
  yang sama seperti halaman riwayat.
- Isi halaman, dari atas ke bawah:
  1. Tautan "Kembali ke Riwayat" ke `/user/riwayat`.
  2. Badge status, kategori, tanggal kirim, judul, lokasi, tanggal
     kejadian (bila ada), dan isi laporan lengkap.
  3. Penanda tahapan status sederhana: Diterima (tanggal kirim), Diproses,
     Selesai (tanggal `selesaiAt` bila ada). Tahap yang sudah dilewati
     ditandai; tahap Diproses tidak diberi tanggal karena tanggal
     perubahan status tidak dicatat.
  4. Foto lampiran pelapor (bila ada), bisa diklik untuk diperbesar.
  5. Bila status SELESAI: blok "Tanggapan Penyelesaian" yang sudah ada
     sekarang (tanggapan, tanggal selesai, foto bukti, tampilan
     Sebelum/Sesudah bila keduanya ada, dan "Belum ada tanggapan
     tercatat." untuk laporan lama), dipindah apa adanya dari halaman
     riwayat. Bila foto Sebelum/Sesudah tampil, foto lampiran di poin 4
     tidak ditampilkan dua kali.
- Keadaan khusus: skeleton saat memuat; respons 404 menampilkan pesan
  "Laporan tidak ditemukan" dengan tombol kembali ke riwayat; error
  jaringan menampilkan pesan dan tombol "Coba lagi".
- Gaya mengikuti halaman riwayat (warna, kartu putih, radius, tipografi,
  ikon `lucide-react` yang sudah dipakai).

**22.5 - Navbar**
- Menu "Riwayat" tetap tampak aktif di halaman detail: ubah pengecekan
  aktif agar `/user/riwayat/...` juga dihitung milik "Riwayat" (desktop
  dan mobile). Menu lain dan tampilannya tidak berubah.

**22.6 - Dokumentasi**
- README: sebutkan halaman detail laporan dan endpoint
  `GET /api/riwayat/:id` beserta aturan aksesnya.

**22.7 - Verifikasi akhir**
- Tempel output aktual: `pnpm lint`, `pnpm build`, dan
  `pnpm --filter backend test`.
- Smoke test manual dengan dua akun warga:
  1. Warga A melihat daftar ringkas tanpa foto; penanda "Ada lampiran"
     dan "Ada tanggapan" muncul sesuai data.
  2. Klik kartu membuka detail; laporan selesai menampilkan tanggapan dan
     foto Sebelum/Sesudah; laporan Pelayanan menampilkan tanggapan saja.
  3. Warga B membuka `/user/riwayat/<id milik A>` dan mendapat "Laporan
     tidak ditemukan".
  4. Membuka URL detail dengan ID tidak ada atau bukan angka menampilkan
     pesan yang sesuai.
  5. Tampilan mobile daftar dan detail rapi; menu Riwayat tetap aktif di
     halaman detail.

**Dilarang di fase ini:**
- Mengubah UI/UX di luar 22.3, 22.4, dan 22.5 (termasuk halaman admin).
- Mengubah `GET /api/riwayat`, skema database, atau migration.
- Menambah paginasi, pencarian, atau filter di riwayat (backlog).
- Menyentuh `db_pengaduan`, reset database, atau `docker compose down -v`.
- Push, force-push, menulis ulang riwayat git, atau meng-commit secret,
  `AGENTS.md`, maupun `PROMPTS.md`.

**Setelah selesai:** laporkan per sub-bagian (endpoint dan test baru,
berkas fungsi bantu, deskripsi atau tangkapan layar daftar dan detail di
desktop dan mobile, hasil verifikasi, daftar commit), ubah status Fase
22 di `AGENTS.md` menjadi `MENUNGGU REVIEW`, lalu berhenti.

**Definition of Done:**
- Halaman riwayat berupa daftar ringkas tanpa foto dan isi lengkap.
- Halaman detail menampilkan isi lengkap, foto, tahapan status, dan
  tanggapan penyelesaian, hanya untuk pemilik laporan.
- Laporan orang lain tidak bisa dibuka lewat URL (404).
- Test, lint, dan build lulus; halaman lain identik dengan sebelumnya.

---

## 6. Cara Kerja Agent (Workflow)

1. Baca dokumen ini secara penuh.
2. Cek Bagian 4 — tentukan fase mana yang statusnya `TODO` paling awal (atau
   fase yang diminta user secara eksplisit).
3. Ubah status fase itu jadi `IN PROGRESS`.
4. Kerjakan **hanya** scope fase tersebut, sesuai batasan "Dilarang" di
   fase itu dan Aturan Bagian 0.
5. Jika ada kebutuhan yang memaksa menyentuh UI/UX di luar yang diizinkan
   fase tersebut — **STOP, jangan lakukan, tanyakan ke user dulu.**
6. Jalankan build/lint yang tersedia untuk tiap app yang tersentuh.
7. Ringkas perubahan yang dilakukan + hasil build/lint.
8. Ubah status fase jadi `MENUNGGU REVIEW`, lalu berhenti dan tunggu
   konfirmasi user sebelum lanjut ke fase berikutnya.