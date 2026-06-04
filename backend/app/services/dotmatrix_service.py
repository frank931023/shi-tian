"""點陣套表列印:用 ReportLab 以「座標設定檔」把資料精準定位輸出。

原理:
- 現成三聯複寫單已經印好框線與標題,點陣機只需把「資料」打進對應空格。
- 所以這裡輸出的 PDF「只有資料、沒有框線」,座標對準現成表單的欄位即可。
- 座標單位是 point(1/72 inch);ReportLab 原點在左下角,y 向上。
- 全域 offset(x/y)用來微調對位 —— 印校正頁、量測、改 offset、再印,反覆對準。
  改 JSON 設定檔即可,不必改程式(符合文件需求)。

字型:用 ReportLab 內建 CID 字型 'MSung-Light'(繁體,免額外字型檔,跨平台)。
未來要更完整字集可改註冊 Noto CJK TTF。
"""

import json
from pathlib import Path

from flask import current_app
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfgen import canvas

from app.models import Order

# 繁體中文 CID 字型(免額外字型檔)。要換字型只改這個常數 + _ensure_font。
_FONT = "MSung-Light"
_font_ready = False


def _ensure_font():
    global _font_ready
    if not _font_ready:
        pdfmetrics.registerFont(UnicodeCIDFont(_FONT))
        _font_ready = True


# 預設座標設定(A4 直式;使用者用校正頁量測後微調)
DEFAULT_LAYOUT = {
    "page": {"width": A4[0], "height": A4[1]},
    "offset": {"x": 0, "y": 0},
    "font_size": 10,
    "fields": {
        "order_no": {"x": 470, "y": 800},
        "vendor_name": {"x": 95, "y": 770},
        "receiver_name": {"x": 95, "y": 748},
        "order_date": {"x": 320, "y": 770},
    },
    "items": {
        "start_y": 690,
        "row_height": 24,
        "max_rows": 12,
        "cols": {
            "product_name": 70,
            "spec": 165,
            "process_item": 260,
            "net_weight_kg": 360,
            "quantity": 420,
            "unit": 465,
            "remark": 505,
        },
    },
}


def _layout_path() -> Path:
    return Path(current_app.config["DOTMATRIX_LAYOUT"])


def load_layout() -> dict:
    """讀取座標設定;不存在則寫入預設值後回傳。"""
    path = _layout_path()
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(DEFAULT_LAYOUT, ensure_ascii=False, indent=2), encoding="utf-8")
    return dict(DEFAULT_LAYOUT)


def save_layout(layout: dict) -> None:
    path = _layout_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(layout, ensure_ascii=False, indent=2), encoding="utf-8")


def _fmt(v, numeric=False) -> str:
    if v is None:
        return ""
    if numeric:
        f = float(v)
        return f"{f:.2f}" if f % 1 else f"{int(f)}"
    return str(v)


def render_overlay_pdf(order: Order, layout: dict | None = None) -> bytes:
    """產生「只有資料」的套表 PDF。"""
    _ensure_font()
    lay = layout or load_layout()
    from io import BytesIO

    buf = BytesIO()
    w, h = lay["page"]["width"], lay["page"]["height"]
    ox, oy = lay["offset"]["x"], lay["offset"]["y"]
    size = lay.get("font_size", 10)
    c = canvas.Canvas(buf, pagesize=(w, h))
    c.setFont(_FONT, size)

    data = order.to_dict()
    f = lay["fields"]

    def put(x, y, text):
        c.drawString(x + ox, y + oy, text)

    put(f["order_no"]["x"], f["order_no"]["y"], data["order_no"])
    put(f["vendor_name"]["x"], f["vendor_name"]["y"], _fmt(data.get("vendor_name")))
    put(f["receiver_name"]["x"], f["receiver_name"]["y"], _fmt(data.get("receiver_name")))
    put(f["order_date"]["x"], f["order_date"]["y"], _fmt(data.get("order_date")))

    items_cfg = lay["items"]
    cols = items_cfg["cols"]
    y = items_cfg["start_y"]
    for i, it in enumerate(data["items"]):
        if i >= items_cfg.get("max_rows", 99):
            break
        put(cols["product_name"], y, _fmt(it.get("product_name")))
        put(cols["spec"], y, _fmt(it.get("spec")))
        put(cols["process_item"], y, _fmt(it.get("process_item")))
        put(cols["net_weight_kg"], y, _fmt(it.get("net_weight_kg"), numeric=True))
        put(cols["quantity"], y, _fmt(it.get("quantity"), numeric=True))
        put(cols["unit"], y, _fmt(it.get("unit")))
        if "remark" in cols:
            put(cols["remark"], y, _fmt(it.get("remark")))
        y -= items_cfg["row_height"]

    c.showPage()
    c.save()
    return buf.getvalue()


def render_calibration_pdf(layout: dict | None = None) -> bytes:
    """校正頁:畫座標格線 + 在每個欄位位置標出名稱與座標,協助對位。"""
    _ensure_font()
    lay = layout or load_layout()
    from io import BytesIO

    buf = BytesIO()
    w, h = lay["page"]["width"], lay["page"]["height"]
    ox, oy = lay["offset"]["x"], lay["offset"]["y"]
    c = canvas.Canvas(buf, pagesize=(w, h))

    # 每 50pt 一條淡格線 + 座標刻度
    c.setFont("Helvetica", 6)
    c.setStrokeColorRGB(0.8, 0.8, 0.8)
    step = 50
    x = 0
    while x <= w:
        c.line(x, 0, x, h)
        c.drawString(x + 1, 2, str(x))
        x += step
    y = 0
    while y <= h:
        c.line(0, y, w, y)
        c.drawString(2, y + 1, str(y))
        y += step

    # 標出每個欄位的位置(含 offset)
    c.setFont(_FONT, lay.get("font_size", 10))
    c.setFillColorRGB(0.8, 0, 0)
    for name, pos in lay["fields"].items():
        c.drawString(pos["x"] + ox, pos["y"] + oy, f"[{name}]")
    items_cfg = lay["items"]
    yy = items_cfg["start_y"]
    for name, cx in items_cfg["cols"].items():
        c.drawString(cx + ox, yy + oy, name)

    c.setFillColorRGB(0, 0, 0)
    c.setFont("Helvetica", 9)
    c.drawString(20, h - 20, f"Calibration grid (offset x={ox} y={oy}) — 調整 offset 後重印對位")
    c.showPage()
    c.save()
    return buf.getvalue()
