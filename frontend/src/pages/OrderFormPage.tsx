// 建單 / 改單表單(表單模式,給筆電大量輸入用;手機也可用,版面自適應)。
// - /orders/new           建立新單
// - /orders/new?copy=ID    以某張單為範本複製成新單
// - /orders/:id/edit       編輯既有單
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { companiesApi, ordersApi, processItemsApi, productsApi } from "../api/resources";
import { Button, Card, ErrorBar, Field, Input, Select, Spinner, Textarea } from "../components/ui";
import { lineAmount, money, today } from "../lib/format";
import type { Company, ProcessItem, Product } from "../lib/types";

// 表單內部用:數值欄位以字串保存,方便輸入(送出時再轉)
interface RowState {
  product_name: string;
  spec: string;
  process_item: string;
  net_weight_kg: string;
  quantity: string;
  unit: string;
  unit_price: string;
  remark: string;
}

const emptyRow = (): RowState => ({
  product_name: "",
  spec: "",
  process_item: "",
  net_weight_kg: "",
  quantity: "",
  unit: "",
  unit_price: "",
  remark: "",
});

export default function OrderFormPage() {
  const { id } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const editingId = id ? Number(id) : null;
  const copyId = search.get("copy");

  // 參考主檔
  const [companies, setCompanies] = useState<Company[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [processItems, setProcessItems] = useState<ProcessItem[]>([]);

  // 表單欄位
  const [vendorId, setVendorId] = useState("");
  const [receiverId, setReceiverId] = useState("");
  const [orderDate, setOrderDate] = useState(today());
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<RowState[]>([emptyRow()]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 載入參考主檔 + (編輯/複製時)既有單
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const [cs, ps, pis] = await Promise.all([
          companiesApi.list(),
          productsApi.list(),
          processItemsApi.list(),
        ]);
        if (!alive) return;
        setCompanies(cs);
        setProducts(ps);
        setProcessItems(pis);

        const sourceId = editingId ?? (copyId ? Number(copyId) : null);
        if (sourceId) {
          const o = await ordersApi.get(sourceId);
          if (!alive) return;
          setVendorId(o.vendor_id ? String(o.vendor_id) : "");
          setReceiverId(o.receiver_id ? String(o.receiver_id) : "");
          setNote(o.note ?? "");
          // 複製成新單時,日期改今天;編輯則沿用原日期
          setOrderDate(editingId ? o.order_date : today());
          setRows(
            (o.items ?? []).map((it) => ({
              product_name: it.product_name,
              spec: it.spec ?? "",
              process_item: it.process_item ?? "",
              net_weight_kg: it.net_weight_kg != null ? String(it.net_weight_kg) : "",
              quantity: String(it.quantity ?? ""),
              unit: it.unit ?? "",
              unit_price: it.unit_price != null ? String(it.unit_price) : "",
              remark: it.remark ?? "",
            })),
          );
        }
      } catch (err) {
        if (alive) setError(err instanceof ApiError ? err.message : "載入資料失敗");
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, [editingId, copyId]);

  const vendors = companies.filter((c) => c.role_type === "vendor" || c.role_type === "both");
  const receivers = companies.filter((c) => c.role_type === "receiver" || c.role_type === "both");

  const total = useMemo(
    () => rows.reduce((sum, r) => sum + lineAmount(Number(r.quantity), Number(r.unit_price)), 0),
    [rows],
  );

  function updateRow(idx: number, patch: Partial<RowState>) {
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((rs) => [...rs, emptyRow()]);
  }
  function removeRow(idx: number) {
    setRows((rs) => (rs.length === 1 ? rs : rs.filter((_, i) => i !== idx)));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const validRows = rows.filter((r) => r.product_name.trim());
    if (validRows.length === 0) {
      setError("至少要有一行品項(品名必填)");
      return;
    }

    const body = {
      vendor_id: vendorId ? Number(vendorId) : null,
      receiver_id: receiverId ? Number(receiverId) : null,
      order_date: orderDate,
      note: note || null,
      items: validRows.map((r) => ({
        product_name: r.product_name.trim(),
        spec: r.spec || null,
        process_item: r.process_item || null,
        net_weight_kg: r.net_weight_kg ? Number(r.net_weight_kg) : null,
        quantity: r.quantity ? Number(r.quantity) : 0,
        unit: r.unit || null,
        unit_price: r.unit_price ? Number(r.unit_price) : null,
        remark: r.remark || null,
      })),
    };

    setBusy(true);
    try {
      if (editingId) {
        await ordersApi.update(editingId, body);
      } else {
        await ordersApi.create(body);
      }
      navigate("/orders");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "儲存失敗");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Spinner />;

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold sm:text-2xl">
          {editingId ? "編輯訂單" : copyId ? "複製成新單" : "建立新訂單"}
        </h1>
      </div>

      <ErrorBar message={error} />

      <Card className="space-y-4">
        {/* 單頭:手機單欄、平板以上三欄 */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="廠商單位">
            <Select value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
              <option value="">— 請選擇 —</option>
              {vendors.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="接收單位">
            <Select value={receiverId} onChange={(e) => setReceiverId(e.target.value)}>
              <option value="">— 請選擇 —</option>
              {receivers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="日期" required>
            <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
          </Field>
        </div>
      </Card>

      {/* 品項列 */}
      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">品項</h2>
          <span className="text-sm text-slate-500">共 {rows.length} 行</span>
        </div>

        {rows.map((r, idx) => {
          const amt = lineAmount(Number(r.quantity), Number(r.unit_price));
          return (
            <div key={idx} className="rounded-xl border border-slate-200 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-slate-500">第 {idx + 1} 行</span>
                <button
                  type="button"
                  onClick={() => removeRow(idx)}
                  className="text-sm text-red-500 hover:underline disabled:opacity-40"
                  disabled={rows.length === 1}
                >
                  移除
                </button>
              </div>
              {/* 手機單欄、平板兩欄、筆電多欄 */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="品名" required>
                  <Input
                    list="product-options"
                    value={r.product_name}
                    onChange={(e) => updateRow(idx, { product_name: e.target.value })}
                    placeholder="例:HBS"
                  />
                </Field>
                <Field label="規格">
                  <Input value={r.spec} onChange={(e) => updateRow(idx, { spec: e.target.value })} placeholder="例:1/2-H17" />
                </Field>
                <Field label="加工項目">
                  <Select value={r.process_item} onChange={(e) => updateRow(idx, { process_item: e.target.value })}>
                    <option value="">—</option>
                    {processItems.map((p) => (
                      <option key={p.id} value={p.name}>{p.name}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="淨重(KG)">
                  <Input type="number" inputMode="decimal" step="0.01" value={r.net_weight_kg} onChange={(e) => updateRow(idx, { net_weight_kg: e.target.value })} />
                </Field>
                <Field label="數量" required>
                  <Input type="number" inputMode="decimal" step="0.01" value={r.quantity} onChange={(e) => updateRow(idx, { quantity: e.target.value })} />
                </Field>
                <Field label="單位">
                  <Input value={r.unit} onChange={(e) => updateRow(idx, { unit: e.target.value })} placeholder="K / 件" />
                </Field>
                <Field label="單價">
                  <Input type="number" inputMode="decimal" step="0.01" value={r.unit_price} onChange={(e) => updateRow(idx, { unit_price: e.target.value })} />
                </Field>
                <Field label="金額(自動)">
                  <div className="flex min-h-[48px] items-center rounded-xl bg-slate-50 px-3 font-semibold">
                    {money(amt)}
                  </div>
                </Field>
              </div>
              <div className="mt-3">
                <Field label="備註">
                  <Input value={r.remark} onChange={(e) => updateRow(idx, { remark: e.target.value })} />
                </Field>
              </div>
            </div>
          );
        })}

        <datalist id="product-options">
          {products.map((p) => (
            <option key={p.id} value={p.name} />
          ))}
        </datalist>

        <Button type="button" variant="secondary" onClick={addRow}>
          + 新增品項
        </Button>
      </Card>

      <Card className="space-y-4">
        <Field label="備註(整張單)">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
          <div className="text-lg">
            總金額:<span className="text-2xl font-bold text-brand">{money(total)}</span>
            <span className="ml-2 text-sm text-slate-400">(最終以後端重算為準)</span>
          </div>
          <div className="flex gap-3">
            <Button type="button" variant="secondary" onClick={() => navigate("/orders")}>
              取消
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "儲存中…" : editingId ? "儲存變更" : "建立訂單"}
            </Button>
          </div>
        </div>
      </Card>
    </form>
  );
}
