#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# Luka System — PostgreSQL restore script
# Usage:  ./restore.sh <backup_file> [DATABASE_URL]
#   DATABASE_URL can also be set as an environment variable.
# ──────────────────────────────────────────────────────────────
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"

# ── Logging ──────────────────────────────────────────────────
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
die() { log "ERROR: $*" >&2; exit 1; }

# ── Args ─────────────────────────────────────────────────────
BACKUP_FILE="${1:-}"
[ -z "$BACKUP_FILE" ] && die "Usage: ./restore.sh <backup_file> [DATABASE_URL]"

# Resolve full path
if [ -f "$BACKUP_FILE" ]; then
  BACKUP_PATH="$BACKUP_FILE"
elif [ -f "${BACKUP_DIR}/${BACKUP_FILE}" ]; then
  BACKUP_PATH="${BACKUP_DIR}/${BACKUP_FILE}"
else
  die "Backup file not found: ${BACKUP_FILE}"
fi

DB_URL="${2:-${DATABASE_URL:-}}"
[ -z "$DB_URL" ] && die "DATABASE_URL is required (pass as second arg or env var)"

# ── Parse DATABASE_URL ───────────────────────────────────────
DB_USER=$(echo "$DB_URL" | sed -n 's|.*://\([^:]*\):.*|\1|p')
DB_PASS=$(echo "$DB_URL" | sed -n 's|.*://[^:]*:\([^@]*\)@.*|\1|p')
DB_HOST=$(echo "$DB_URL" | sed -n 's|.*@\([^:]*\):.*|\1|p')
DB_PORT=$(echo "$DB_URL" | sed -n 's|.*:\([0-9]*\)/.*|\1|p')
DB_NAME=$(echo "$DB_URL" | sed -n 's|.*/\([^?]*\).*|\1|p')

export PGPASSWORD="$DB_PASS"

# ── Safety confirmation ──────────────────────────────────────
echo ""
echo "=========================================="
echo "  LUKA SYSTEM — DATABASE RESTORE"
echo "=========================================="
echo ""
echo "  Backup file : $(basename "$BACKUP_PATH")"
echo "  Database    : ${DB_NAME}"
echo "  Host        : ${DB_HOST}:${DB_PORT}"
echo "  User        : ${DB_USER}"
echo ""
echo "  WARNING: This will DROP and RECREATE the"
echo "  database '${DB_NAME}'. All current data"
echo "  will be permanently lost."
echo ""
echo "=========================================="
echo ""

# Allow non-interactive mode via RESTORE_CONFIRM=yes
if [ "${RESTORE_CONFIRM:-}" != "yes" ]; then
  read -rp "Type 'yes' to confirm restore: " CONFIRM
  if [ "$CONFIRM" != "yes" ]; then
    log "Restore cancelled by user."
    exit 1
  fi
fi

# ── Drop and recreate database ───────────────────────────────
log "Terminating existing connections to '${DB_NAME}'..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();" \
  > /dev/null 2>&1 || true

log "Dropping database '${DB_NAME}'..."
dropdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" --if-exists "$DB_NAME"

log "Creating database '${DB_NAME}'..."
createdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -O "$DB_USER" "$DB_NAME"

# ── Restore ──────────────────────────────────────────────────
log "Restoring from $(basename "$BACKUP_PATH")..."

if gunzip -c "$BACKUP_PATH" | psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" --quiet; then
  log "Restore completed successfully."
else
  die "Restore failed. The database may be in an inconsistent state."
fi

log "Restore process finished."
exit 0
