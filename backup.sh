#!/bin/bash
# Backup diario de la DB Mercadito.
# Lo invoca /etc/cron.d/mercadito-backup a las 03:00 hora servidor.
# Output: /opt/mercadito/backups/mercadito-YYYY-MM-DD.sql.gz
# Retención: 30 días (los más viejos se borran).

set -euo pipefail

BACKUP_DIR="/opt/mercadito/backups"
DB_CONTAINER="n8n-postgres-1"
DB_USER="n8n_user"
DB_NAME="mercadito"
RETENTION_DAYS=30

mkdir -p "$BACKUP_DIR"

FECHA=$(date -u +%Y-%m-%d)
OUT="$BACKUP_DIR/mercadito-$FECHA.sql.gz"

docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$OUT"

SIZE=$(stat -c%s "$OUT")
echo "OK: $OUT ($SIZE bytes)"

# Cleanup: borrar backups con más de RETENTION_DAYS días
find "$BACKUP_DIR" -name 'mercadito-*.sql.gz' -mtime "+$RETENTION_DAYS" -delete
