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

EXPOSE 8000

# 以 gunicorn 啟動,載入 wsgi.py 裡的 app 物件
CMD ["gunicorn", "-c", "gunicorn.conf.py", "wsgi:app"]
