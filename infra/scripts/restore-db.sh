#!/usr/bin/env bash
# ==============================================================================
# SIPMAS — Database Restore Script
# ==============================================================================
# Script ini melakukan restore skema dan data dari file backup (.sql, .sql.gz, .sql.gpg, atau .sql.gz.gpg).
# ATURAN KESELAMATAN:
# 1. SELALU MENOLAK target db_pengaduan (milik project lain, pantangan keras).
# 2. Menolak target db_sipmas kecuali jika flag --yes-overwrite-sipmas disertakan.
# 3. Target yang disarankan untuk verifikasi: db_sipmas_restore_test.
# 4. Mode Docker menjalankan mysql via sh -c di dalam kontainer agar kata sandi dibaca langsung
#    dari environment kontainer (MYSQL_ROOT_PASSWORD / MYSQL_PASSWORD), bukan argumen docker exec.
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

if [[ ! "$TARGET_DB" =~ ^[A-Za-z0-9_]+$ ]]; then
  echo "❌ KESALAHAN: Nama database target hanya boleh berisi huruf, angka, dan garis bawah (_)."
  exit 1
fi

# 2. Validasi keberadaan file backup
if [ ! -f "$BACKUP_FILE" ]; then
  echo "❌ Error: File backup '$BACKUP_FILE' tidak ditemukan!"
  exit 1
fi

