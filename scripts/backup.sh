#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# Luka System — PostgreSQL backup script
# Usage:  ./backup.sh [DATABASE_URL]
#   DATABASE_URL can also be set as an environment variable.
# ──────────────────────────────────────────────────────────────
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAILY=7
RETENTION_WEEKLY=4   # Sundays
RETENTION_MONTHLY=3  # 1st of month

# ── Logging ──────────────────────────────────────────────────
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
die() { log "ERROR: $*" >&2; exit 1; }

# ── Parse DATABASE_URL ───────────────────────────────────────
DB_URL="${1:-${DATABASE_URL:-}}"
[ -z "$DB_URL" ] && die "DATABASE_URL is required (pass as arg or env var)"

# Extract components from postgresql://user:pass@host:port/dbname
DB_USER=$(echo "$DB_URL" | sed -n 's|.*://\([^:]*\):.*|\1|p')
DB_PASS=$(echo "$DB_URL" | sed -n 's|.*://[^:]*:\([^@]*\)@.*|\1|p')
DB_HOST=$(echo "$DB_URL" | sed -n 's|.*@\([^:]*\):.*|\1|p')
DB_PORT=$(echo "$DB_URL" | sed -n 's|.*:\([0-9]*\)/.*|\1|p')
DB_NAME=$(echo "$DB_URL" | sed -n 's|.*/\([^?]*\).*|\1|p')

export PGPASSWORD="$DB_PASS"

# ── Directories ──────────────────────────────────────────────
mkdir -p "$BACKUP_DIR"

# ── Backup ───────────────────────────────────────────────────
TIMESTAMP=$(date '+%Y-%m-%d_%H%M%S')
BACKUP_FILE="luka_backup_${TIMESTAMP}.sql.gz"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_FILE}"

log "Starting backup of database '${DB_NAME}' on ${DB_HOST}:${DB_PORT}..."

if pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
      --no-owner --no-acl | gzip > "$BACKUP_PATH"; then
  BACKUP_SIZE=$(du -h "$BACKUP_PATH" | cut -f1)
  log "Backup completed: ${BACKUP_FILE} (${BACKUP_SIZE})"
else
  rm -f "$BACKUP_PATH"
  die "pg_dump failed"
fi

# ── Retention cleanup ────────────────────────────────────────
cleanup() {
  log "Running retention cleanup..."

  local today
  today=$(date '+%Y-%m-%d')

  # Collect files to keep
  declare -A keep

  # 1) Keep the last N daily backups (most recent per day)
  local day_count=0
  local prev_day=""
  for f in $(ls -1t "$BACKUP_DIR"/luka_backup_*.sql.gz 2>/dev/null); do
    local fname
    fname=$(basename "$f")
    local fdate
    fdate=$(echo "$fname" | sed -n 's/luka_backup_\([0-9-]*\)_.*/\1/p')
    [ -z "$fdate" ] && continue

    if [ "$fdate" != "$prev_day" ]; then
      day_count=$((day_count + 1))
      prev_day="$fdate"
    fi

    if [ $day_count -le $RETENTION_DAILY ]; then
      keep["$fname"]=1
    fi
  done

  # 2) Keep weekly backups (Sundays) — last N weeks
  local week_count=0
  local prev_week=""
  for f in $(ls -1t "$BACKUP_DIR"/luka_backup_*.sql.gz 2>/dev/null); do
    local fname
    fname=$(basename "$f")
    local fdate
    fdate=$(echo "$fname" | sed -n 's/luka_backup_\([0-9-]*\)_.*/\1/p')
    [ -z "$fdate" ] && continue

    # Check if this date is a Sunday (day of week = 0)
    local dow
    dow=$(date -d "$fdate" '+%u' 2>/dev/null || date -j -f '%Y-%m-%d' "$fdate" '+%u' 2>/dev/null || echo "")
    [ "$dow" != "7" ] && continue

    if [ "$fdate" != "$prev_week" ]; then
      week_count=$((week_count + 1))
      prev_week="$fdate"
    fi

    if [ $week_count -le $RETENTION_WEEKLY ]; then
      keep["$fname"]=1
    fi
  done

  # 3) Keep monthly backups (1st of month) — last N months
  local month_count=0
  local prev_month=""
  for f in $(ls -1t "$BACKUP_DIR"/luka_backup_*.sql.gz 2>/dev/null); do
    local fname
    fname=$(basename "$f")
    local fdate
    fdate=$(echo "$fname" | sed -n 's/luka_backup_\([0-9-]*\)_.*/\1/p')
    [ -z "$fdate" ] && continue

    # Check if day is 01
    local day
    day=$(echo "$fdate" | cut -d'-' -f3)
    [ "$day" != "01" ] && continue

    local month
    month=$(echo "$fdate" | cut -d'-' -f1,2)
    if [ "$month" != "$prev_month" ]; then
      month_count=$((month_count + 1))
      prev_month="$month"
    fi

    if [ $month_count -le $RETENTION_MONTHLY ]; then
      keep["$fname"]=1
    fi
  done

  # Remove files that are not in the keep set
  local removed=0
  for f in "$BACKUP_DIR"/luka_backup_*.sql.gz; do
    [ ! -f "$f" ] && continue
    local fname
    fname=$(basename "$f")
    if [ -z "${keep[$fname]+_}" ]; then
      log "Removing old backup: $fname"
      rm -f "$f"
      removed=$((removed + 1))
    fi
  done

  log "Cleanup complete. Removed ${removed} old backup(s)."
}

cleanup

log "Backup process finished successfully."
exit 0
