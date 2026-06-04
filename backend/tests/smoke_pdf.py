"""Phase 4 煙霧測試:用記憶體中的訂單產生 PDF,驗證 WeasyPrint 與中文字型可用。
需在後端容器內執行(Windows venv 沒有 WeasyPrint 系統相依)。

    docker compose run --rm --no-deps -e SECRET_KEY=test -e DATABASE_URL=sqlite:// backend python tests/smoke_pdf.py
"""

import os
from datetime import date

os.environ.setdefault("SECRET_KEY", "test")
os.environ.setdefault("DATABASE_URL", "sqlite://")

from app import create_app  # noqa: E402
from app.models import Order, OrderItem  # noqa: E402
from app.services import pdf_service  # noqa: E402


def main() -> None:
    app = create_app()
    with app.app_context():
        order = Order(order_no="20260604-001", order_date=date(2026, 6, 4), total_amount=80, note="測試備註")
        order.items = [
            OrderItem(sort_order=0, product_name="HBS", spec="1/2-H17", process_item="車刃、咬花",
                      net_weight_kg=3000, quantity=1, unit="K", unit_price=50, amount=50),
            OrderItem(sort_order=1, product_name="螺帽", spec="1/2-H19", process_item="咬花",
                      quantity=3, unit="K", unit_price=10, amount=30),
        ]
        pdf = pdf_service.order_to_pdf_bytes(order)
        assert pdf[:4] == b"%PDF", "輸出不是有效 PDF"
        out = "/tmp/smoke_order.pdf"
        with open(out, "wb") as f:
            f.write(pdf)
        print(f"✅ PDF 產生成功,{len(pdf)} bytes,前綴 {pdf[:8]!r} → {out}")


if __name__ == "__main__":
    main()
