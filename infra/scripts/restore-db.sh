#!/usr/bin/env bash
# ==============================================================================
# SIPMAS — Database Restore Script
# ==============================================================================
# Script ini melakukan restore skema dan data dari file backup (.sql atau .sql.gpg).
# ATURAN KESELAMATAN:
# 1. SELALU MENOLAK target db_pengaduan (milik project lain, pantangan keras).
# 2. Menolak target db_sipmas kecuali jika flag --yes-overwrite-sipmas disertakan.
# 3. Target yang disarankan untuk verifikasi: db_sipmas_restore_test.
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Usage help
show_help() {
  echo "Penggunaan: $0 <file-backup> <nama-database-target> [--yes-overwrite-sipmas]"
  echo ""
  echo "Contoh penggunaan aman:"
  echo "  $0 backups/db_sipmas_20261015_120000.sql db_sipmas_restore_test"
  echo ""
  echo "Peringatan keselamatan:"
  echo "  - Target 'db_pengaduan' DITOLAK MUTLAK."
  echo "  - Target 'db_sipmas' membutuhkan flag eksplisit --yes-overwrite-sipmas."
  exit 1
}

if [ "$#" -lt 2 ]; then
  show_help
fi

BACKUP_FILE="$1"
TARGET_DB="$2"
OVERWRITE_FLAG="${3:-}"

# 1. Validasi Proteksi Database Terlarang
if [ "$TARGET_DB" = "db_pengaduan" ]; then
  echo "❌ KESALAHAN FATAL: Target database 'db_pengaduan' DILARANG KERAS!"
  echo "   Database tersebut bukan milik SIPMAS dan tidak boleh disentuh."
  exit 1
fi

if [ "$TARGET_DB" = "db_sipmas" ] && [ "$OVERWRITE_FLAG" != "--yes-overwrite-sipmas" ]; then
  echo "❌ KESALAHAN: Menolak melakukan restore ke database produksi/aktif 'db_sipmas'."
  echo "   Jika Anda benar-benar yakin ingin menimpa 'db_sipmas', tambahkan flag: --yes-overwrite-sipmas"
  echo "   Saran target aman untuk uji coba: db_sipmas_restore_test"
  exit 1
fi

# 2. Validasi keberadaan file backup
if [ ! -f "$BACKUP_FILE" ]; then
  echo "❌ Error: File backup '$BACKUP_FILE' tidak ditemukan!"
  exit 1
fi

# 3. Muat konfigurasi database dari .env
if [ -f "$PROJECT_ROOT/apps/backend/.env" ]; then
  set -a
  source <(grep -v '^#' "$PROJECT_ROOT/apps/backend/.env" | grep -v '^\s*$' || true)
  set +a
elif [ -f "$PROJECT_ROOT/.env" ]; then
  set -a
  source <(grep -v '^#' "$PROJECT_ROOT/.env" | grep -v '^\s*$' || true)
  set +a
fi

DB_USER="${DB_USER:-root}"
DB_PASS="${DB_PASSWORD:-}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"

USE_DOCKER="${USE_DOCKER:-false}"
if [ "$USE_DOCKER" != "true" ] && ! command -v mysql &> /dev/null; then
  LARAGON_MYSQL_BIN="$(find /c/laragon/bin/mysql -maxdepth 2 -type d -name "bin" 2>/dev/null | head -n 1 || true)"
  if [ -n "$LARAGON_MYSQL_BIN" ] && [ -x "$LARAGON_MYSQL_BIN/mysql.exe" ]; then
    export PATH="$LARAGON_MYSQL_BIN:$PATH"
  fi
fi

if ! command -v mysql &> /dev/null; then
  if command -v docker &> /dev/null && docker ps --format '{{.Names}}' | grep -q 'sipmas-mysql'; then
    USE_DOCKER=true
  else
    echo "❌ Error: 'mysql' CLI tidak ditemukan di PATH dan kontainer docker 'sipmas-mysql' tidak aktif."
    exit 1
  fi
fi

# 4. Handle GPG Decryption jika terenkripsi
RESTORE_SQL_PATH="$BACKUP_FILE"
TEMP_DECRYPTED=""

if [[ "$BACKUP_FILE" == *.gpg ]]; then
  echo "🔓 File backup terenkripsi GPG terdeteksi."
  if ! command -v gpg &> /dev/null; then
    echo "❌ Error: 'gpg' diperlukan untuk mendekripsi file backup."
    exit 1
  fi

  TEMP_DECRYPTED="${BACKUP_FILE%.gpg}.tmp.sql"
  if [ -n "${BACKUP_GPG_PASSPHRASE:-}" ]; then
    echo "$BACKUP_GPG_PASSPHRASE" | gpg --batch --yes --decrypt --passphrase-fd 0 -o "$TEMP_DECRYPTED" "$BACKUP_FILE"
  else
    echo "Masukkan passphrase GPG:"
    gpg --batch --yes --decrypt -o "$TEMP_DECRYPTED" "$BACKUP_FILE"
  fi
  RESTORE_SQL_PATH="$TEMP_DECRYPTED"
fi

# Pastikan membersihkan file sementara saat keluar
cleanup() {
  if [ -n "$TEMP_DECRYPTED" ] && [ -f "$TEMP_DECRYPTED" ]; then
    rm -f "$TEMP_DECRYPTED"
  fi
}
trap cleanup EXIT

echo "=================================================="
echo "📥 Memulai Restore Database SIPMAS"
echo "   File Source : $BACKUP_FILE"
echo "   Target DB   : $TARGET_DB"
echo "=================================================="

# 5. Buat target database jika belum ada
echo "🔧 Memastikan database target '$TARGET_DB' tersedia..."
if [ "$USE_DOCKER" = true ]; then
  docker exec sipmas-mysql mysql -u "$DB_USER" ${DB_PASS:+-p"$DB_PASS"} -e "CREATE DATABASE IF NOT EXISTS \`$TARGET_DB\`;"
  echo "📥 Mengimpor SQL ke database '$TARGET_DB' di kontainer sipmas-mysql..."
  docker exec -i sipmas-mysql mysql -u "$DB_USER" ${DB_PASS:+-p"$DB_PASS"} "$TARGET_DB" < "$RESTORE_SQL_PATH"
else
  MYSQL_PWD="$DB_PASS" mysql --host="$DB_HOST" --port="$DB_PORT" --user="$DB_USER" -e "CREATE DATABASE IF NOT EXISTS \`$TARGET_DB\`;"
  echo "📥 Mengimpor SQL ke database '$TARGET_DB'..."
  MYSQL_PWD="$DB_PASS" mysql --host="$DB_HOST" --port="$DB_PORT" --user="$DB_USER" "$TARGET_DB" < "$RESTORE_SQL_PATH"
fi

echo "✅ Restore database '$TARGET_DB' berhasil diselesaikan!"
echo "=================================================="
