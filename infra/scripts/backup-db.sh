#!/usr/bin/env bash
# ==============================================================================
# SIPMAS — Database Backup Script (db_sipmas)
# ==============================================================================
# Script ini melakukan backup (dump) skema dan data database aktif SIPMAS (db_sipmas).
# Menggunakan variabel lingkungan dari .env atau apps/backend/.env.
# Target: db_sipmas (database aktif). TIDAK menyentuh database lain (db_pengaduan).
# Fitur: Retensi otomatis (BACKUP_RETENTION_DAYS, default 14) & Enkripsi GPG opsional.
# ==============================================================================

set -euo pipefail

# 1. Tentukan direktori project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# 2. Muat environment variable dari .env jika ada
if [ -f "$PROJECT_ROOT/apps/backend/.env" ]; then
  # export variables ignoring comments
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

# 3. Parsing kredensial database (Prioritas: env terpisah -> parsing DATABASE_URL -> default)
DB_NAME="${DB_NAME:-db_sipmas}"
DB_USER="${DB_USER:-}"
DB_PASS="${DB_PASSWORD:-}"
DB_HOST="${DB_HOST:-}"
DB_PORT="${DB_PORT:-}"

if [ -n "${DATABASE_URL:-}" ]; then
  # Format umum Prisma: mysql://USER:PASSWORD@HOST:PORT/DATABASE
  PROTO="$(echo "$DATABASE_URL" | sed -e's,^\(.*://\).*,\1,g')"
  URL_NO_PROTO="${DATABASE_URL#"$PROTO"}"
  
  USER_PASS="$(echo "$URL_NO_PROTO" | grep "@" | cut -d@ -f1 || true)"
  HOST_PORT_DB="$(echo "$URL_NO_PROTO" | sed -e "s|^$USER_PASS@||")"

  if [ -n "$USER_PASS" ]; then
    DB_USER="$(echo "$USER_PASS" | cut -d: -f1)"
    if echo "$USER_PASS" | grep -q ":"; then
      DB_PASS="$(echo "$USER_PASS" | cut -d: -f2)"
    fi
  fi

  HOST_PORT="$(echo "$HOST_PORT_DB" | cut -d/ -f1)"
  PARSED_DB="$(echo "$HOST_PORT_DB" | cut -d/ -f2 | cut -d? -f1)"

  if [ -n "$PARSED_DB" ]; then
    DB_NAME="$PARSED_DB"
  fi

  if echo "$HOST_PORT" | grep -q ":"; then
    DB_HOST="$(echo "$HOST_PORT" | cut -d: -f1)"
    DB_PORT="$(echo "$HOST_PORT" | cut -d: -f2)"
  else
    DB_HOST="$HOST_PORT"
  fi
fi

# Fallback default jika masih kosong
DB_USER="${DB_USER:-root}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
DB_NAME="db_sipmas" # Pastikan SELALU db_sipmas

# 4. Validasi ketersediaan mysqldump (cek PATH atau auto-detect di Docker/Laragon)
USE_DOCKER="${USE_DOCKER:-false}"
if [ "$USE_DOCKER" != "true" ] && ! command -v mysqldump &> /dev/null; then
  # Auto-detect Laragon MySQL bin path on Windows
  LARAGON_MYSQL_BIN="$(find /c/laragon/bin/mysql -maxdepth 2 -type d -name "bin" 2>/dev/null | head -n 1 || true)"
  if [ -n "$LARAGON_MYSQL_BIN" ] && [ -x "$LARAGON_MYSQL_BIN/mysqldump.exe" ]; then
    export PATH="$LARAGON_MYSQL_BIN:$PATH"
  fi
fi

if ! command -v mysqldump &> /dev/null; then
  if command -v docker &> /dev/null && docker ps --format '{{.Names}}' | grep -q 'sipmas-mysql'; then
    USE_DOCKER=true
  else
    echo "❌ Error: 'mysqldump' tidak ditemukan di PATH dan kontainer 'sipmas-mysql' tidak aktif."
    exit 1
  fi
fi

# 5. Persiapkan direktori output backup
BACKUP_DIR="$PROJECT_ROOT/backups"
mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date +"%Y%m%d_%H%M%S")"
BACKUP_FILE="$BACKUP_DIR/${DB_NAME}_${TIMESTAMP}.sql"

echo "=================================================="
echo "📦 Memulai Backup Database SIPMAS: $DB_NAME"
echo "   Host     : $DB_HOST:$DB_PORT"
echo "   User     : $DB_USER"
echo "   Database : $DB_NAME"
echo "   File     : $BACKUP_FILE"
echo "=================================================="

# 6. Eksekusi mysqldump (via CLI langsung atau kontainer docker sipmas-mysql)
if [ "$USE_DOCKER" = true ]; then
  docker exec sipmas-mysql mysqldump \
    -u "$DB_USER" \
    ${DB_PASS:+-p"$DB_PASS"} \
    --single-transaction \
    --quick \
    --routines \
    --triggers \
    "$DB_NAME" > "$BACKUP_FILE"
else
  MYSQL_PWD="$DB_PASS" mysqldump \
    --host="$DB_HOST" \
    --port="$DB_PORT" \
    --user="$DB_USER" \
    --single-transaction \
    --quick \
    --routines \
    --triggers \
    "$DB_NAME" > "$BACKUP_FILE"
fi

if [ -s "$BACKUP_FILE" ]; then
  FILE_SIZE="$(du -h "$BACKUP_FILE" | cut -f1)"
  echo "✅ Dump SQL selesai ($FILE_SIZE)"

  # 7. Enkripsi GPG opsional jika BACKUP_GPG_PASSPHRASE diisi
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

  # 8. Retensi backup otomatis (default: 14 hari)
  BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
  echo "🧹 Menjalankan retensi backup di $BACKUP_DIR (batas: ${BACKUP_RETENTION_DAYS} hari)..."
  if command -v find &> /dev/null; then
    OLD_FILES="$(find "$BACKUP_DIR" -maxdepth 1 -type f \( -name "db_sipmas_*.sql" -o -name "db_sipmas_*.sql.gpg" \) -mtime "+$BACKUP_RETENTION_DAYS" || true)"
    if [ -n "$OLD_FILES" ]; then
      echo "$OLD_FILES" | while read -r f; do
        if [ -n "$f" ]; then
          echo "   - Menghapus backup usang: $(basename "$f")"
          rm -f "$f"
        fi
      done
    else
      echo "   Tidak ada file backup yang melebihi retensi ${BACKUP_RETENTION_DAYS} hari."
    fi
  fi

  echo "=================================================="
  echo "🎉 Backup selesai: $BACKUP_FILE"
  echo "=================================================="
else
  echo "❌ Error: File backup kosong atau gagal dibuat."
  exit 1
fi
