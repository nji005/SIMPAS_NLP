#!/usr/bin/env bash
# ==============================================================================
# SIPMAS — Database Backup Script (db_sipmas)
# ==============================================================================
# Script ini melakukan backup (dump + gzip) skema dan data database aktif SIPMAS (db_sipmas).
# - Mendukung kontainer Docker produksi (sipmas-prod-mysql) maupun dev (sipmas-mysql) via docker exec,
#   serta fallback ke mysqldump lokal bila kontainer Docker tidak aktif.
# - Mode Docker menjalankan mysqldump via sh -c di dalam kontainer agar MYSQL_ROOT_PASSWORD / MYSQL_PASSWORD
#   dibaca langsung dari environment kontainer (tanpa menaruh kata sandi di argumen docker exec maupun daftar proses host).
# - Mode CLI lokal (non-Docker) membaca .env dan meneruskan kata sandi lewat variabel environment MYSQL_PWD (bukan argumen -p).
# - Target SELALU db_sipmas. TIDAK pernah menyentuh database lain (db_pengaduan).
# - Retensi otomatis: menghapus backup lebih dari BACKUP_RETENTION_DAYS (default: 7 hari).
#
# Contoh jadwal cron harian pukul 02:00 di server produksi:
#   0 2 * * * cd /opt/sipmas && bash infra/scripts/backup-db.sh >> /opt/sipmas/backups/backup.log 2>&1
#
# Contoh perintah restore (uji coba aman ke db_sipmas_restore_test):
#   gunzip -c backups/db_sipmas_YYYYMMDD_HHMMSS.sql.gz | docker exec -i sipmas-prod-mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -u root db_sipmas_restore_test'
#   # Atau gunakan skrip bantu:
#   bash infra/scripts/restore-db.sh backups/db_sipmas_YYYYMMDD_HHMMSS.sql.gz db_sipmas_restore_test
# ==============================================================================

set -euo pipefail

# 1. Tentukan direktori project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Loader .env aman (hanya mengisi variabel yang belum ada di environment, tidak mengeksekusi karakter khusus seperti < >)
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
      # Hapus komentar inline hanya jika nilai tidak diawali kutip
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

# 2. Deteksi awal kontainer Docker aktif (produksi diprioritaskan)
DETECTED_CONTAINER=""
if command -v docker &> /dev/null; then
  if docker ps --format '{{.Names}}' | grep -qx 'sipmas-prod-mysql'; then
    DETECTED_CONTAINER="sipmas-prod-mysql"
  elif docker ps --format '{{.Names}}' | grep -qx 'sipmas-mysql'; then
    DETECTED_CONTAINER="sipmas-mysql"
  fi
fi

# 3. Muat environment variable (.env root diprioritaskan untuk deployment Docker produksi)
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

# 4. Tentukan mode eksekusi Docker vs CLI lokal
MYSQL_CONTAINER="${MYSQL_CONTAINER:-$DETECTED_CONTAINER}"
USE_DOCKER="${USE_DOCKER:-auto}"

if [ "$USE_DOCKER" = "auto" ]; then
  if [ "$MYSQL_CONTAINER" = "sipmas-prod-mysql" ]; then
    USE_DOCKER=true
  elif ! command -v mysqldump &> /dev/null && [ -n "$MYSQL_CONTAINER" ]; then
    USE_DOCKER=true
  else
    USE_DOCKER=false
  fi
fi

# 5. Siapkan kredensial database (tanpa mencetak rahasia)
DB_NAME="db_sipmas" # Pastikan SELALU db_sipmas
DB_USER="${DB_USER:-}"
DB_PASS="${DB_PASSWORD:-}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
EXTRA_DUMP_ARGS=()

if [ "$USE_DOCKER" = true ]; then
  if [ -z "$MYSQL_CONTAINER" ]; then
    echo "❌ Error: Kontainer MySQL ('sipmas-prod-mysql' atau 'sipmas-mysql') tidak ditemukan aktif."
    exit 1
  fi
  # Dalam mode Docker, kata sandi dibaca di dalam kontainer lewat sh -c dari environment kontainer
  # (MYSQL_ROOT_PASSWORD untuk root, MYSQL_PASSWORD untuk user non-root).
  DB_USER="${DB_USER:-root}"
  DB_PASS=""
  if [ "$DB_USER" != "root" ]; then
    EXTRA_DUMP_ARGS+=(--no-tablespaces)
  fi
