# Laporan Audit Kualitas Dataset Pengaduan Masyarakat
**Tanggal Audit**: 2026-10-15  
**File Sumber**: `apps/nlp-service/dataset/dataset_pengaduan_masyarakat_3000.csv`  
**File Output Training**: `apps/nlp-service/dataset/dataset_training.csv`

---

## 1. Ringkasan Eksekutif

Audit ini dilakukan dalam rangka **Fase 17.1 SIPMAS** untuk memeriksa validitas dataset pelatihan NLP.
Temuan utama:
1. **Redundansi Ekstrem**: Dari **3000** baris laporan, hanya terdapat **478** variasi teks unik setelah normalisasi (`clean_text`), membuktikan bahwa dataset dibuat secara sintetis berbasis template repetitif (nama lokasi diubah-ubah).
2. **Data Sintetis Terbukti**:
   - Pola NIK seluruhnya (3000 NIK) berawalan `3672` (kode wilayah Kota Cilegon) dengan digit acak.
   - Pola email: 3000 dari 3000 email (100.0%) mengikuti format sintetis generator nama (`nama.belakang[0-9]+@domain`).
3. **Konflik Label**: Ditemukan **0** teks yang memiliki label ganda/inkonsisten. Seluruh konflik ini **dibuang** dari dataset training agar tidak merusak pembelajaran model.
4. **Keterbatasan Kelas**: Dataset hanya mencakup **3 kategori** (`infrastruktur`, `lingkungan`, `pelayanan`), sedangkan aplikasi SIPMAS mendukung 5 kategori publik (`infrastruktur`, `lingkungan`, `pelayanan`, `kesehatan`, `keamanan`).

---

## 2. Metrik Kuantitatif Dataset Mentah

| Metrik | Nilai | Catatan |
|---|---|---|
| **Total Baris Laporan** | 3000 | 3.001 data laporan valid |
| **Teks Mentah Unik** | 478 | Berbasis variasi nama kecamatan/jalan |
| **Teks Bersih Unik (`clean_text`)** | 478 | Pola/template kalimat sesungguhnya |
| **Rasio Pengulangan Template** | 6.28x | Setiap kalimat diulang rata-rata ~6.3 kali |
| **Konflik Label** | 0 | Teks identik berlabel ambigu |

### Distribusi Kelas Dataset Mentah (3.001 baris)
- **Infrastruktur**: 1043 baris (34.8%)
- **Lingkungan**: 987 baris (32.9%)
- **Pelayanan**: 970 baris (32.3%)

---

## 3. Analisis Sintetis: NIK dan Email

### A. NIK (3000 unik dari 3000 baris)
- **Panjang NIK**: Seluruh NIK persis 16 digit numerik (3000 data).
- **Prefix Wilayah**: 100% diawali kode `3672` (3000 data).
- **Kesimpulan**: NIK dibangkitkan oleh faker/generator sintetis dengan pola template identitas.

### B. Email (2989 unik dari 3000 baris)
- **Domain**: {'gmail.com': 778, 'yahoo.com': 743, 'outlook.com': 719, 'hotmail.com': 760}
- **Format Sintetis**: 3000 baris cocok dengan regex `^[a-z]+\.[a-z]+[0-9]{1,3}@domain$`.
- **Kesimpulan**: Alamat email adalah hasil komputasi generator data sintetis.

---

## 4. Teks Konflik Label yang Dibuang (0 kasus)

Teks berikut memiliki label yang saling bertentangan pada dataset asli dan telah dibuang dari `dataset_training.csv`:
- Tidak ada konflik label.

---

## 5. Dataset Training Bersih (`dataset_training.csv`)

File `apps/nlp-service/dataset/dataset_training.csv` telah dibuat khusus untuk melatih model secara objektif tanpa data ganda:
- **Total Baris**: 478 (1 baris per teks unik tanpa konflik).
- **Kolom**: `text`, `label`.

### Distribusi Kelas Dataset Training Bersih:
- **Pelayanan**: 160 sampel (33.5%)
- **Infrastruktur**: 159 sampel (33.3%)
- **Lingkungan**: 159 sampel (33.3%)

---
*Dokumen ini dibuat otomatis oleh `apps/nlp-service/scripts/audit_dataset.py`.*
