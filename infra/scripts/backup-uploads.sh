#!/usr/bin/env bash
# ==============================================================================
# SIPMAS — Uploads Backup Script (Foto & Dokumen Laporan)
# ==============================================================================
# Script ini melakukan backup (arsip tar.gz) direktori uploads SIPMAS ke folder backups/.
# Mendukung sumber lokal (apps/backend/public/uploads) atau Docker volume (prod_backend_uploads).
# Skrip HANYA MEMBACA berkas; tidak menghapus atau memindahkan foto asli di sumber.
# Fitur: Retensi otomatis (BACKUP_RETENTION_DAYS, default 14) & Enkripsi GPG opsional.
# ==============================================================================

set -euo pipefail

# 1. Tentukan direktori project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# 2. Muat environment variable dari .env jika ada
if [ -f "$PROJECT_ROOT/apps/backend/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source <(grep -v '^#' "$PROJECT_ROOT/apps/backend/.env" | grep -v '^\s*$' || true)
  set +a
elif [ -f "$PROJECT_ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source <(grep -v '^#' "$PROJECT_ROOT/.env" | grep -v '^\s*$' || true)
  set +a
fi

# 3. Konfigurasi sumber uploads (Prioritas: argumen 1 -> UPLOADS_SOURCE -> default 'local')
# Nilai yang didukung: 'local', 'docker' / 'prod_backend_uploads', atau path direktori kustom.
SOURCE_INPUT="${1:-${UPLOADS_SOURCE:-local}}"
DOCKER_VOLUME_NAME="${DOCKER_UPLOADS_VOLUME:-prod_backend_uploads}"
LOCAL_UPLOADS_DIR="$PROJECT_ROOT/apps/backend/public/uploads"

# 4. Persiapkan direktori output backup
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_ROOT/backups}"
mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date +"%Y%m%d_%H%M%S")"
BACKUP_FILE="$BACKUP_DIR/uploads_${TIMESTAMP}.tar.gz"

echo "=================================================="
echo "📦 Memulai Backup Berkas Uploads SIPMAS"
echo "   Waktu    : $TIMESTAMP"
echo "   Target   : $BACKUP_FILE"

# 5. Eksekusi pengarsipan tar.gz sesuai sumber yang dipilih
if [ "$SOURCE_INPUT" = "docker" ] || [ "$SOURCE_INPUT" = "prod_backend_uploads" ] || [ "$SOURCE_INPUT" = "volume" ]; then
  echo "   Sumber   : Docker Volume '$DOCKER_VOLUME_NAME' (read-only)"
  echo "=================================================="

  if ! command -v docker &> /dev/null; then
    echo "❌ Error: Perintah 'docker' tidak ditemukan di PATH."
    exit 1
  fi

  # Menggunakan container alpine sementara untuk membaca volume secara read-only (:ro)
  docker run --rm \
    -v "${DOCKER_VOLUME_NAME}:/source_uploads:ro" \
    -v "${BACKUP_DIR}:/backup_target" \
    alpine sh -c "tar -czf /backup_target/$(basename "$BACKUP_FILE") -C /source_uploads ."
else
  # Default sumber direktori lokal
  if [ "$SOURCE_INPUT" != "local" ] && [ -d "$SOURCE_INPUT" ]; then
    LOCAL_UPLOADS_DIR="$SOURCE_INPUT"
  fi

  echo "   Sumber   : Direktori lokal '$LOCAL_UPLOADS_DIR'"
  echo "=================================================="

  if [ ! -d "$LOCAL_UPLOADS_DIR" ]; then
    echo "❌ Error: Direktori uploads lokal tidak ditemukan di: $LOCAL_UPLOADS_DIR"
    exit 1
  fi

  # Arsipkan isi folder uploads secara langsung tanpa menghapus/memindahkan berkas asli
  tar -czf "$BACKUP_FILE" -C "$LOCAL_UPLOADS_DIR" .
fi

if [ -s "$BACKUP_FILE" ]; then
  FILE_SIZE="$(du -h "$BACKUP_FILE" | cut -f1)"
  echo "✅ Arsip tar.gz selesai ($FILE_SIZE)"

  # 6. Enkripsi GPG opsional jika BACKUP_GPG_PASSPHRASE diisi
  if [ -n "${BACKUP_GPG_PASSPHRASE:-}" ]; then
    if command -v gpg &> /dev/null; then
      echo "🔒 Mengenkripsi file backup dengan GPG (AES256)..."
      echo "$BACKUP_GPG_PASSPHRASE" | gpg --batch --yes --symmetric --cipher-algo AES256 --passphrase-fd 0 -o "${BACKUP_FILE}.gpg" "$BACKUP_FILE"
      if [ -s "${BACKUP_FILE}.gpg" ]; then
        rm -f "$BACKUP_FILE"
        BACKUP_FILE="${BACKUP_FILE}.gpg"
        FILE_SIZE="$(du -h "$BACKUP_FILE" | cut -f1)"
        echo "✅ Backup terenkripsi: $BACKUP_FILE ($FILE_SIZE)"
      else
        echo "⚠️ Peringatan: Enkripsi GPG gagal, file plaintext tetap dipertahankan."
      fi
    else
      echo "⚠️ Peringatan: 'gpg' tidak tersedia di PATH, melewati enkripsi."
    fi
  fi

  # 7. Retensi backup otomatis (default: 14 hari)
  BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
  echo "🧹 Menjalankan retensi backup di $BACKUP_DIR (batas: ${BACKUP_RETENTION_DAYS} hari)..."
  if command -v find &> /dev/null; then
    OLD_FILES="$(find "$BACKUP_DIR" -maxdepth 1 -type f \( -name "uploads_*.tar.gz" -o -name "uploads_*.tar.gz.gpg" \) -mtime "+$BACKUP_RETENTION_DAYS" || true)"
    if [ -n "$OLD_FILES" ]; then
      echo "$OLD_FILES" | while read -r f; do
        if [ -n "$f" ]; then
          echo "   - Menghapus backup uploads usang: $(basename "$f")"
          rm -f "$f"
        fi
      done
    else
      echo "   Tidak ada file backup uploads yang melebihi retensi ${BACKUP_RETENTION_DAYS} hari."
    fi
  fi

  echo "=================================================="
  echo "🎉 Backup uploads selesai: $BACKUP_FILE"
  echo "=================================================="
else
  echo "❌ Error: File backup uploads kosong atau gagal dibuat."
  exit 1
fi
