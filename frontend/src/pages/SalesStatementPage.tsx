// 銷貨統計表:選客戶(可搜尋)→ 帶出/可改統一編號 → 選計算期間 → 自動列出該客戶區間內訂單明細。
// 加工單號、淨重、件數、單價留給使用者填;金額=數量×單價,合計→稅額(稅率可自訂,預設5%)→總計 自動計算。
import { useEffect, useMemo, useState } from "react";
import { ApiError } from "../api/client";
import { companiesApi, ordersApi } from "../api/resources";
import { Button, Card, Combobox, ErrorBar, Field, Input, Modal, Pager, Spinner } from "../components/ui";
import { groupDigits } from "../lib/format";
import type { Company, Order } from "../lib/types";

const DEFAULT_TAX_PCT = "5"; // 稅率預設 5%,使用者可自訂
const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function monthStart(): string {
  const n = new Date();
  return ymd(new Date(n.getFullYear(), n.getMonth(), 1));
}
// 西元 → 民國日期(例:2026-04-26 → 115/4/26)
function rocDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${Number(y) - 1911}/${Number(m)}/${Number(d)}`;
}

interface Row {
  key: string;
  orderId: number;
  isFirst: boolean;     // 該訂單第一列(顯示日期/收料單位/加工單號)
  date: string;
  receiver: string;
  product: string;
  spec: string;
  quantity: number;
  process: string;
  remark: string;
  processNo: string;    // 使用者填
  netWeight: string;
  pieces: string;
  unitPrice: string;
}

function buildRows(orders: Order[]): Row[] {
  const rows: Row[] = [];
  for (const o of orders) {
    (o.items ?? []).forEach((it, idx) => {
      rows.push({
        key: `${o.id}-${it.id ?? idx}`,
        orderId: o.id,
        isFirst: idx === 0,
        date: o.order_date ?? "",
        // 收料單位顯示「縮寫」(即時讀取;PDF 也用此值)
        receiver: o.receiver_abbr || o.receiver_name || "",
        product: it.product_name ?? "",
        spec: it.spec ?? "",
        quantity: Number(it.quantity ?? 0),
        process: it.process_item ?? "",
        remark: it.remark ?? "",
        // 件數 = 訂單的單位(已是「單位1+單位2」用 + 串接,例:2k+3b)
        pieces: it.unit ?? "",
        // 加工單號:帶入該品項的加工單號(有就填,沒有留白,仍可手動改)
        processNo: it.process_no ?? "",
        netWeight: "", unitPrice: "",
      });
    });
  }
  return rows;
}

export default function SalesStatementPage() {
  const [vendors, setVendors] = useState<Company[]>([]);
  const [vendorId, setVendorId] = useState("");
  const [taxid, setTaxid] = useState("");
  const [taxPctStr, setTaxPctStr] = useState(DEFAULT_TAX_PCT); // 稅率(%),可自訂
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(ymd(new Date()));
  const [rows, setRows] = useState<Row[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 產生 PDF 進度
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfPct, setPdfPct] = useState(0);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null); // 自動開啟被擋時,顯示按鈕用

  const PAGE_SIZE = 10;

  useEffect(() => {
    companiesApi.list("vendor").then(setVendors).catch(() => {});
  }, []);

  // 換新的 pdfUrl 或離開頁面時,回收上一個 blob URL,避免記憶體累積
  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);

  const vendor = vendors.find((v) => String(v.id) === vendorId);

  // 換客戶 → 自動帶入主檔統編(可被使用者覆蓋)
  useEffect(() => {
    const t = vendor?.detail ? String((vendor.detail as Record<string, unknown>).taxid ?? "") : "";
    setTaxid(t);
  }, [vendorId, vendors]);

  // 選了客戶 + 期間 → 抓含明細訂單
  useEffect(() => {
    if (!vendorId || !from || !to) { setRows([]); return; }
    let alive = true;
    setLoading(true);
    setError(null);
    ordersApi
      .statement(Number(vendorId), { from, to })
      .then((orders) => { if (alive) { setRows(buildRows(orders)); setPage(1); } })
      .catch((err) => alive && setError(err instanceof ApiError ? err.message : "載入失敗"))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [vendorId, from, to]);

  function update(key: string, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  const amountOf = (r: Row) => r.quantity * (Number(r.unitPrice) || 0);

  // 產生 PDF:把目前表格送後端產生像表單的 PDF,顯示進度後開新分頁檢視(不列印)
  async function generatePdf() {
    setError(null);
    setPdfUrl(null);
    setPdfBusy(true);
    setPdfPct(6);
    // 動畫進度條:WeasyPrint 要幾秒,先平滑爬到 ~92%,回應到達再補到 100%
    const timer = window.setInterval(() => {
      setPdfPct((p) => (p < 92 ? p + Math.max(1, Math.round((92 - p) / 10)) : p));
    }, 350);
    const payload = {
      customer: vendor?.name ?? "",
      taxid,
      period: `${rocDate(from)}~${rocDate(to)}`,
      rows: rows.map((r, i) => ({
        seq: i + 1,
        date: r.isFirst ? rocDate(r.date) : "",
        process_no: r.processNo,
        receiver: r.isFirst ? r.receiver : "",
        product: r.product,
        spec: r.spec,
        quantity: fmt(r.quantity),
        net_weight: r.netWeight,
        pieces: r.pieces,
        process: r.process,
        unit_price: r.unitPrice,
        amount: r.unitPrice !== "" ? fmt(amountOf(r)) : "",
        remark: r.remark,
      })),
      total_qty: fmt(totalQty),
      total_amount: fmt(totalAmount),
      tax: fmt(tax),
      tax_pct: taxPctStr || "0", // 讓 PDF 標示實際稅率
      grand: fmt(grand),
    };
    const m = document.cookie.match(/(?:^|; )csrf_token=([^;]+)/);
    const csrf = m ? decodeURIComponent(m[1]) : "";
    try {
      const res = await fetch("/api/orders/statement-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(csrf ? { "X-CSRF-Token": csrf } : {}) },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      window.clearInterval(timer);
      if (!res.ok) {
        setPdfBusy(false);
        setError("產生 PDF 失敗(需後端 WeasyPrint 可用)");
        return;
      }
      setPdfPct(100);
      const url = URL.createObjectURL(await res.blob());
      const win = window.open(url, "_blank"); // 嘗試自動開新分頁
      setPdfBusy(false);
      if (!win) {
        setPdfUrl(url); // 被瀏覽器擋了 → 顯示按鈕讓使用者點開(卸載/換新時會 revoke)
      } else {
        // 已開新分頁:稍後回收 blob,避免記憶體累積
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
    } catch {
      window.clearInterval(timer);
      setPdfBusy(false);
      setError("產生 PDF 失敗");
    }
  }

  const totalQty = useMemo(() => rows.reduce((s, r) => s + r.quantity, 0), [rows]);
  const totalAmount = useMemo(() => rows.reduce((s, r) => s + amountOf(r), 0), [rows]);
  const taxPct = Math.max(0, Number(taxPctStr) || 0); // 解析稅率,空白或非數字當 0
  const tax = Math.round(totalAmount * (taxPct / 100));
  const grand = totalAmount + tax;
  const orderCount = useMemo(() => new Set(rows.map((r) => r.orderId)).size, [rows]);

  // 分頁(顯示用;合計與列印仍用全部 rows)
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const p = Math.min(page, totalPages);
  const start = (p - 1) * PAGE_SIZE;
  const pageRows = rows.slice(start, start + PAGE_SIZE);

  const cellInput = "w-full min-w-0 rounded-md border border-slate-200 bg-amber-50/50 px-2 py-1 text-sm outline-none focus:border-brand focus:bg-white";

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold sm:text-2xl">銷貨統計表</h1>
        <Button variant="secondary" onClick={generatePdf} disabled={rows.length === 0 || pdfBusy}>📄 產生 PDF</Button>
      </div>

      {/* 條件列 */}
      <Card>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-1">
            <Field label="客戶" required>
              <Combobox
                value={vendorId}
                onChange={setVendorId}
                options={vendors.map((v) => ({ id: v.id, label: v.name }))}
                placeholder="輸入客戶名稱搜尋…"
              />
            </Field>
          </div>
          <Field label="統一編號" hint="未帶出可自行輸入">
            <Input value={taxid} onChange={(e) => setTaxid(e.target.value)} placeholder="8 碼數字" />
          </Field>
          <Field label="計算期間起">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="計算期間迄">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
      </Card>

      <ErrorBar message={error} />

      {loading ? (
        <Spinner />
      ) : !vendorId ? (
        <Card><p className="py-12 text-center text-slate-400">請先選擇客戶與計算期間</p></Card>
      ) : rows.length === 0 ? (
        <Card><p className="py-12 text-center text-slate-400">此客戶在這段期間沒有訂單</p></Card>
      ) : (
        <>
          {/* 明細表 */}
          <Card className="overflow-x-auto !p-0">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs font-semibold text-slate-500">
                  <th className="px-3 py-2.5 text-center">#</th>
                  <th className="px-3 py-2.5 text-center">日期</th>
                  <th className="px-3 py-2.5 text-left">加工單號 <span className="font-normal text-amber-500">可填</span></th>
                  <th className="px-3 py-2.5 text-left">收料單位</th>
                  <th className="px-3 py-2.5 text-left">品名</th>
                  <th className="px-3 py-2.5 text-left">規格</th>
                  <th className="px-3 py-2.5 text-right">數量(pcs)</th>
                  <th className="px-3 py-2.5 text-center">淨重(kg) <span className="font-normal text-amber-500">可填</span></th>
                  <th className="px-3 py-2.5 text-center">件數</th>
                  <th className="px-3 py-2.5 text-left">加工項目</th>
                  <th className="px-3 py-2.5 text-right">單價 <span className="font-normal text-amber-500">可填</span></th>
                  <th className="px-3 py-2.5 text-right">金額</th>
                  <th className="px-3 py-2.5 text-left">備註</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r, localI) => {
                  const i = start + localI;
                  return (
                  <tr key={r.key} className={`border-t border-slate-100 hover:bg-slate-50/60 ${r.isFirst && i > 0 ? "border-t-slate-300" : ""}`}>
                    <td className="px-3 py-1.5 text-center text-slate-400">{i + 1}</td>
                    <td className="px-3 py-1.5 text-center text-slate-500">{r.isFirst ? r.date.slice(5) : ""}</td>
                    <td className="px-2 py-1.5"><input className={cellInput} value={r.processNo} onChange={(e) => update(r.key, { processNo: e.target.value })} /></td>
                    <td className="px-3 py-1.5 text-slate-700">{r.isFirst ? r.receiver : ""}</td>
                    <td className="px-3 py-1.5 font-medium text-slate-800">{r.product}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-slate-600">{r.spec}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{fmt(r.quantity)}</td>
                    <td className="px-2 py-1.5"><input className={`${cellInput} text-right`} inputMode="decimal" value={r.netWeight} onChange={(e) => update(r.key, { netWeight: groupDigits(e.target.value) })} /></td>
                    <td className="px-3 py-1.5 text-center text-slate-600">{r.pieces}</td>
                    <td className="px-3 py-1.5 text-slate-600">{r.process}</td>
                    <td className="px-2 py-1.5"><input className={`${cellInput} text-right`} inputMode="decimal" value={r.unitPrice} onChange={(e) => update(r.key, { unitPrice: e.target.value })} placeholder="0" /></td>
                    <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-slate-800">{fmt(amountOf(r))}</td>
                    <td className="px-3 py-1.5 text-slate-400">{r.remark}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          {totalPages > 1 && (
            <div className="flex justify-end">
              <Pager page={p} totalPages={totalPages} onChange={setPage} />
            </div>
          )}

          {/* 彙總(發票式) */}
          <div className="flex flex-col gap-4 sm:flex-row sm:justify-between">
            <p className="self-end text-sm text-slate-500">
              共 {orderCount} 張訂單 · {rows.length} 筆明細 · 數量合計 <b className="text-slate-700">{fmt(totalQty)}</b>
            </p>
            <div className="w-full sm:max-w-xs">
              <Card className="space-y-2 !p-4">
                <TotalRow label="合計" value={fmt(totalAmount)} />
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1 text-slate-500">
                    稅額(
                    <input
                      value={taxPctStr}
                      onChange={(e) => setTaxPctStr(e.target.value.replace(/[^\d.]/g, ""))}
                      inputMode="decimal"
                      className="w-10 rounded border border-slate-200 px-1 py-0.5 text-center text-sm tabular-nums outline-none focus:border-brand"
                      aria-label="稅率百分比"
                    />
                    %)
                  </span>
                  <span className="font-medium tabular-nums text-slate-800">{fmt(tax)}</span>
                </div>
                <div className="border-t border-slate-200" />
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700">總計</span>
                  <span className="text-2xl font-bold text-brand tabular-nums">{fmt(grand)}</span>
                </div>
              </Card>
            </div>
          </div>
        </>
      )}

      {/* 產生 PDF 進度 Modal */}
      <Modal
        open={pdfBusy || pdfUrl !== null}
        title={pdfUrl ? "PDF 已產生" : "產生 PDF 中…"}
        onClose={() => { if (!pdfBusy) setPdfUrl(null); }}
        footer={pdfUrl ? (
          <Button onClick={() => { window.open(pdfUrl, "_blank"); setPdfUrl(null); }}>開啟 PDF</Button>
        ) : undefined}
      >
        {pdfBusy ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">正在產生 PDF,請稍候…</p>
            <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-brand transition-all duration-300" style={{ width: `${pdfPct}%` }} />
            </div>
            <p className="text-right text-xs text-slate-400">{pdfPct}%</p>
          </div>
        ) : (
          <p className="text-slate-600">PDF 已產生。瀏覽器擋住自動開啟時,請點下方「開啟 PDF」在新分頁檢視。</p>
        )}
      </Modal>
    </div>
  );
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium tabular-nums text-slate-800">{value}</span>
    </div>
  );
}
