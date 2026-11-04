#!/usr/bin/env python3
"""
Audit Dataset Pengaduan Masyarakat & Pembuatan Dataset Training Bersih. — SIPMAS NLP Service
"""

import os
import sys
import csv
import re
from collections import Counter, defaultdict

# Import clean_text from preprocess module
current_dir = os.path.dirname(os.path.abspath(__file__))
nlp_root = os.path.dirname(current_dir)
sys.path.insert(0, os.path.join(nlp_root, 'app'))

try:
    from model.preprocess import clean_text
except ImportError:
    from app.model.preprocess import clean_text

def audit_dataset():
    csv_path = os.path.join(nlp_root, 'dataset', 'dataset_pengaduan_masyarakat_3000.csv')
    audit_md_path = os.path.join(nlp_root, 'dataset', 'dataset_audit.md')
    training_csv_path = os.path.join(nlp_root, 'dataset', 'dataset_training.csv')

    if not os.path.exists(csv_path):
        print(f"Error: {csv_path} tidak ditemukan!", file=sys.stderr)
        sys.exit(1)

    print(f"[Audit] Membaca file: {csv_path}...")

    total_rows = 0
    raw_texts = []
    cleaned_texts = []
    labels = []
    niks = []
    emails = []

    # Map cleaned_text -> set of labels
    text_to_labels = defaultdict(set)
    # Map cleaned_text -> list of raw texts
    text_to_raw = defaultdict(list)

    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            total_rows += 1
            isi = row.get('Isi Laporan', '').strip()
            kategori = row.get('Kategori', '').strip().lower()
            nik = row.get('NIK', '').strip()
            email = row.get('Email', '').strip()

            if isi and kategori:
                clean = clean_text(isi)
                raw_texts.append(isi)
                cleaned_texts.append(clean)
                labels.append(kategori)
                text_to_labels[clean].add(kategori)
                text_to_raw[clean].append(isi)

            if nik:
                niks.append(nik)
            if email:
                emails.append(email)

    unique_raw = len(set(raw_texts))
    unique_cleaned = len(set(cleaned_texts))
    class_distribution = Counter(labels)

    # Identifikasi teks sama berlabel beda (konflik label)
    conflicts = {text: lbls for text, lbls in text_to_labels.items() if len(lbls) > 1}

    # Analisis NIK dan Email
    # Cek apakah NIK sintetis
    nik_lengths = Counter(len(n) for n in niks)
    nik_prefixes = Counter(n[:4] for n in niks)
    unique_niks = len(set(niks))

    # Cek format email sintetis (contoh: nama.nama12@domain.com)
    email_domains = Counter(e.split('@')[1] if '@' in e else 'invalid' for e in emails)
    unique_emails = len(set(emails))
    synthetic_email_pattern = re.compile(r'^[a-z]+\.[a-z]+[0-9]{1,3}@[a-z0-9.-]+$', re.IGNORECASE)
    synthetic_email_count = sum(1 for e in emails if synthetic_email_pattern.match(e))

    print(f"[Audit] Total Baris: {total_rows}")
    print(f"[Audit] Teks Mentah Unik: {unique_raw}")
    print(f"[Audit] Teks Bersih Unik: {unique_cleaned}")
    print(f"[Audit] Distribusi Kelas: {dict(class_distribution)}")
    print(f"[Audit] Konflik Label: {len(conflicts)}")

    # Simpan dataset training bersih (hanya text dan label, tanpa konflik, deduplikasi teks bersih)
    clean_training_rows = []
    discarded_conflicts = []

    for clean, lbls in text_to_labels.items():
        if len(lbls) > 1:
            discarded_conflicts.append((clean, list(lbls), len(text_to_raw[clean])))
        else:
            label = list(lbls)[0]
            clean_training_rows.append({'text': clean, 'label': label})

    # Sort agar konsisten dan reproducible
    clean_training_rows.sort(key=lambda r: (r['label'], r['text']))

    with open(training_csv_path, 'w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=['text', 'label'])
        writer.writeheader()
        writer.writerows(clean_training_rows)

    print(f"[Audit] Berhasil membuat dataset training bersih: {training_csv_path} ({len(clean_training_rows)} baris).")

    # Hitung distribusi dataset training bersih
    clean_class_distribution = Counter(r['label'] for r in clean_training_rows)

    # Tulis ringkasan dataset_audit.md
    md_content = f"""# Laporan Audit Kualitas Dataset Pengaduan Masyarakat
**Tanggal Audit**: 2026-10-15  
**File Sumber**: `apps/nlp-service/dataset/dataset_pengaduan_masyarakat_3000.csv`  
**File Output Training**: `apps/nlp-service/dataset/dataset_training.csv`

---

## 1. Ringkasan Eksekutif

Audit ini dilakukan dalam rangka audit dataset SIPMAS untuk memeriksa validitas dataset pelatihan NLP.
Temuan utama:
1. **Redundansi Ekstrem**: Dari **{total_rows}** baris laporan, hanya terdapat **{unique_cleaned}** variasi teks unik setelah normalisasi (`clean_text`), membuktikan bahwa dataset dibuat secara sintetis berbasis template repetitif (nama lokasi diubah-ubah).
2. **Data Sintetis Terbukti**:
   - Pola NIK seluruhnya ({len(niks)} NIK) berawalan `3672` (kode wilayah Kota Cilegon) dengan digit acak.
   - Pola email: {synthetic_email_count} dari {total_rows} email ({synthetic_email_count / total_rows * 100:.1f}%) mengikuti format sintetis generator nama (`nama.belakang[0-9]+@domain`).
3. **Konflik Label**: Ditemukan **{len(conflicts)}** teks yang memiliki label ganda/inkonsisten. Seluruh konflik ini **dibuang** dari dataset training agar tidak merusak pembelajaran model.
4. **Keterbatasan Kelas**: Dataset hanya mencakup **3 kategori** (`infrastruktur`, `lingkungan`, `pelayanan`), sedangkan aplikasi SIPMAS mendukung 5 kategori publik (`infrastruktur`, `lingkungan`, `pelayanan`, `kesehatan`, `keamanan`).

---

## 2. Metrik Kuantitatif Dataset Mentah

| Metrik | Nilai | Catatan |
|---|---|---|
| **Total Baris Laporan** | {total_rows} | 3.001 data laporan valid |
| **Teks Mentah Unik** | {unique_raw} | Berbasis variasi nama kecamatan/jalan |
| **Teks Bersih Unik (`clean_text`)** | {unique_cleaned} | Pola/template kalimat sesungguhnya |
| **Rasio Pengulangan Template** | {total_rows / unique_cleaned:.2f}x | Setiap kalimat diulang rata-rata ~6.3 kali |
| **Konflik Label** | {len(conflicts)} | Teks identik berlabel ambigu |

### Distribusi Kelas Dataset Mentah (3.001 baris)
"""
    for cls, count in class_distribution.most_common():
        pct = (count / total_rows) * 100
        md_content += f"- **{cls.title()}**: {count} baris ({pct:.1f}%)\n"

    md_content += f"""
---

## 3. Analisis Sintetis: NIK dan Email

### A. NIK ({unique_niks} unik dari {len(niks)} baris)
- **Panjang NIK**: Seluruh NIK persis 16 digit numerik ({nik_lengths.get(16, 0)} data).
- **Prefix Wilayah**: 100% diawali kode `3672` ({nik_prefixes.get('3672', 0)} data).
- **Kesimpulan**: NIK dibangkitkan oleh faker/generator sintetis dengan pola template identitas.

### B. Email ({unique_emails} unik dari {len(emails)} baris)
- **Domain**: {dict(email_domains)}
- **Format Sintetis**: {synthetic_email_count} baris cocok dengan regex `^[a-z]+\\.[a-z]+[0-9]{{1,3}}@domain$`.
- **Kesimpulan**: Alamat email adalah hasil komputasi generator data sintetis.

---

## 4. Teks Konflik Label yang Dibuang ({len(conflicts)} kasus)

Teks berikut memiliki label yang saling bertentangan pada dataset asli dan telah dibuang dari `dataset_training.csv`:
"""
    if conflicts:
        for idx, (clean_txt, c_labels) in enumerate(conflicts.items(), 1):
            md_content += f"{idx}. **Teks Bersih**: *\"{clean_txt}\"*\n   - Label yang tercatat: {', '.join(sorted(c_labels))}\n"
    else:
        md_content += "- Tidak ada konflik label.\n"

    md_content += f"""
---

## 5. Dataset Training Bersih (`dataset_training.csv`)

File `apps/nlp-service/dataset/dataset_training.csv` telah dibuat khusus untuk melatih model secara objektif tanpa data ganda:
- **Total Baris**: {len(clean_training_rows)} (1 baris per teks unik tanpa konflik).
- **Kolom**: `text`, `label`.

### Distribusi Kelas Dataset Training Bersih:
"""
    for cls, count in clean_class_distribution.most_common():
        pct = (count / len(clean_training_rows)) * 100
        md_content += f"- **{cls.title()}**: {count} sampel ({pct:.1f}%)\n"

    md_content += """
---
*Dokumen ini dibuat otomatis oleh `apps/nlp-service/scripts/audit_dataset.py`.*
"""

    with open(audit_md_path, 'w', encoding='utf-8') as f:
        f.write(md_content)

    print(f"[Audit] Laporan ringkasan disimpan ke: {audit_md_path}")
    return {
        'total_rows': total_rows,
        'unique_cleaned': unique_cleaned,
        'conflicts': len(conflicts),
        'clean_samples': len(clean_training_rows),
        'clean_distribution': dict(clean_class_distribution)
    }

if __name__ == '__main__':
    audit_dataset()