else
  if [ -n "${DATABASE_URL:-}" ]; then
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
    if echo "$HOST_PORT" | grep -q ":"; then
      DB_HOST="$(echo "$HOST_PORT" | cut -d: -f1)"
      DB_PORT="$(echo "$HOST_PORT" | cut -d: -f2)"
    elif [ -n "$HOST_PORT" ]; then
      DB_HOST="$HOST_PORT"
    fi
  fi

  DB_USER="${DB_USER:-root}"
  if ! command -v mysqldump &> /dev/null; then
    LARAGON_MYSQL_BIN="$(find /c/laragon/bin/mysql -maxdepth 2 -type d -name "bin" 2>/dev/null | head -n 1 || true)"
    if [ -n "$LARAGON_MYSQL_BIN" ] && [ -x "$LARAGON_MYSQL_BIN/mysqldump.exe" ]; then
      export PATH="$LARAGON_MYSQL_BIN:$PATH"
    fi
  fi

  if ! command -v mysqldump &> /dev/null; then
    echo "❌ Error: 'mysqldump' tidak ditemukan di PATH dan mode Docker tidak aktif."
    exit 1
  fi
fi

# 6. Persiapkan direktori output backup
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_ROOT/backups}"
mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date +"%Y%m%d_%H%M%S")"
BACKUP_FILE="$BACKUP_DIR/${DB_NAME}_${TIMESTAMP}.sql.gz"

cleanup_partial() {
  local exit_code=$?
  if [ "$exit_code" -ne 0 ] && [ -f "$BACKUP_FILE" ]; then
    rm -f "$BACKUP_FILE"
  fi
}
trap cleanup_partial EXIT

echo "=================================================="
echo "📦 Memulai Backup Database SIPMAS: $DB_NAME"
if [ "$USE_DOCKER" = true ]; then
  echo "   Mode      : Docker exec ($MYSQL_CONTAINER)"
else
  echo "   Mode      : CLI lokal ($DB_HOST:$DB_PORT)"
fi
echo "   User      : $DB_USER"
echo "   Database  : $DB_NAME"
echo "   Target    : $BACKUP_FILE"
echo "=================================================="

# 7. Eksekusi mysqldump lalu kompres dengan gzip
#    - Mode Docker: jalankan via sh -c di dalam kontainer agar MYSQL_ROOT_PASSWORD / MYSQL_PASSWORD
#      dibaca langsung dari environment kontainer (tanpa menaruh kata sandi di argumen docker exec).
#    - Mode CLI lokal: gunakan MYSQL_PWD di environment proses lokal (tanpa argumen -p).
if [ "$USE_DOCKER" = true ]; then
  docker exec "$MYSQL_CONTAINER" sh -c '
    db_user="$1"
    db_name="$2"
    shift 2
    if [ "$db_user" = "root" ]; then
      if [ -n "${MYSQL_ROOT_PASSWORD:-}" ]; then
        export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"
      fi
    elif [ -n "${MYSQL_PASSWORD:-}" ]; then
      export MYSQL_PWD="$MYSQL_PASSWORD"
    fi
    exec mysqldump -u "$db_user" --single-transaction --quick --routines --triggers "$@" "$db_name"
  ' sh "$DB_USER" "$DB_NAME" ${EXTRA_DUMP_ARGS[@]+"${EXTRA_DUMP_ARGS[@]}"} | gzip -c > "$BACKUP_FILE"
else
  MYSQL_PWD="$DB_PASS" mysqldump \
    --host="$DB_HOST" \
    --port="$DB_PORT" \
    --user="$DB_USER" \
    --single-transaction \
    --quick \
    --routines \
    --triggers \
    "$DB_NAME" | gzip -c > "$BACKUP_FILE"
fi

if [ -s "$BACKUP_FILE" ] && gzip -t "$BACKUP_FILE" 2>/dev/null; then
  FILE_SIZE="$(du -h "$BACKUP_FILE" | cut -f1)"
  echo "✅ Dump SQL terkompresi selesai ($FILE_SIZE)"

  # 8. Enkripsi GPG opsional jika BACKUP_GPG_PASSPHRASE diisi
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
        echo "⚠️ Peringatan: Enkripsi GPG gagal, file terkompresi tetap dipertahankan."
      fi
    else
      echo "⚠️ Peringatan: 'gpg' tidak tersedia di PATH, melewati enkripsi."
    fi
  fi

  # 9. Retensi backup otomatis (default: 7 hari)
  BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
  echo "🧹 Menjalankan retensi backup di $BACKUP_DIR (batas: ${BACKUP_RETENTION_DAYS} hari)..."
  if command -v find &> /dev/null; then
    OLD_FILES="$(find "$BACKUP_DIR" -maxdepth 1 -type f \( -name "db_sipmas_*.sql" -o -name "db_sipmas_*.sql.gz" -o -name "db_sipmas_*.sql.gpg" -o -name "db_sipmas_*.sql.gz.gpg" \) -mtime "+$BACKUP_RETENTION_DAYS" || true)"
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
  echo "❌ Error: File backup kosong, korup, atau gagal dibuat."
  exit 1
fi
