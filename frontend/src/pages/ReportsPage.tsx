// 報表頁(以中小型加工廠會計/老闆視角):
// - KPI:訂單數、總數量、平均每單量、活躍廠商/接收單位(與上一期比較)
// - 趨勢:每週/月數量
// - 排行:廠商、接收單位、品名占比、加工項目
// 聚合都在後端 DB 完成,前端只負責呈現。
import { useEffect, useMemo, useState } from "react";
import {
  Area, AreaChart, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { ApiError } from "../api/client";
import { reportsApi, type Share, type Summary } from "../api/resources";
import { Card, ErrorBar, Spinner } from "../components/ui";

const COLORS = ["#1d4ed8", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"];

function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
function presetRange(kind: "week" | "month" | "quarter"): { from: string; to: string } {
  const now = new Date();
  const to = ymd(now);
  const start = new Date(now);
  if (kind === "week") start.setDate(now.getDate() - 7);
  else if (kind === "month") start.setMonth(now.getMonth() - 1);
  else start.setMonth(now.getMonth() - 3);
  return { from: ymd(start), to };
}
// 上一個「等長」區間(用於與上期比較)
function prevRange(from: string, to: string): { from: string; to: string } {
  const f = new Date(from);
  const t = new Date(to);
  const days = Math.max(1, Math.round((t.getTime() - f.getTime()) / 86400000) + 1);
  const pTo = new Date(f); pTo.setDate(f.getDate() - 1);
  const pFrom = new Date(pTo); pFrom.setDate(pTo.getDate() - (days - 1));
  return { from: ymd(pFrom), to: ymd(pTo) };
}
const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

export default function ReportsPage() {
  const [range, setRange] = useState(() => presetRange("month"));
  const [groupBy, setGroupBy] = useState<"week" | "month">("month");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [prev, setPrev] = useState<Summary | null>(null);
  const [byProduct, setByProduct] = useState<Share[]>([]);
  const [byVendor, setByVendor] = useState<Share[]>([]);
  const [byReceiver, setByReceiver] = useState<Share[]>([]);
  const [byProcess, setByProcess] = useState<Share[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    const pr = prevRange(range.from, range.to);
    Promise.all([
      reportsApi.summary({ ...range, group_by: groupBy }),
      reportsApi.summary({ ...pr, group_by: groupBy }),
      reportsApi.byProduct(range),
      reportsApi.byCompany(range, "vendor"),
      reportsApi.byCompany(range, "receiver"),
      reportsApi.byProcess(range),
    ])
      .then(([s, p, prod, ven, rec, proc]) => {
        if (!alive) return;
        setSummary(s); setPrev(p); setByProduct(prod);
        setByVendor(ven); setByReceiver(rec); setByProcess(proc);
      })
      .catch((err) => alive && setError(err instanceof ApiError ? err.message : "載入報表失敗"))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [range, groupBy]);

  const productPie = useMemo(() => byProduct.filter((p) => p.quantity > 0).slice(0, 8), [byProduct]);
  const avgPerOrder = summary && summary.total_count > 0 ? summary.total_quantity / summary.total_count : 0;

  const btn = "rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50";

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <h1 className="text-xl font-bold sm:text-2xl">報表</h1>

      {/* 區間 + 分組 */}
      <Card className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-500">區間</span>
        <button className={btn} onClick={() => setRange(presetRange("week"))}>近一週</button>
        <button className={btn} onClick={() => setRange(presetRange("month"))}>近一月</button>
        <button className={btn} onClick={() => setRange(presetRange("quarter"))}>近三月</button>
        <input type="date" className="min-h-[40px] rounded-lg border border-slate-300 px-2 text-sm" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
        <span>~</span>
        <input type="date" className="min-h-[40px] rounded-lg border border-slate-300 px-2 text-sm" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
        <span className="ml-2 text-sm text-slate-500">分組</span>
        <div className="flex overflow-hidden rounded-lg border border-slate-300">
          <button className={`px-3 py-1.5 text-sm ${groupBy === "week" ? "bg-brand text-white" : "hover:bg-slate-50"}`} onClick={() => setGroupBy("week")}>週</button>
          <button className={`px-3 py-1.5 text-sm ${groupBy === "month" ? "bg-brand text-white" : "hover:bg-slate-50"}`} onClick={() => setGroupBy("month")}>月</button>
        </div>
      </Card>

      <ErrorBar message={error} />

      {loading ? (
        <Spinner />
      ) : (
        <>
          {/* KPI 列 */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
            <Kpi label="訂單數" value={fmt(summary?.total_count ?? 0)} delta={delta(summary?.total_count, prev?.total_count)} />
            <Kpi label="總數量" value={fmt(summary?.total_quantity ?? 0)} delta={delta(summary?.total_quantity, prev?.total_quantity)} />
            <Kpi label="平均每單數量" value={fmt(avgPerOrder)} />
            <Kpi label="活躍廠商" value={fmt(summary?.vendor_count ?? 0)} delta={delta(summary?.vendor_count, prev?.vendor_count)} />
            <Kpi label="活躍接收單位" value={fmt(summary?.receiver_count ?? 0)} delta={delta(summary?.receiver_count, prev?.receiver_count)} />
          </div>

          {/* 數量趨勢 */}
          <Card>
            <h2 className="mb-2 font-bold">數量趨勢(每{groupBy === "week" ? "週" : "月"})</h2>
            {summary && summary.series.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={summary.series} margin={{ left: -10, right: 8, top: 4 }}>
                  <defs>
                    <linearGradient id="qfill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#1d4ed8" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#1d4ed8" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="period" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis fontSize={11} width={50} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(v) => [fmt(Number(v)), "數量"]} />
                  <Area type="monotone" dataKey="quantity" stroke="#1d4ed8" strokeWidth={2} fill="url(#qfill)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <Empty />
            )}
          </Card>

          {/* 廠商 / 接收單位 排行 */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <RankList title="廠商數量排行" items={byVendor} color="#1d4ed8" />
            <RankList title="接收單位數量排行" items={byReceiver} color="#10b981" />
          </div>

          {/* 品名占比 + 加工項目排行 */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <h2 className="mb-2 font-bold">品名占比(數量)</h2>
              {productPie.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={productPie} dataKey="quantity" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}>
                      {productPie.map((_, i) => (<Cell key={i} fill={COLORS[i % COLORS.length]} />))}
                    </Pie>
                    <Tooltip formatter={(v) => fmt(Number(v))} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <Empty />
              )}
            </Card>
            <RankList title="加工項目數量排行" items={byProcess} color="#f59e0b" />
          </div>
        </>
      )}
    </div>
  );
}

// 計算與上一期的變化%(prev=0 時:有值回 100、無值回 null)
function delta(cur?: number, prev?: number): number | null {
  if (cur === undefined || prev === undefined) return null;
  if (prev === 0) return cur > 0 ? 100 : null;
  return ((cur - prev) / prev) * 100;
}

function Kpi({ label, value, delta }: { label: string; value: string; delta?: number | null }) {
  const up = (delta ?? 0) >= 0;
  return (
    <Card className="flex flex-col justify-center">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="mt-1 text-2xl font-bold text-brand sm:text-3xl">{value}</span>
      {delta !== null && delta !== undefined && (
        <span className={`mt-1 text-xs font-medium ${up ? "text-emerald-600" : "text-red-500"}`}>
          {up ? "▲" : "▼"} {Math.abs(delta).toFixed(0)}% <span className="font-normal text-slate-400">vs 上一期</span>
        </span>
      )}
    </Card>
  );
}

// 橫條排行:依數量比例畫進度條(API 已由大到小排序)
function RankList({ title, items, color }: { title: string; items: Share[]; color: string }) {
  const top = items.filter((i) => i.quantity > 0).slice(0, 8);
  const max = top.length ? top[0].quantity : 1;
  return (
    <Card>
      <h2 className="mb-3 font-bold">{title}</h2>
      {top.length === 0 ? (
        <Empty />
      ) : (
        <ul className="space-y-2.5">
          {top.map((it, i) => (
            <li key={i}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="truncate pr-2 font-medium">{i + 1}. {it.name}</span>
                <span className="whitespace-nowrap text-slate-500">
                  {it.count ? `${it.count} 單 · ` : ""}
                  <b className="text-slate-800">{fmt(it.quantity)}</b>
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full" style={{ width: `${(it.quantity / max) * 100}%`, backgroundColor: color }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Empty() {
  return <p className="py-12 text-center text-slate-400">此區間沒有資料</p>;
}
