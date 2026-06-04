"""點陣套表的列印工具 API:校正頁、座標設定檔讀寫。"""

from io import BytesIO

from flask import Blueprint, request, send_file
from flask_login import login_required

from app.core.responses import err, ok
from app.core.security import admin_required
from app.services import dotmatrix_service

printing_bp = Blueprint("printing", __name__)


@printing_bp.get("/print/calibration")
@login_required
def calibration():
    """產生校正頁 PDF(印在現成三聯單上,量測並調整 offset)。"""
    pdf = dotmatrix_service.render_calibration_pdf()
    return send_file(BytesIO(pdf), mimetype="application/pdf",
                     as_attachment=False, download_name="calibration.pdf")


@printing_bp.get("/print/dotmatrix-layout")
@login_required
def get_layout():
    return ok(dotmatrix_service.load_layout())


@printing_bp.put("/print/dotmatrix-layout")
@login_required
@admin_required
def update_layout():
    """更新座標設定(尤其 offset)。前端可做成校正介面,免改程式微調。"""
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return err("invalid_json", "請傳入 JSON 設定", 400)
    dotmatrix_service.save_layout(body)
    return ok(body)