# 3. Muat konfigurasi database dari .env
load_env_file() {
  local env_path="$1"
  [ -f "$env_path" ] || return 0
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    case "$line" in
      ''|\#*) continue ;;
    esac
    if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
      local key="${BASH_REMATCH[1]}"
      local val="${BASH_REMATCH[2]}"
      if [[ "$val" =~ ^\"(.*)\"[[:space:]]*(#.*)?$ ]]; then
        val="${BASH_REMATCH[1]}"
      elif [[ "$val" =~ ^\'(.*)\'[[:space:]]*(#.*)?$ ]]; then
        val="${BASH_REMATCH[1]}"
      else
        val="${val%%#*}"
        val="${val%"${val##*[![:space:]]}"}"
      fi
      if [ -z "${!key+x}" ]; then
        export "$key=$val"
      fi
    fi
  done < "$env_path"
}

DETECTED_CONTAINER=""
if command -v docker &> /dev/null; then
  if docker ps --format '{{.Names}}' | grep -qx 'sipmas-prod-mysql'; then
    DETECTED_CONTAINER="sipmas-prod-mysql"
  elif docker ps --format '{{.Names}}' | grep -qx 'sipmas-mysql'; then
    DETECTED_CONTAINER="sipmas-mysql"
  fi
fi

if [ -n "${ENV_FILE:-}" ] && [ -f "$ENV_FILE" ]; then
  load_env_file "$ENV_FILE"
elif [ "$DETECTED_CONTAINER" = "sipmas-prod-mysql" ] && [ -f "$PROJECT_ROOT/.env" ]; then
  load_env_file "$PROJECT_ROOT/.env"
elif [ -f "$PROJECT_ROOT/apps/backend/.env" ]; then
  load_env_file "$PROJECT_ROOT/apps/backend/.env"
  load_env_file "$PROJECT_ROOT/.env"
elif [ -f "$PROJECT_ROOT/.env" ]; then
  load_env_file "$PROJECT_ROOT/.env"
fi

MYSQL_CONTAINER="${MYSQL_CONTAINER:-$DETECTED_CONTAINER}"
DB_USER="${DB_USER:-root}"
DB_PASS="${DB_PASSWORD:-}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"

USE_DOCKER="${USE_DOCKER:-auto}"
if [ "$USE_DOCKER" = "auto" ]; then
  if [ "$MYSQL_CONTAINER" = "sipmas-prod-mysql" ]; then
    USE_DOCKER=true
  elif ! command -v mysql &> /dev/null && [ -n "$MYSQL_CONTAINER" ]; then
    USE_DOCKER=true
  else
    USE_DOCKER=false
  fi
fi

if [ "$USE_DOCKER" != true ] && ! command -v mysql &> /dev/null; then
  LARAGON_MYSQL_BIN="$(find /c/laragon/bin/mysql -maxdepth 2 -type d -name "bin" 2>/dev/null | head -n 1 || true)"
  if [ -n "$LARAGON_MYSQL_BIN" ] && [ -x "$LARAGON_MYSQL_BIN/mysql.exe" ]; then
    export PATH="$LARAGON_MYSQL_BIN:$PATH"
  fi
fi

if [ "$USE_DOCKER" != true ] && ! command -v mysql &> /dev/null; then
  echo "❌ Error: 'mysql' CLI tidak ditemukan di PATH dan kontainer MySQL tidak aktif."
  exit 1
fi

# 4. Handle GPG Decryption & gzip decompression jika diperlukan
RESTORE_SQL_PATH="$BACKUP_FILE"
TEMP_DECRYPTED=""
TEMP_UNZIPPED=""

if [[ "$BACKUP_FILE" == *.gpg ]]; then
  echo "🔓 File backup terenkripsi GPG terdeteksi."
  if ! command -v gpg &> /dev/null; then
    echo "❌ Error: 'gpg' diperlukan untuk mendekripsi file backup."
    exit 1
  fi

  TEMP_DECRYPTED="${BACKUP_FILE%.gpg}.tmp"
  if [ -n "${BACKUP_GPG_PASSPHRASE:-}" ]; then
    echo "$BACKUP_GPG_PASSPHRASE" | gpg --batch --yes --decrypt --passphrase-fd 0 -o "$TEMP_DECRYPTED" "$BACKUP_FILE"
  else
    echo "Masukkan passphrase GPG:"
    gpg --batch --yes --decrypt -o "$TEMP_DECRYPTED" "$BACKUP_FILE"
  fi
  RESTORE_SQL_PATH="$TEMP_DECRYPTED"
fi

if [[ "$RESTORE_SQL_PATH" == *.gz ]] || [[ "$RESTORE_SQL_PATH" == *.gz.tmp ]]; then
  echo "🗜️  File terkompresi gzip terdeteksi, mengekstrak sementara..."
  TEMP_UNZIPPED="${RESTORE_SQL_PATH}.sql"
  gunzip -c "$RESTORE_SQL_PATH" > "$TEMP_UNZIPPED"
  RESTORE_SQL_PATH="$TEMP_UNZIPPED"
fi

# Pastikan membersihkan file sementara saat keluar
cleanup() {
  if [ -n "$TEMP_DECRYPTED" ] && [ -f "$TEMP_DECRYPTED" ]; then
    rm -f "$TEMP_DECRYPTED"
  fi
  if [ -n "$TEMP_UNZIPPED" ] && [ -f "$TEMP_UNZIPPED" ]; then
    rm -f "$TEMP_UNZIPPED"
  fi
}
trap cleanup EXIT

echo "=================================================="
echo "📥 Memulai Restore Database SIPMAS"
echo "   File Source : $BACKUP_FILE"
echo "   Target DB   : $TARGET_DB"
echo "=================================================="

# 5. Buat target database jika belum ada
#    Mode Docker menjalankan mysql via sh -c di dalam kontainer agar MYSQL_ROOT_PASSWORD / MYSQL_PASSWORD
#    dibaca langsung dari environment kontainer (tanpa menaruh kata sandi di argumen docker exec).
echo "🔧 Memastikan database target '$TARGET_DB' tersedia..."
if [ "$USE_DOCKER" = true ]; then
  docker exec "$MYSQL_CONTAINER" sh -c '
    db_user="$1"
    target_db="$2"
    if [ "$db_user" = "root" ]; then
      if [ -n "${MYSQL_ROOT_PASSWORD:-}" ]; then
        export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"
      fi
    elif [ -n "${MYSQL_PASSWORD:-}" ]; then
      export MYSQL_PWD="$MYSQL_PASSWORD"
    fi
    exec mysql -u "$db_user" -e "CREATE DATABASE IF NOT EXISTS \`${target_db}\`;"
  ' sh "$DB_USER" "$TARGET_DB"
  echo "📥 Mengimpor SQL ke database '$TARGET_DB' di kontainer $MYSQL_CONTAINER..."
  docker exec -i "$MYSQL_CONTAINER" sh -c '
    db_user="$1"
    target_db="$2"
    if [ "$db_user" = "root" ]; then
      if [ -n "${MYSQL_ROOT_PASSWORD:-}" ]; then
        export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"
      fi
    elif [ -n "${MYSQL_PASSWORD:-}" ]; then
      export MYSQL_PWD="$MYSQL_PASSWORD"
    fi
    exec mysql -u "$db_user" "$target_db"
  ' sh "$DB_USER" "$TARGET_DB" < "$RESTORE_SQL_PATH"
else
  MYSQL_PWD="$DB_PASS" mysql --host="$DB_HOST" --port="$DB_PORT" --user="$DB_USER" -e "CREATE DATABASE IF NOT EXISTS \`$TARGET_DB\`;"
  echo "📥 Mengimpor SQL ke database '$TARGET_DB'..."
  MYSQL_PWD="$DB_PASS" mysql --host="$DB_HOST" --port="$DB_PORT" --user="$DB_USER" "$TARGET_DB" < "$RESTORE_SQL_PATH"
fi

echo "✅ Restore database '$TARGET_DB' berhasil diselesaikan!"
echo "=================================================="
