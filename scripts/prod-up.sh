#!/bin/sh
# 正式:基底 + prod(強制安全旗標、Redis 限流、NAS volume),不套 dev override。
# 用法:sh scripts/prod-up.sh
set -e
cd "$(dirname "$0")/.."
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build "$@"
echo "[prod] 已啟動。對外只有 Caddy(80/443)。"
