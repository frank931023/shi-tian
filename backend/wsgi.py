"""WSGI 進入點:gunicorn 會載入這個檔的 `app` 物件來啟動服務。

本機開發也可直接 `python wsgi.py` 用 Flask 內建伺服器跑(僅供開發)。
"""

from app import create_app

app = create_app()


if __name__ == "__main__":
    # 開發用伺服器,正式環境一律用 gunicorn(見 gunicorn.conf.py)。
    app.run(host="0.0.0.0", port=8000, debug=True)
