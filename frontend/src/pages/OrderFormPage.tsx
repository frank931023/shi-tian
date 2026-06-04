// 建單 / 改單表單(表單模式,給筆電大量輸入用;手機也可用,版面自適應)。
// - /orders/new           建立新單
// - /orders/new?copy=ID    以某張單為範本複製成新單
// - /orders/:id/edit       編輯既有單
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { companiesApi, ordersApi, processItemsApi, productsApi, specsApi } from "../api/resources";
import { Button, Card, ErrorBar, Field, Input, Modal, Select, Spinner, Textarea } from "../components/ui";
import { lineAmount, money, today } from "../lib/format";
import type { Company, ProcessItem, Product, Spec } from "../lib/types";

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
  const [specs, setSpecs] = useState<Spec[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [savedId, setSavedId] = useState<number | null>(null); // 建立/儲存後的訂單 id(供列印)

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
        const [cs, ps, pis, ss] = await Promise.all([
          companiesApi.list(),
          productsApi.list(),
          processItemsApi.list(),
          specsApi.list(),
        ]);
        if (!alive) return;
        setCompanies(cs);
        setProducts(ps);
        setProcessItems(pis);
        setSpecs(ss);

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
  // 品項上下移(觸控友善的排序方式;比拖曳對長輩更穩)
  function moveRow(idx: number, dir: -1 | 1) {
    setRows((rs) => {
      const j = idx + dir;
      if (j < 0 || j >= rs.length) return rs;
      const next = [...rs];
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  }

  // 按「建立/儲存」:先檢查再開預覽確認
  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (rows.filter((r) => r.product_name.trim()).length === 0) {
      setError("至少要有一行品項(品名必填)");
      return;
    }
    setConfirmOpen(true);
  }

  async function doSubmit() {
    const validRows = rows.filter((r) => r.product_name.trim());
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
      const saved = editingId ? await ordersApi.update(editingId, body) : await ordersApi.create(body);
      // 不直接離開:改問是否列印三聯單
      setConfirmOpen(false);
      setSavedId(saved.id);
    } catch (err) {
      setConfirmOpen(false);
      setError(err instanceof ApiError ? err.message : "儲存失敗");
    } finally {
      setBusy(false);
    }
  }

  const vendorName = vendors.find((v) => String(v.id) === vendorId)?.name ?? "—";
  const receiverName = receivers.find((r) => String(r.id) === receiverId)?.name ?? "—";
  const previewRows = rows.filter((r) => r.product_name.trim());

  if (loading) return <Spinner />;

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold sm:text-2xl">
          {editingId ? "編輯訂單" : copyId ? "複製成新單" : "建立新訂單"}
        </h1>
        {/* 僅新建單時、且桌機才提供視覺化建單入口 */}
        {!editingId && (
          <Link to="/orders/visual" className="hidden lg:block">
            <Button type="button" variant="secondary">🧩 視覺化建單</Button>
          </Link>
        )}
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
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => moveRow(idx, -1)} disabled={idx === 0}
                    className="min-h-[40px] min-w-[40px] rounded-lg text-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30" title="上移">↑</button>
                  <button type="button" onClick={() => moveRow(idx, 1)} disabled={idx === rows.length - 1}
                    className="min-h-[40px] min-w-[40px] rounded-lg text-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30" title="下移">↓</button>
                  <button type="button" onClick={() => removeRow(idx)} disabled={rows.length === 1}
                    className="min-h-[40px] rounded-lg px-2 text-sm text-red-500 hover:bg-red-50 disabled:opacity-30">移除</button>
                </div>
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
                  <Input list="spec-options" value={r.spec} onChange={(e) => updateRow(idx, { spec: e.target.value })} placeholder="例:1/2-H17" />
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
                  <Input list="unit-options" value={r.unit} onChange={(e) => updateRow(idx, { unit: e.target.value })} placeholder="K / 件" />
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
        <datalist id="spec-options">
          {specs.map((s) => (
            <option key={s.id} value={s.name} />
          ))}
        </datalist>
        <datalist id="unit-options">
          {["K", "KG", "件", "支", "箱"].map((u) => (
            <option key={u} value={u} />
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
              {editingId ? "儲存變更" : "建立訂單"}
            </Button>
          </div>
        </div>
      </Card>

      {/* 送出前預覽確認(長輩可先核對) */}
      <Modal
        open={confirmOpen}
        title={editingId ? "確認儲存變更" : "確認建立訂單"}
        onClose={() => !busy && setConfirmOpen(false)}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setConfirmOpen(false)} disabled={busy}>返回修改</Button>
            <Button type="button" onClick={doSubmit} disabled={busy}>{busy ? "儲存中…" : "確認"}</Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-lg bg-slate-50 p-2"><span className="text-slate-400">廠商</span><p className="font-medium">{vendorName}</p></div>
            <div className="rounded-lg bg-slate-50 p-2"><span className="text-slate-400">接收</span><p className="font-medium">{receiverName}</p></div>
          </div>
          <p className="text-sm text-slate-500">日期 {orderDate} · {previewRows.length} 項 · 總金額 {money(total)}</p>
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {previewRows.map((r, i) => (
              <li key={i} className="flex flex-wrap items-center gap-x-3 px-3 py-2 text-sm">
                <span className="font-medium text-slate-400">{i + 1}</span>
                <span className="font-medium">{r.product_name}</span>
                {r.spec && <span className="text-slate-500">{r.spec}</span>}
                {r.process_item && <span className="text-slate-500">{r.process_item}</span>}
                {r.quantity && <span className="text-slate-500">× {r.quantity}{r.unit}</span>}
                {r.unit_price && <span className="text-slate-500">@{r.unit_price}</span>}
              </li>
            ))}
          </ul>
        </div>
      </Modal>

      {/* 建立/儲存成功 → 詢問是否列印三聯單 */}
      <Modal
        open={savedId !== null}
        title="訂單已儲存"
        onClose={() => navigate("/orders")}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => navigate("/orders")}>稍後再印</Button>
            <Button
              type="button"
              onClick={() => {
                if (savedId !== null) window.open(ordersApi.pdfUrl(savedId), "_blank");
                navigate("/orders");
              }}
            >
              產生 PDF 並列印
            </Button>
          </>
        }
      >
        <p className="text-slate-600">
          訂單已儲存。要現在產生三聯單 PDF 列印嗎?(會開新分頁顯示 PDF,可直接列印;
          正式環境也可由伺服器送印到印表機)
        </p>
      </Modal>
    </form>
  );
}
