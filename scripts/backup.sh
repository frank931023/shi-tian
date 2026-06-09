#!/bin/sh
# 每日資料庫備份(pg_dump → gzip)。
# 預設「全部保留、永不自動刪除」。
# 若想自動清理舊檔,執行時設環境變數 KEEP_DAYS(例:KEEP_DAYS=30 sh scripts/backup.sh)。
# 用法(在 repo 根目錄):  sh scripts/backup.sh
# 建議用 cron 每日跑;備份檔再同步到異地/外接,符合 3-2-1 原則。
set -e
cd "$(dirname "$0")/.."

BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${KEEP_DAYS:-0}"   # 0 = 全部保留,不自動刪除
DB_SERVICE="${DB_SERVICE:-db}"

# 從 .env 讀 DB 帳密
[ -f .env ] && . ./.env

TS=$(date +%Y%m%d-%H%M%S)
mkdir -p "$BACKUP_DIR"
OUT="$BACKUP_DIR/shitian-$TS.sql.gz"

echo "[backup] dumping $POSTGRES_DB ..."
docker compose exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" "$DB_SERVICE" \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$OUT"

echo "[backup] -> $OUT ($(du -h "$OUT" | cut -f1))"

# 只有 KEEP_DAYS 設成大於 0 才清理舊備份;預設 0 = 永久保留,不刪任何東西
if [ "$KEEP_DAYS" -gt 0 ] 2>/dev/null; then
  find "$BACKUP_DIR" -name 'shitian-*.sql.gz' -mtime +"$KEEP_DAYS" -delete 2>/dev/null || true
  echo "[backup] done (保留最近 $KEEP_DAYS 天)"
else
  echo "[backup] done (全部保留,不自動刪除)"
fi
