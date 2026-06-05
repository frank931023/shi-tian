#!/bin/sh
# 開發:基底 + override(db/backend 對外開埠)。用法:sh scripts/dev-up.sh
set -e
cd "$(dirname "$0")/.."
docker compose up -d --build "$@"
echo "[dev] 已啟動。前端 https://localhost、API 也可直連 http://localhost:8000"
