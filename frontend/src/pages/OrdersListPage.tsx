import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError } from "../api/client";
import { companiesApi, ordersApi, type OrderFilters } from "../api/resources";
import { Button, Card, ErrorBar, Input, Modal, Pager, Select, Spinner } from "../components/ui";
import type { Company, Order, Paginated } from "../lib/types";

const PAGE_SIZE = 10;

export default function OrdersListPage() {
  const navigate = useNavigate();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [data, setData] = useState<Paginated<Order> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 篩選條件
  const [filters, setFilters] = useState<OrderFilters>({ page: 1, page_size: PAGE_SIZE });

  useEffect(() => {
    companiesApi.list().then(setCompanies).catch(() => {});
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    ordersApi
      .list(filters)
      .then((d) => alive && setData(d))
      .catch((err) => alive && setError(err instanceof ApiError ? err.message : "載入失敗"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [filters]);

  function setFilter(patch: Partial<OrderFilters>) {
    // 改任何篩選都回到第 1 頁
    setFilters((f) => ({ ...f, ...patch, page: 1 }));
  }

  // 刪除二次確認:開 Modal,需輸入單號才可真的刪
  const [delTarget, setDelTarget] = useState<Order | null>(null);
  const [delText, setDelText] = useState("");
  const [delBusy, setDelBusy] = useState(false);
  const [delErr, setDelErr] = useState<string | null>(null);

  function onDelete(o: Order) {
    setDelTarget(o);
    setDelText("");
    setDelErr(null);
  }
  async function confirmDelete() {
    if (!delTarget || delText.trim() !== delTarget.order_no) return;
    setDelBusy(true);
    setDelErr(null);
    try {
      await ordersApi.remove(delTarget.id);
      setDelTarget(null);
      setFilters((f) => ({ ...f })); // 觸發重新載入
    } catch (err) {
      setDelErr(err instanceof ApiError ? err.message : "刪除失敗");
    } finally {
      setDelBusy(false);
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  // 下載目前篩選結果(用 <a> 觸發,attachment 會直接下載不換頁)
  function download(format: "xlsx" | "csv") {
    const a = document.createElement("a");
    a.href = ordersApi.exportUrl(filters, format);
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold sm:text-2xl">訂單清單</h1>
        <Link to="/orders/new">
          <Button>+ 建單</Button>
        </Link>
      </div>

      {/* 篩選列:手機單欄、平板以上多欄 */}
      <Card>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input
            type="date"
            className="min-h-[48px] rounded-xl border border-slate-300 px-3"
            value={filters.from ?? ""}
            onChange={(e) => setFilter({ from: e.target.value || undefined })}
            aria-label="起始日期"
          />
          <input
            type="date"
            className="min-h-[48px] rounded-xl border border-slate-300 px-3"
            value={filters.to ?? ""}
            onChange={(e) => setFilter({ to: e.target.value || undefined })}
            aria-label="結束日期"
          />
          <Select
            value={filters.vendor_id ?? ""}
            onChange={(e) => setFilter({ vendor_id: e.target.value ? Number(e.target.value) : undefined })}
          >
            <option value="">全部廠商</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
          <input
            type="search"
            placeholder="搜尋單號 / 備註"
            className="min-h-[48px] rounded-xl border border-slate-300 px-3"
            value={filters.q ?? ""}
            onChange={(e) => setFilter({ q: e.target.value || undefined })}
          />
        </div>
      </Card>

      {/* 下載目前篩選結果(全部,不分頁) */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-500">
          下載目前篩選結果{data ? `(共 ${data.total} 筆)` : ""}:
        </span>
        <Button variant="secondary" onClick={() => download("xlsx")} disabled={!data || data.total === 0}>
          ⬇ Excel
        </Button>
        <Button variant="secondary" onClick={() => download("csv")} disabled={!data || data.total === 0}>
          ⬇ CSV
        </Button>
      </div>

      <ErrorBar message={error} />

      {loading ? (
        <Spinner />
      ) : !data || data.items.length === 0 ? (
        <Card>
          <p className="py-8 text-center text-slate-500">沒有符合條件的訂單</p>
        </Card>
      ) : (
        <>
          {/* 筆電:表格 */}
          <Card className="hidden overflow-x-auto lg:block">
            <table className="w-full text-left">
              <thead className="border-b border-slate-200 text-sm text-slate-500">
                <tr>
                  <th className="py-2 pr-3">單號</th>
                  <th className="py-2 pr-3">日期</th>
                  <th className="py-2 pr-3">廠商</th>
                  <th className="py-2 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((o) => (
                  <tr key={o.id} className="border-b border-slate-100">
                    <td className="py-3 pr-3 font-medium">{o.order_no}</td>
                    <td className="py-3 pr-3">{o.order_date}</td>
                    <td className="py-3 pr-3">{o.vendor_name ?? "-"}</td>
                    <td className="py-3 text-right">
                      <RowActions order={o} onDelete={onDelete} navigate={navigate} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* 手機/平板:卡片 */}
          <div className="space-y-3 lg:hidden">
            {data.items.map((o) => (
              <Card key={o.id} className="space-y-2">
                <div>
                  <p className="font-bold">{o.order_no}</p>
                  <p className="text-sm text-slate-500">{o.order_date} · {o.vendor_name ?? "-"}</p>
                </div>
                <RowActions order={o} onDelete={onDelete} navigate={navigate} />
              </Card>
            ))}
          </div>

          {/* 分頁 */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-slate-500">共 {data.total} 筆</span>
            <Pager page={data.page} totalPages={totalPages} onChange={(p) => setFilters((f) => ({ ...f, page: p }))} />
          </div>
        </>
      )}

      {/* 刪除二次確認:必須輸入單號才能刪(防誤刪;此操作會永久刪除) */}
      <Modal
        open={delTarget !== null}
        title="刪除訂單"
        onClose={() => !delBusy && setDelTarget(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDelTarget(null)} disabled={delBusy}>取消</Button>
            <Button
              variant="danger"
              onClick={confirmDelete}
              disabled={delBusy || delText.trim() !== delTarget?.order_no}
            >
              {delBusy ? "刪除中…" : "確認刪除"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-slate-700">
            此動作會<b className="text-red-600">永久刪除</b>單號
            <b className="mx-1">{delTarget?.order_no}</b>
            及其所有品項,<b className="text-red-600">無法復原</b>。
          </p>
          <p className="text-sm text-slate-500">請輸入此單號以確認刪除:</p>
          <Input
            value={delText}
            onChange={(e) => setDelText(e.target.value)}
            placeholder={delTarget?.order_no}
            autoFocus
          />
          <ErrorBar message={delErr} />
        </div>
      </Modal>
    </div>
  );
}

function RowActions({
  order,
  onDelete,
  navigate,
}: {
  order: Order;
  onDelete: (o: Order) => void;
  navigate: (to: string) => void;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <a
        className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
        href={ordersApi.pdfUrl(order.id)}
        target="_blank"
        rel="noreferrer"
      >
        PDF
      </a>
      <button className="rounded-lg px-3 py-2 text-sm text-brand hover:bg-blue-50" onClick={() => navigate(`/orders/${order.id}/edit`)}>
        編輯
      </button>
      <button className="rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50" onClick={() => onDelete(order)}>
        刪除
      </button>
    </div>
  );
}
