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


def _company_cfg() -> dict:
    cfg = current_app.config
    return {
        "name1": cfg["COMPANY_NAME_1"],
        "name2": cfg["COMPANY_NAME_2"],
        "address": cfg["COMPANY_ADDRESS"],
        "tel": cfg["COMPANY_TEL"],
        "fax": cfg["COMPANY_FAX"],
    }


def _pages_html(data: dict, company: dict, pages: list) -> str:
    return render_template("order_pdf.html", order=data, company=company, pages=pages)


def _sheet_page_count(HTML, data: dict, company: dict, rows: list, blank_rows: int) -> int:
    """試排「單獨一張 sheet」,回傳它實際佔幾頁(>1 代表塞不下)。"""
    pages = [{
        "rows": rows,
        "blank_rows": blank_rows,
        # 用帶後綴的 NO 試排,寬度比照最終輸出,避免邊界誤差
        "order_no": f"{data.get('order_no') or ''}-01",
        "page_no": 1,
        "page_count": 1,
    }]
    return len(HTML(string=_pages_html(data, company, pages)).render().pages)


def _paginate(HTML, data: dict, company: dict) -> list:
    """動態分頁:用實際排版高度,把每一張紙塞到滿才換下一張(不固定每張幾筆)。"""
    items = data["items"]
    base_no = data.get("order_no") or ""

    # 1) 貪婪打包:逐筆加入目前這張,直到再加一筆會爆頁就換新的一張
    sheets: list[list] = []
    cur: list = []
    for it in items:
        if _sheet_page_count(HTML, data, company, cur + [it], 0) <= 1:
            cur.append(it)
        elif cur:
            sheets.append(cur)
            cur = [it]
        else:
            sheets.append([it])  # 單筆就超過一頁(極端情況),自己佔一張
            cur = []
    if cur or not sheets:
        sheets.append(cur)

    # 2) 每一張用空白列補到滿(版面像預印單據,格線到底)
    n = len(sheets)
    pages = []
    for idx, rows in enumerate(sheets):
        blanks = 0
        while _sheet_page_count(HTML, data, company, rows, blanks + 1) <= 1:
            blanks += 1
        pages.append({
            "rows": rows,
            "blank_rows": blanks,
            "order_no": base_no if n == 1 else f"{base_no}-{idx + 1:02d}",
            "page_no": idx + 1,
            "page_count": n,
        })
    return pages


def render_order_html(order: Order) -> str:
    """單純 HTML(單張、不分頁),給除錯/預覽用;實際 PDF 走 order_to_pdf_bytes 會動態分頁。"""
    data = order.to_dict()
    company = _company_cfg()
    pages = [{
        "rows": data["items"], "blank_rows": 0,
        "order_no": data.get("order_no") or "", "page_no": 1, "page_count": 1,
    }]
    return _pages_html(data, company, pages)


def order_to_pdf_bytes(order: Order) -> bytes:
    try:
        from weasyprint import HTML  # 延遲匯入
    except Exception as e:  # pragma: no cover - 視環境而定
        raise PdfUnavailable(
            "PDF 產生需要 WeasyPrint 與其系統相依(pango/cairo),"
            "請在後端容器內執行。原始錯誤:%s" % e
        )
    data = order.to_dict()
    company = _company_cfg()
    pages = _paginate(HTML, data, company)
    return HTML(string=_pages_html(data, company, pages)).write_pdf()


def _num(s) -> float:
    try:
        return float(str(s).replace(",", "").strip() or 0)
    except (TypeError, ValueError):
        return 0.0


def _fmt_money(n: float) -> str:
    return "{:,.2f}".format(n).rstrip("0").rstrip(".")


def _recompute_statement(data: dict) -> dict:
    """後端重算金額/稅額/總計,不信任前端傳來的合計(對齊 CLAUDE.md §4)。

    每列金額 = 數量 × 單價(由後端算);合計 = 各列金額和;
    稅額 = 合計 × 稅率%(四捨五入);總計 = 合計 + 稅額。
    """
    data = dict(data)
    rows = [dict(r) for r in (data.get("rows") or [])]
    total = 0.0
    for r in rows:
        if str(r.get("unit_price", "")).strip() != "":
            amt = _num(r.get("quantity")) * _num(r.get("unit_price"))
            r["amount"] = _fmt_money(amt)
            total += amt
    pct = max(0.0, _num(data.get("tax_pct", "5")))
    # 用「四捨五入」對齊前端 Math.round(避免 Python round 的銀行家捨入造成差 1)
    import math
    tax = math.floor(total * pct / 100 + 0.5)
    data["rows"] = rows
    data["total_amount"] = _fmt_money(total)
    data["tax"] = _fmt_money(tax)
    data["grand"] = _fmt_money(total + tax)
    return data


def render_statement_html(data: dict) -> str:
    """銷貨統計表 HTML(明細/單價由前端帶入,但金額/稅額/總計一律後端重算)。"""
    cfg = current_app.config
    company = {"name1": cfg["COMPANY_NAME_1"], "tel": cfg["COMPANY_TEL"], "fax": cfg["COMPANY_FAX"]}
    return render_template("sales_statement_pdf.html", d=_recompute_statement(data), company=company)


def statement_to_pdf_bytes(data: dict) -> bytes:
    try:
        from weasyprint import HTML  # 延遲匯入
    except Exception as e:  # pragma: no cover - 視環境而定
        raise PdfUnavailable(
            "PDF 產生需要 WeasyPrint 與其系統相依(pango/cairo),請在後端容器內執行。原始錯誤:%s" % e
        )
    return HTML(string=render_statement_html(data)).write_pdf()


def _safe_name(s: str) -> str:
    """把單號清成安全檔名(只留英數字、- 與 _),防路徑穿越;空字串退回 order。"""
    cleaned = "".join(c for c in (s or "") if c.isalnum() or c in "-_")
    return cleaned or "order"


def archive_path(order: Order) -> Path:
    """PDF 封存路徑:archive/<YYYY-MM>/<order_no>.pdf。"""
    base = Path(current_app.config["ARCHIVE_DIR"])
    month = order.order_date.strftime("%Y-%m") if order.order_date else "unknown"
    folder = base / month
    folder.mkdir(parents=True, exist_ok=True)
    # 雙重保險:即使單號驗證有疏漏,檔名也已清過,不會跳出封存資料夾
    return folder / f"{_safe_name(order.order_no)}.pdf"


def generate_and_archive(order: Order) -> Path:
    """產生 PDF 並寫入封存資料夾,回傳檔案路徑。"""
    pdf = order_to_pdf_bytes(order)
    path = archive_path(order)
    path.write_bytes(pdf)
    return path
