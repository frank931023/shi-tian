// 垃圾桶(僅 admin):分頁籤檢視已刪除的「訂單 / 廠商單位 / 接收單位 / 品名 / 加工項目 / 規格」,
// 都可「復原」放回,或「永久刪除」(無法復原;被歷史單據參照的主檔會被擋下)。
import { useEffect, useMemo, useState } from "react";
import { ApiError } from "../api/client";
import {
  companiesApi, ordersApi, processItemsApi, productsApi, specsApi, type OrderFilters,
} from "../api/resources";
import { Button, Card, ErrorBar, Modal, Pager, Spinner } from "../components/ui";
import { useAuth } from "../lib/AuthContext";
import type { Order, Paginated } from "../lib/types";

const PAGE_SIZE = 10;

type TabKey = "orders" | "vendors" | "receivers" | "products" | "process" | "specs";
const TABS: { key: TabKey; label: string }[] = [
  { key: "orders", label: "訂單" },
  { key: "vendors", label: "廠商單位" },
  { key: "receivers", label: "接收單位" },
  { key: "products", label: "品名" },
  { key: "process", label: "加工項目" },
  { key: "specs", label: "規格" },
];

export default function TrashPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [tab, setTab] = useState<TabKey>("orders");

  if (!isAdmin) {
    return <Card><p className="py-12 text-center text-slate-500">垃圾桶僅限管理員檢視。</p></Card>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <h1 className="text-xl font-bold sm:text-2xl">🗑️ 垃圾桶</h1>
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              tab === t.key ? "bg-brand text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "orders" && <OrdersTrash />}
      {tab === "vendors" && (
        <MasterTrash label="廠商單位" list={() => companiesApi.listDeleted("vendor")} restore={companiesApi.restore} purge={companiesApi.purge} />
      )}
      {tab === "receivers" && (
        <MasterTrash label="接收單位" list={() => companiesApi.listDeleted("receiver")} restore={companiesApi.restore} purge={companiesApi.purge} />
      )}
      {tab === "products" && (
        <MasterTrash label="品名" list={() => productsApi.listDeleted()} restore={productsApi.restore} purge={productsApi.purge} />
      )}
      {tab === "process" && (
        <MasterTrash label="加工項目" list={() => processItemsApi.listDeleted()} restore={processItemsApi.restore} purge={processItemsApi.purge} />
      )}
      {tab === "specs" && (
        <MasterTrash label="規格" dedupe list={() => specsApi.listDeleted()} restore={specsApi.restore} purge={specsApi.purge} />
      )}
    </div>
  );
}

// ---- 主檔垃圾桶(廠商/接收/品名/加工項目/規格 共用) ----
type Named = { id: number; name: string };

function MasterTrash({
  label, list, restore, purge, dedupe = false,
}: {
  label: string;
  list: () => Promise<Named[]>;
  restore: (id: number) => Promise<unknown>;
  purge: (id: number) => Promise<unknown>;
  dedupe?: boolean; // 同名去重(規格用):一個名稱對應多個 id,操作時一起處理
}) {
  const [items, setItems] = useState<Named[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<{ type: "restore" | "purge"; name: string; ids: number[] } | null>(null);
  const [busy, setBusy] = useState(false);

  function reload() {
    setLoading(true);
    setError(null);
    list()
      .then(setItems)
      .catch((err) => setError(err instanceof ApiError ? err.message : "載入失敗"))
      .finally(() => setLoading(false));
  }
  useEffect(reload, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 顯示用:dedupe 時同名合併成一列(ids 收齊),否則每筆一列
  const rows: { name: string; ids: number[] }[] = useMemo(() => {
    if (!dedupe) return items.map((it) => ({ name: it.name, ids: [it.id] }));
    const map = new Map<string, number[]>();
    for (const it of items) {
      const arr = map.get(it.name);
      if (arr) arr.push(it.id); else map.set(it.name, [it.id]);
    }
    return Array.from(map.entries()).map(([name, ids]) => ({ name, ids }));
  }, [items, dedupe]);

  async function run() {
    if (!action) return;
    setBusy(true);
    setError(null);
    try {
      const fn = action.type === "restore" ? restore : purge;
      await Promise.all(action.ids.map((id) => fn(id)));
      setAction(null);
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "操作失敗");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">被刪除的{label},可「復原」放回主檔與建單下拉,或「永久刪除」(無法復原)。</p>
      <ErrorBar message={error} />
      {loading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <Card><p className="py-12 text-center text-slate-400">{label}垃圾桶是空的</p></Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-slate-500">
              <tr>
                <th className="py-2 pr-3">{label}</th>
                <th className="py-2 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name} className="border-b border-slate-100">
                  <td className="py-2 pr-3 font-medium">{r.name}</td>
                  <td className="py-2 text-right">
                    <button className="rounded-lg px-3 py-1.5 text-sm text-brand hover:bg-blue-50" onClick={() => setAction({ type: "restore", name: r.name, ids: r.ids })}>復原</button>
                    <button className="rounded-lg px-3 py-1.5 text-sm text-red-600 hover:bg-red-50" onClick={() => setAction({ type: "purge", name: r.name, ids: r.ids })}>永久刪除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-sm text-slate-500">共 {rows.length} 筆</p>
        </Card>
      )}

      <Modal
        open={action !== null}
        title={action?.type === "restore" ? `復原${label}` : `永久刪除${label}`}
        onClose={() => !busy && setAction(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAction(null)} disabled={busy}>取消</Button>
            <Button variant={action?.type === "purge" ? "danger" : "primary"} onClick={run} disabled={busy}>
              {busy ? "處理中…" : action?.type === "restore" ? "確認復原" : "確認永久刪除"}
            </Button>
          </>
        }
      >
        {action?.type === "restore" ? (
          <p className="text-slate-700">確定要<b>復原</b>{label}「<b>{action.name}</b>」?復原後會回到主檔與建單下拉。</p>
        ) : (
          <p className="text-slate-700">確定要<b className="text-red-600">永久刪除</b>{label}「<b>{action?.name}</b>」?此動作<b className="text-red-600">無法復原</b>。</p>
        )}
      </Modal>
    </div>
  );
}

// ---- 訂單垃圾桶(原本的功能,支援多選批次復原/永久刪除) ----
type Action = { type: "restore" | "purge"; ids: number[] };

function OrdersTrash() {
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
  useEffect(reload, [filters]); // eslint-disable-line react-hooks/exhaustive-deps

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">被刪除的訂單,可「復原」放回清單,或「永久刪除」(無法復原)。</p>
        {selectedIds.length > 0 && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setAction({ type: "restore", ids: selectedIds })}>復原選取 ({selectedIds.length})</Button>
            <Button variant="danger" onClick={() => setAction({ type: "purge", ids: selectedIds })}>永久刪除選取 ({selectedIds.length})</Button>
          </div>
        )}
      </div>

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
