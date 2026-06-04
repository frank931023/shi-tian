"""資料庫物件集中定義。

把 db / migrate 放在獨立模組,避免 circular import:
models 只 import 這裡的 db,app 工廠再 import models 與 db 來初始化。
"""

from flask_migrate import Migrate
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()
migrate = Migrate()
