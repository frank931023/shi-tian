"""Gunicorn 設定。

為什麼用 gunicorn:Flask 內建伺服器只適合開發,不能扛正式流量;
gunicorn 用多個 worker 行程處理並發請求,是 Python WSGI 的標準作法。
"""

import multiprocessing

# 監聽容器內的 8000 埠(Caddy 會反代到 backend:8000)。
bind = "0.0.0.0:8000"

# worker 數量:常見公式 = (CPU 核心數 * 2 + 1)。
workers = multiprocessing.cpu_count() * 2 + 1

# 每個 worker 的請求逾時(秒)。
timeout = 30

# 存取與錯誤日誌輸出到 stdout/stderr,交給 docker 收集。
accesslog = "-"
errorlog = "-"
