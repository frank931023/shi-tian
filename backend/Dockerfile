# 後端映像:Flask + Gunicorn
# 用 slim 基底,體積小;先裝相依再複製程式碼,讓 Docker layer cache 生效。
FROM python:3.11-slim

# 不產生 .pyc、輸出不緩衝(日誌即時)
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# 系統相依:
# - WeasyPrint 需要 pango / cairo / gdk-pixbuf(PDF 排版)
# - fonts-noto-cjk:中文字型(否則 PDF 中文會變方框)
# - cups-client:提供 lp 指令(送印到 CUPS;Phase 4/7)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpango-1.0-0 libpangocairo-1.0-0 libgdk-pixbuf-2.0-0 \
    libcairo2 libffi8 fonts-noto-cjk \
    cups-client \
    && rm -rf /var/lib/apt/lists/*

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
