// 報表頁:Bento 版面 + Recharts(數字卡 / 圓餅 / 長條)。
// 時間區間(本週/本月/近三月/自訂)+ 週/月分組;聚合都在後端 DB 完成,前端只畫。
import { useEffect, useMemo, useState } from "react";
import {
  Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
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
// 用固定字串做區間預設,避免在模組頂層用 new Date()
function presetRange(kind: "week" | "month" | "quarter"): { from: string; to: string } {
  const now = new Date();
  const to = ymd(now);
  const start = new Date(now);
  if (kind === "week") start.setDate(now.getDate() - 7);
  else if (kind === "month") start.setMonth(now.getMonth() - 1);
  else start.setMonth(now.getMonth() - 3);
  return { from: ymd(start), to };
}

export default function ReportsPage() {
  const [range, setRange] = useState(() => presetRange("month"));
  const [groupBy, setGroupBy] = useState<"week" | "month">("month");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [byProduct, setByProduct] = useState<Share[]>([]);
  const [byCompany, setByCompany] = useState<Share[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    Promise.all([
      reportsApi.summary({ ...range, group_by: groupBy }),
      reportsApi.byProduct(range),
      reportsApi.byCompany(range),
    ])
      .then(([s, p, c]) => {
        if (!alive) return;
        setSummary(s);
        setByProduct(p);
        setByCompany(c);
      })
      .catch((err) => alive && setError(err instanceof ApiError ? err.message : "載入報表失敗"))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [range, groupBy]);

  const productPie = useMemo(
    () => byProduct.filter((p) => p.quantity > 0).slice(0, 8),
    [byProduct],
  );

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <h1 className="text-xl font-bold sm:text-2xl">報表</h1>

      {/* 區間 + 分組控制 */}
      <Card className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-500">區間</span>
        <button className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50" onClick={() => setRange(presetRange("week"))}>近一週</button>
        <button className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50" onClick={() => setRange(presetRange("month"))}>近一月</button>
        <button className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50" onClick={() => setRange(presetRange("quarter"))}>近三月</button>
        <input type="date" className="min-h-[40px] rounded-lg border border-slate-300 px-2 text-sm" value={range.from ?? ""} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
        <span>~</span>
        <input type="date" className="min-h-[40px] rounded-lg border border-slate-300 px-2 text-sm" value={range.to ?? ""} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
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
        // Bento grid:數字卡 + 長條 + 圓餅
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="總筆數" value={String(summary?.total_count ?? 0)} className="col-span-2" />
          <StatCard label="總數量" value={String(summary?.total_quantity ?? 0)} className="col-span-2" />

          {/* 每期數量長條圖 */}
          <Card className="col-span-2 lg:col-span-2">
            <h2 className="mb-2 font-bold">每{groupBy === "week" ? "週" : "月"}數量</h2>
            {summary && summary.series.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={summary.series}>
                  <XAxis dataKey="period" fontSize={11} />
                  <YAxis fontSize={11} width={50} />
                  <Tooltip />
                  <Bar dataKey="quantity" fill="#1d4ed8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Empty />
            )}
          </Card>

          {/* 品名占比圓餅(數量) */}
          <Card className="col-span-2 lg:col-span-2">
            <h2 className="mb-2 font-bold">品名占比(數量)</h2>
            {productPie.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={productPie} dataKey="quantity" nameKey="name" outerRadius={90} label={(e) => e.name}>
                    {productPie.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <Empty />
            )}
          </Card>

          {/* 廠商數量排行 */}
          <Card className="col-span-2 lg:col-span-4">
            <h2 className="mb-2 font-bold">廠商數量排行</h2>
            {byCompany.filter((c) => c.quantity > 0).length > 0 ? (
              <ul className="divide-y divide-slate-100">
                {byCompany.filter((c) => c.quantity > 0).map((c, i) => (
                  <li key={i} className="flex items-center justify-between py-2">
                    <span className="font-medium">{c.name}</span>
                    <span className="text-slate-500">{c.count} 筆 · 數量 <span className="font-semibold text-brand">{c.quantity}</span></span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty />
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <Card className={`flex flex-col justify-center ${className}`}>
      <span className="text-sm text-slate-500">{label}</span>
      <span className="mt-1 text-2xl font-bold text-brand sm:text-3xl">{value}</span>
    </Card>
  );
}

function Empty() {
  return <p className="py-12 text-center text-slate-400">此區間沒有資料</p>;
}
