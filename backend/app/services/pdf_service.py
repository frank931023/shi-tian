"""產生訂單 PDF(WeasyPrint)。

為什麼用 WeasyPrint:用 HTML/CSS 排版單據,版面好設計、好維護(改欄位只動模板);
比起用座標硬刻,維護成本低很多。點陣套表(需精準座標)是另一條路線,見 Phase 7。

注意:WeasyPrint 需要系統庫(pango/cairo),在後端 Linux 容器內可用;
Windows 本機 venv 通常沒有,因此這裡延遲匯入,沒有時給清楚錯誤,不影響其他 API。
"""

from pathlib import Path

from flask import current_app, render_template

from app.models import Order


class PdfUnavailable(RuntimeError):
    """WeasyPrint(或其系統相依)不可用時拋出。"""


def render_order_html(order: Order) -> str:
    cfg = current_app.config
    company = {
        "name1": cfg["COMPANY_NAME_1"],
        "name2": cfg["COMPANY_NAME_2"],
        "address": cfg["COMPANY_ADDRESS"],
        "tel": cfg["COMPANY_TEL"],
        "fax": cfg["COMPANY_FAX"],
    }
    data = order.to_dict()
    # 補滿到至少 8 列,版面比較穩定、好對紙
    blank_rows = max(0, 8 - len(data["items"]))
    # 注意:items 另外傳,避免 Jinja 把 dict 的 order.items 解析成方法
    return render_template(
        "order_pdf.html", order=data, items=data["items"], company=company, blank_rows=blank_rows
    )


def order_to_pdf_bytes(order: Order) -> bytes:
    try:
        from weasyprint import HTML  # 延遲匯入
    except Exception as e:  # pragma: no cover - 視環境而定
        raise PdfUnavailable(
            "PDF 產生需要 WeasyPrint 與其系統相依(pango/cairo),"
            "請在後端容器內執行。原始錯誤:%s" % e
        )
    html = render_order_html(order)
    return HTML(string=html).write_pdf()


def render_statement_html(data: dict) -> str:
    """銷貨統計表 HTML(資料由前端帶入:含使用者填的單價/加工單號等)。"""
    cfg = current_app.config
    company = {"name1": cfg["COMPANY_NAME_1"], "tel": cfg["COMPANY_TEL"], "fax": cfg["COMPANY_FAX"]}
    return render_template("sales_statement_pdf.html", d=data, company=company)


def statement_to_pdf_bytes(data: dict) -> bytes:
    try:
        from weasyprint import HTML  # 延遲匯入
    except Exception as e:  # pragma: no cover - 視環境而定
        raise PdfUnavailable(
            "PDF 產生需要 WeasyPrint 與其系統相依(pango/cairo),請在後端容器內執行。原始錯誤:%s" % e
        )
    return HTML(string=render_statement_html(data)).write_pdf()


def archive_path(order: Order) -> Path:
    """PDF 封存路徑:archive/<YYYY-MM>/<order_no>.pdf。"""
    base = Path(current_app.config["ARCHIVE_DIR"])
    month = order.order_date.strftime("%Y-%m") if order.order_date else "unknown"
    folder = base / month
    folder.mkdir(parents=True, exist_ok=True)
    return folder / f"{order.order_no}.pdf"


def generate_and_archive(order: Order) -> Path:
    """產生 PDF 並寫入封存資料夾,回傳檔案路徑。"""
    pdf = order_to_pdf_bytes(order)
    path = archive_path(order)
    path.write_bytes(pdf)
    return path
