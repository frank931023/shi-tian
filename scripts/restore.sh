#!/bin/sh
# 從備份還原資料庫。
# 用法:  sh scripts/restore.sh backups/shitian-YYYYmmdd-HHMMSS.sql.gz
# 注意:會把備份內容灌回現有資料庫(同名物件會衝突時請先還原到空庫)。
set -e
cd "$(dirname "$0")/.."

FILE="$1"
[ -z "$FILE" ] && { echo "用法: sh scripts/restore.sh <backup.sql.gz>"; exit 1; }
[ -f "$FILE" ] || { echo "找不到備份檔:$FILE"; exit 1; }

DB_SERVICE="${DB_SERVICE:-db}"
[ -f .env ] && . ./.env

echo "[restore] 還原 $FILE → $POSTGRES_DB ..."
gunzip -c "$FILE" | docker compose exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" "$DB_SERVICE" \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
echo "[restore] done"
