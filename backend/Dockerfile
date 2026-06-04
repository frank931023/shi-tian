# 後端映像:Flask + Gunicorn
# 用 slim 基底,體積小;先裝相依再複製程式碼,讓 Docker layer cache 生效。
FROM python:3.11-slim

# 不產生 .pyc、輸出不緩衝(日誌即時)
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# 先只複製 requirements,安裝相依 —— 之後改程式碼不會重裝套件
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 複製應用程式碼
COPY . .

# Flask CLI 需要知道 app 在哪(entrypoint 的 flask db upgrade 會用到)
ENV FLASK_APP=wsgi.py

# 讓 entrypoint 可執行
RUN chmod +x entrypoint.sh

EXPOSE 8000

# 啟動:先套 migration 再起 gunicorn
CMD ["./entrypoint.sh"]
