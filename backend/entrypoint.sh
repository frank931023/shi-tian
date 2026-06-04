#!/bin/sh
# 容器啟動流程:
# 1. 等待 / 套用資料庫 migration(把 schema 升到最新)
# 2. 啟動 gunicorn
#
# 把 migration 放在啟動時做,部署時就不必手動進容器跑指令。
set -e

echo "[entrypoint] 套用資料庫 migration..."
flask db upgrade

echo "[entrypoint] 啟動 gunicorn..."
exec gunicorn -c gunicorn.conf.py wsgi:app
