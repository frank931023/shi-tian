// 使用紀錄(僅 admin):條列每位使用者的登入與操作(建/改/刪訂單、主檔異動、產生 PDF…),
// 供日後回溯是誰做的。資料來自後端 audit_log。
import { useEffect, useState } from "react";
import { ApiError } from "../api/client";
import { auditApi, type AuditEntry } from "../api/resources";
import { Card, ErrorBar, Pager, Spinner } from "../components/ui";
import { useAuth } from "../lib/AuthContext";
import type { Paginated } from "../lib/types";

const PAGE_SIZE = 12;

// 行為代碼 → 中文說明 + 圖示 + 顏色
const ACTIONS: Record<string, { label: string; icon: string; cls: string }> = {
  login: { label: "登入", icon: "🔑", cls: "text-slate-500" },
  create_order: { label: "建立訂單", icon: "🧾", cls: "text-emerald-600" },
  update_order: { label: "編輯訂單", icon: "✏️", cls: "text-blue-600" },
  delete_order: { label: "刪除訂單(移到垃圾桶)", icon: "🗑️", cls: "text-red-500" },
  restore_order: { label: "復原訂單", icon: "♻️", cls: "text-emerald-600" },
  purge_order: { label: "永久刪除訂單", icon: "❌", cls: "text-red-600" },
  generate_pdf: { label: "產生訂單 PDF(封存)", icon: "📄", cls: "text-slate-600" },
  print_order: { label: "列印訂單", icon: "🖨️", cls: "text-slate-600" },
  statement_pdf: { label: "產生銷貨統計表 PDF", icon: "📊", cls: "text-indigo-600" },
  // 公司(廠商/接收)主檔
  create_company: { label: "新增公司(主檔)", icon: "🏢", cls: "text-emerald-600" },
  update_company: { label: "修改公司(主檔)", icon: "🏢", cls: "text-blue-600" },
  delete_company: { label: "刪除公司(移到垃圾桶)", icon: "🗑️", cls: "text-red-500" },
  restore_company: { label: "復原公司(主檔)", icon: "♻️", cls: "text-emerald-600" },
  purge_company: { label: "永久刪除公司(主檔)", icon: "❌", cls: "text-red-600" },
  // 品名主檔
  create_product: { label: "新增品名(主檔)", icon: "📦", cls: "text-emerald-600" },
  update_product: { label: "修改品名(主檔)", icon: "📦", cls: "text-blue-600" },
  delete_product: { label: "刪除品名(移到垃圾桶)", icon: "🗑️", cls: "text-red-500" },
  restore_product: { label: "復原品名(主檔)", icon: "♻️", cls: "text-emerald-600" },
  purge_product: { label: "永久刪除品名(主檔)", icon: "❌", cls: "text-red-600" },
  // 加工項目主檔
  create_process_item: { label: "新增加工項目(主檔)", icon: "🛠️", cls: "text-emerald-600" },
  update_process_item: { label: "修改加工項目(主檔)", icon: "🛠️", cls: "text-blue-600" },
  delete_process_item: { label: "刪除加工項目(移到垃圾桶)", icon: "🗑️", cls: "text-red-500" },
  restore_process_item: { label: "復原加工項目(主檔)", icon: "♻️", cls: "text-emerald-600" },
  purge_process_item: { label: "永久刪除加工項目(主檔)", icon: "❌", cls: "text-red-600" },
  // 規格主檔
  create_spec: { label: "新增規格(主檔)", icon: "📐", cls: "text-emerald-600" },
  delete_spec: { label: "刪除規格(移到垃圾桶)", icon: "🗑️", cls: "text-red-500" },
  restore_spec: { label: "復原規格(主檔)", icon: "♻️", cls: "text-emerald-600" },
  purge_spec: { label: "永久刪除規格(主檔)", icon: "❌", cls: "text-red-600" },
  // 聊天機器人
  chat_query: { label: "使用聊天機器人查詢", icon: "🤖", cls: "text-indigo-600" },
  chatbot_set_access: { label: "調整聊天機器人權限", icon: "🤖", cls: "text-blue-600" },
};

function describe(e: AuditEntry): string {
  const d = (e.detail ?? {}) as Record<string, unknown>;
  const extras: string[] = [];
  if (d.order_no) extras.push(`單號 ${String(d.order_no)}`);
  if (d.customer) extras.push(`客戶 ${String(d.customer)}`);
  if (d.period) extras.push(String(d.period));
  if (!extras.length && e.entity && e.entity_id) extras.push(`${e.entity} #${e.entity_id}`);
  return extras.join(" · ");
}

function when(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function ActivityLogPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [data, setData] = useState<Paginated<AuditEntry> | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    setLoading(true);
    auditApi.list(page, PAGE_SIZE)
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : "載入失敗"))
      .finally(() => setLoading(false));
  }, [page, isAdmin]);

  if (!isAdmin) {
    return <Card><p className="py-12 text-center text-slate-500">使用紀錄僅限管理員檢視。</p></Card>;
  }

  const items = data?.items ?? [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-xl font-bold sm:text-2xl">使用紀錄</h1>
      <p className="text-sm text-slate-500">記錄每位使用者的登入與操作(建立/編輯/刪除訂單、主檔異動、產生 PDF),供日後回溯。</p>

      <ErrorBar message={error} />

      {loading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <Card><p className="py-12 text-center text-slate-400">尚無紀錄</p></Card>
      ) : (
        <>
          <Card className="!p-0">
            <ul className="divide-y divide-slate-100">
              {items.map((e) => {
                const a = ACTIONS[e.action] ?? { label: e.action, icon: "•", cls: "text-slate-500" };
                const desc = describe(e);
                return (
                  <li key={e.id} className="flex items-start gap-3 px-4 py-3">
                    <span className="mt-0.5 text-lg">{a.icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        <span className={`font-semibold ${a.cls}`}>{a.label}</span>
                        {desc && <span className="text-slate-500"> · {desc}</span>}
                      </p>
                      <p className="text-xs text-slate-400">
                        {e.display_name || e.username || "(未知使用者)"} · {when(e.created_at)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-slate-500">共 {data?.total ?? 0} 筆</span>
            <Pager page={data?.page ?? 1} totalPages={totalPages} onChange={setPage} />
          </div>
        </>
      )}
    </div>
  );
}
