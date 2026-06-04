import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError } from "../api/client";
import { companiesApi, ordersApi, type OrderFilters } from "../api/resources";
import { Button, Card, ErrorBar, Select, Spinner, StatusBadge } from "../components/ui";
import { useAuth } from "../lib/AuthContext";
import { money } from "../lib/format";
import type { Company, Order, Paginated } from "../lib/types";

const PAGE_SIZE = 20;

export default function OrdersListPage() {
  const { user } = useAuth();
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

  async function onDelete(o: Order) {
    if (!confirm(`確定要刪除單號 ${o.order_no}?此動作無法復原。`)) return;
    try {
      await ordersApi.remove(o.id);
      setFilters((f) => ({ ...f })); // 觸發重新載入
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "刪除失敗");
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
          <Select
            value={filters.status ?? ""}
            onChange={(e) => setFilter({ status: e.target.value || undefined })}
          >
            <option value="">全部狀態</option>
            <option value="draft">草稿</option>
            <option value="confirmed">已確認</option>
            <option value="printed">已列印</option>
            <option value="void">作廢</option>
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
                  <th className="py-2 pr-3">狀態</th>
                  <th className="py-2 pr-3 text-right">金額</th>
                  <th className="py-2 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((o) => (
                  <tr key={o.id} className="border-b border-slate-100">
                    <td className="py-3 pr-3 font-medium">{o.order_no}</td>
                    <td className="py-3 pr-3">{o.order_date}</td>
                    <td className="py-3 pr-3">{o.vendor_name ?? "-"}</td>
                    <td className="py-3 pr-3"><StatusBadge status={o.status} /></td>
                    <td className="py-3 pr-3 text-right font-semibold">{money(o.total_amount)}</td>
                    <td className="py-3 text-right">
                      <RowActions order={o} isAdmin={user?.role === "admin"} onDelete={onDelete} navigate={navigate} />
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
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-bold">{o.order_no}</p>
                    <p className="text-sm text-slate-500">{o.order_date} · {o.vendor_name ?? "-"}</p>
                  </div>
                  <StatusBadge status={o.status} />
                </div>
                <p className="text-lg font-semibold text-brand">{money(o.total_amount)}</p>
                <RowActions order={o} isAdmin={user?.role === "admin"} onDelete={onDelete} navigate={navigate} />
              </Card>
            ))}
          </div>

          {/* 分頁 */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">
              共 {data.total} 筆 · 第 {data.page}/{totalPages} 頁
            </span>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={data.page <= 1}
                onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}
              >
                上一頁
              </Button>
              <Button
                variant="secondary"
                disabled={data.page >= totalPages}
                onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
              >
                下一頁
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function RowActions({
  order,
  isAdmin,
  onDelete,
  navigate,
}: {
  order: Order;
  isAdmin: boolean;
  onDelete: (o: Order) => void;
  navigate: (to: string) => void;
}) {
  async function onPrint() {
    if (!confirm(`確定要列印單號 ${order.order_no}?(送到一般印表機)`)) return;
    try {
      const r = await ordersApi.print(order.id, "normal");
      alert(`已送印(佇列:${r.queue})`);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "列印失敗");
    }
  }

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
      <button className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100" onClick={onPrint}>
        列印
      </button>
      <button className="rounded-lg px-3 py-2 text-sm text-brand hover:bg-blue-50" onClick={() => navigate(`/orders/${order.id}/edit`)}>
        編輯
      </button>
      <button className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100" onClick={() => navigate(`/orders/new?copy=${order.id}`)}>
        複製
      </button>
      {isAdmin && (
        <button className="rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50" onClick={() => onDelete(order)}>
          刪除
        </button>
      )}
    </div>
  );
}
