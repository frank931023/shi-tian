// 垃圾桶(僅 admin):列出已刪除(is_deleted)的訂單,可復原或永久刪除。
// 支援多選批次操作;復原/永久刪除都會跳確認 Modal(不需輸入單號)。
import { useEffect, useMemo, useState } from "react";
import { ApiError } from "../api/client";
import { ordersApi, type OrderFilters } from "../api/resources";
import { Button, Card, ErrorBar, Modal, Pager, Spinner } from "../components/ui";
import { useAuth } from "../lib/AuthContext";
import type { Order, Paginated } from "../lib/types";

const PAGE_SIZE = 10;

type Action = { type: "restore" | "purge"; ids: number[] };

export default function TrashPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [data, setData] = useState<Paginated<Order> | null>(null);
  const [filters, setFilters] = useState<OrderFilters>({ deleted: 1, page: 1, page_size: PAGE_SIZE });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [action, setAction] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);

  function reload() {
    setLoading(true);
    ordersApi.list(filters)
      .then((d) => setData(d))
      .catch((err) => setError(err instanceof ApiError ? err.message : "載入失敗"))
      .finally(() => setLoading(false));
  }
  useEffect(() => { if (isAdmin) reload(); }, [filters, isAdmin]);

  const items = data?.items ?? [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;
  const allChecked = items.length > 0 && items.every((o) => selected.has(o.id));

  function toggle(id: number) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAll() {
    setSelected((s) => {
      if (items.every((o) => s.has(o.id))) { const n = new Set(s); items.forEach((o) => n.delete(o.id)); return n; }
      const n = new Set(s); items.forEach((o) => n.add(o.id)); return n;
    });
  }

  const selectedIds = useMemo(() => [...selected], [selected]);

  async function runAction() {
    if (!action) return;
    setBusy(true);
    setError(null);
    try {
      if (action.type === "restore") await ordersApi.restore(action.ids);
      else await ordersApi.purge(action.ids);
      setSelected(new Set());
      setAction(null);
      // 若刪/復原後本頁空了且非第一頁,往前一頁
      if (items.length === action.ids.length && (filters.page ?? 1) > 1) {
        setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }));
      } else {
        reload();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "操作失敗");
    } finally {
      setBusy(false);
    }
  }

  if (!isAdmin) {
    return <Card><p className="py-12 text-center text-slate-500">垃圾桶僅限管理員檢視。</p></Card>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold sm:text-2xl">🗑️ 垃圾桶</h1>
        {selectedIds.length > 0 && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setAction({ type: "restore", ids: selectedIds })}>
              復原選取 ({selectedIds.length})
            </Button>
            <Button variant="danger" onClick={() => setAction({ type: "purge", ids: selectedIds })}>
              永久刪除選取 ({selectedIds.length})
            </Button>
          </div>
        )}
      </div>
      <p className="text-sm text-slate-500">這裡是被刪除的訂單,可「復原」放回清單,或「永久刪除」(無法復原)。</p>

      <ErrorBar message={error} />

      {loading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <Card><p className="py-12 text-center text-slate-400">垃圾桶是空的</p></Card>
      ) : (
        <>
          <Card className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="py-2 pr-3"><input type="checkbox" checked={allChecked} onChange={toggleAll} /></th>
                  <th className="py-2 pr-3">單號</th>
                  <th className="py-2 pr-3">日期</th>
                  <th className="py-2 pr-3">廠商</th>
                  <th className="py-2 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((o) => (
                  <tr key={o.id} className="border-b border-slate-100">
                    <td className="py-2 pr-3"><input type="checkbox" checked={selected.has(o.id)} onChange={() => toggle(o.id)} /></td>
                    <td className="py-2 pr-3 font-medium">{o.order_no}</td>
                    <td className="py-2 pr-3">{o.order_date}</td>
                    <td className="py-2 pr-3">{o.vendor_name ?? "-"}</td>
                    <td className="py-2 text-right">
                      <button className="rounded-lg px-3 py-1.5 text-sm text-brand hover:bg-blue-50" onClick={() => setAction({ type: "restore", ids: [o.id] })}>復原</button>
                      <button className="rounded-lg px-3 py-1.5 text-sm text-red-600 hover:bg-red-50" onClick={() => setAction({ type: "purge", ids: [o.id] })}>永久刪除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-slate-500">共 {data?.total ?? 0} 筆</span>
            <Pager page={data?.page ?? 1} totalPages={totalPages} onChange={(p) => setFilters((f) => ({ ...f, page: p }))} />
          </div>
        </>
      )}

      {/* 確認 Modal(不需輸入單號) */}
      <Modal
        open={action !== null}
        title={action?.type === "restore" ? "復原訂單" : "永久刪除訂單"}
        onClose={() => !busy && setAction(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAction(null)} disabled={busy}>取消</Button>
            <Button variant={action?.type === "purge" ? "danger" : "primary"} onClick={runAction} disabled={busy}>
              {busy ? "處理中…" : action?.type === "restore" ? "確認復原" : "確認永久刪除"}
            </Button>
          </>
        }
      >
        {action?.type === "restore" ? (
          <p className="text-slate-700">確定要<b>復原</b>選取的 <b>{action.ids.length}</b> 筆訂單?復原後會回到訂單清單。</p>
        ) : (
          <p className="text-slate-700">確定要<b className="text-red-600">永久刪除</b>選取的 <b>{action?.ids.length}</b> 筆訂單?此動作<b className="text-red-600">無法復原</b>。</p>
        )}
      </Modal>
    </div>
  );
}
