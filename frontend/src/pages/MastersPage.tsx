// 主檔管理:所有人都能查看;新增限 admin(operator 唯讀,符合 §5)。
import { Fragment, useEffect, useState } from "react";
import { ApiError } from "../api/client";
import { companiesApi, printingApi, processItemsApi, productsApi, specsApi } from "../api/resources";
import { Button, Card, ErrorBar, Field, Input, Modal, Pager, Select, Spinner, Textarea } from "../components/ui";
import { useAuth } from "../lib/AuthContext";
import { receiverMethod, receiverMethodOptions } from "../lib/company";
import { compareSpecName } from "../lib/spec";
import type { Company, Spec } from "../lib/types";

// 客製分頁:每頁 10 筆,回傳目前頁資料 + 控制(超過範圍會自動夾住)
function usePaged<T>(items: T[], size = 10) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / size));
  const p = Math.min(page, totalPages);
  return { page: p, setPage, totalPages, pageItems: items.slice((p - 1) * size, p * size) };
}

// 純名稱清單(品名 / 加工項目)用的「列表 / 卡片」呈現 + 分頁
type SimpleItem = { id: number; name: string; note?: string | null };

// 二次確認刪除 modal;requireText 有值時,要輸入完全相同的文字才能按刪除
function ConfirmModal({
  open, title, message, confirmLabel = "刪除", requireText, onConfirm, onClose,
}: {
  open: boolean; title: string; message: React.ReactNode; confirmLabel?: string;
  requireText?: string; onConfirm: () => void | Promise<void>; onClose: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) { setTyped(""); setBusy(false); setError(null); } }, [open]);
  const canConfirm = !requireText || typed.trim() === requireText.trim();
  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>取消</Button>
          <Button
            variant="danger"
            disabled={!canConfirm || busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await onConfirm();
              } catch (err) {
                setError(err instanceof ApiError ? err.message : "刪除失敗,請稍後再試");
                setBusy(false);
              }
            }}
          >
            {busy ? "處理中…" : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <div>{message}</div>
        {requireText && (
          <Field label={`請輸入完整名稱「${requireText}」以二次確認`}>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={requireText} />
          </Field>
        )}
        <ErrorBar message={error} />
      </div>
    </Modal>
  );
}

// 編輯名稱 + 備註的 modal(品名 / 加工項目共用)
function NameEditModal({
  title, item, onSave, onClose,
}: {
  title: string; item: SimpleItem;
  onSave: (v: { name: string; note: string | null }) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(item.name);
  const [note, setNote] = useState(item.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    setBusy(true);
    setError(null);
    try {
      await onSave({ name: name.trim(), note: note.trim() || null });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "儲存失敗");
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>取消</Button>
          <Button onClick={save} disabled={busy || !name.trim()}>{busy ? "儲存中…" : "儲存"}</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="名稱" required><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="備註"><Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="可填寫備註(選填)" /></Field>
        <ErrorBar message={error} />
      </div>
    </Modal>
  );
}

// 可編輯/刪除的名稱清單(品名、加工項目共用)
function EditableNameList({
  paged, view, isAdmin, onEdit, onDelete,
}: {
  paged: { pageItems: SimpleItem[]; page: number; totalPages: number; setPage: (p: number) => void };
  view: "list" | "grid"; isAdmin: boolean;
  onEdit: (item: SimpleItem) => void; onDelete: (item: SimpleItem) => void;
}) {
  return (
    <>
      {view === "grid" ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {paged.pageItems.map((p) => (
            <div key={p.id} className="flex flex-col rounded-xl border border-slate-200 p-3">
              <span className="font-medium">{p.name}</span>
              {p.note && <span className="mt-0.5 text-xs text-slate-500">{p.note}</span>}
              {isAdmin && (
                <div className="mt-2 flex gap-3">
                  <button type="button" className="text-xs text-brand hover:underline" onClick={() => onEdit(p)}>編輯</button>
                  <button type="button" className="text-xs text-red-500 hover:underline" onClick={() => onDelete(p)}>刪除</button>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {paged.pageItems.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <span className="font-medium">{p.name}</span>
                {p.note && <span className="ml-2 text-sm text-slate-500">{p.note}</span>}
              </div>
              {isAdmin && (
                <div className="flex shrink-0 gap-3">
                  <button type="button" className="text-sm text-brand hover:underline" onClick={() => onEdit(p)}>編輯</button>
                  <button type="button" className="text-sm text-red-500 hover:underline" onClick={() => onDelete(p)}>刪除</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex justify-end">
        <Pager page={paged.page} totalPages={paged.totalPages} onChange={paged.setPage} />
      </div>
    </>
  );
}

// 品名 / 加工項目 共用面板:新增 + 清單(可編輯名稱/備註、可刪除,刪除需二次確認)
function SimpleMasterPanel({
  isAdmin, view, label, placeholder, api,
}: {
  isAdmin: boolean; view: "list" | "grid"; label: string; placeholder?: string;
  api: {
    list: () => Promise<SimpleItem[]>;
    create: (b: { name: string }) => Promise<unknown>;
    update: (id: number, b: { name: string; note: string | null }) => Promise<unknown>;
    remove: (id: number) => Promise<unknown>;
  };
}) {
  const [items, setItems] = useState<SimpleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [editItem, setEditItem] = useState<SimpleItem | null>(null);
  const [delItem, setDelItem] = useState<SimpleItem | null>(null);

  function reload() {
    setLoading(true);
    api.list().then(setItems).catch(() => {}).finally(() => setLoading(false));
  }
  useEffect(reload, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.create({ name });
      setName("");
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "新增失敗");
    }
  }

  const paged = usePaged(items, view === "grid" ? 12 : 10);

  return (
    <div className="space-y-4">
      {isAdmin && (
        <Card>
          <form onSubmit={add} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label={label} required>
              <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder={placeholder} />
            </Field>
            <div className="flex items-end sm:col-span-2">
              <Button type="submit">新增{label}</Button>
            </div>
          </form>
          <ErrorBar message={error} />
        </Card>
      )}
      <Card>
        {loading ? <Spinner /> : (
          <EditableNameList paged={paged} view={view} isAdmin={isAdmin} onEdit={setEditItem} onDelete={setDelItem} />
        )}
      </Card>

      {editItem && (
        <NameEditModal
          title={`編輯${label}`}
          item={editItem}
          onClose={() => setEditItem(null)}
          onSave={async (v) => { await api.update(editItem.id, v); setEditItem(null); reload(); }}
        />
      )}
      <ConfirmModal
        open={!!delItem}
        title={`刪除${label}`}
        message={<>確定要刪除「<b>{delItem?.name}</b>」嗎?刪除後不會出現在清單與建單下拉,歷史單據不受影響。</>}
        onClose={() => setDelItem(null)}
        onConfirm={async () => { if (delItem) { await api.remove(delItem.id); setDelItem(null); reload(); } }}
      />
    </div>
  );
}

// 廠商聯絡人(可多筆)
interface Contact { name: string; company_phone: string; company_fax: string; mobile: string; }

function toContacts(detail: Record<string, unknown> | null | undefined): Contact[] {
  const raw = detail && Array.isArray(detail.contact) ? (detail.contact as Array<Record<string, unknown>>) : [];
  return raw.map((c) => ({
    name: String(c.name ?? ""),
    company_phone: String(c.company_phone ?? ""),
    company_fax: String(c.company_fax ?? ""),
    mobile: String(c.mobile ?? ""),
  }));
}

// 聯絡人編輯器(廠商用):可新增/移除/修改多位聯絡人
function ContactsEditor({ contacts, setContacts }: { contacts: Contact[]; setContacts: (c: Contact[]) => void }) {
  const update = (i: number, patch: Partial<Contact>) =>
    setContacts(contacts.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  const add = () => setContacts([...contacts, { name: "", company_phone: "", company_fax: "", mobile: "" }]);
  const remove = (i: number) => setContacts(contacts.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700">聯絡人</span>
        <button type="button" onClick={add} className="text-sm text-brand hover:underline">＋ 新增聯絡人</button>
      </div>
      {contacts.length === 0 && <p className="text-sm text-slate-400">尚無聯絡人,按「＋ 新增聯絡人」加入</p>}
      {contacts.map((c, i) => (
        <div key={i} className="rounded-lg border border-slate-200 p-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs text-slate-400">聯絡人 {i + 1}</span>
            <button type="button" onClick={() => remove(i)} className="text-xs text-red-500 hover:underline">移除</button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="姓名" value={c.name} onChange={(e) => update(i, { name: e.target.value })} />
            <Input placeholder="電話" value={c.company_phone} onChange={(e) => update(i, { company_phone: e.target.value })} />
            <Input placeholder="傳真" value={c.company_fax} onChange={(e) => update(i, { company_fax: e.target.value })} />
            <Input placeholder="手機" value={c.mobile} onChange={(e) => update(i, { mobile: e.target.value })} />
          </div>
        </div>
      ))}
    </div>
  );
}

// 由聯絡人清單推導公司層級的電話/傳真(取第一位),並組出要存的 detail(含統一編號)
function buildVendorDetail(
  base: Record<string, unknown> | null | undefined,
  name: string, address: string, taxid: string, contacts: Contact[],
) {
  const clean = contacts.filter((c) => c.name || c.company_phone || c.company_fax || c.mobile);
  const first = clean[0];
  return {
    detail: { ...(base ?? {}), company: name, address, taxid: taxid.trim(), contact: clean },
    phone: first ? first.company_phone || first.mobile : "",
    fax: first ? first.company_fax : "",
  };
}

type Tab = "vendors" | "receivers" | "products" | "process" | "specs" | "calibration";

export default function MastersPage() {
  const [tab, setTab] = useState<Tab>("vendors");
  const [view, setView] = useState<"list" | "grid">("list");
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const showViewToggle = ["vendors", "receivers", "products", "process"].includes(tab);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-xl font-bold sm:text-2xl">主檔</h1>

      {/* 分頁 + 檢視切換:同一排(分頁靠左可橫向捲動,切換靠右) */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-2 overflow-x-auto">
          <TabBtn active={tab === "vendors"} onClick={() => setTab("vendors")}>廠商單位</TabBtn>
          <TabBtn active={tab === "receivers"} onClick={() => setTab("receivers")}>接收單位</TabBtn>
          <TabBtn active={tab === "products"} onClick={() => setTab("products")}>品名</TabBtn>
          <TabBtn active={tab === "process"} onClick={() => setTab("process")}>加工項目</TabBtn>
          <TabBtn active={tab === "specs"} onClick={() => setTab("specs")}>規格</TabBtn>
          <TabBtn active={tab === "calibration"} onClick={() => setTab("calibration")}>套表校正</TabBtn>
        </div>
        {showViewToggle && (
          <div className="inline-flex shrink-0 overflow-hidden rounded-lg border border-slate-300 text-sm">
            <button className={`px-3 py-1.5 ${view === "list" ? "bg-brand text-white" : "hover:bg-slate-50"}`} onClick={() => setView("list")}>☰ 列表</button>
            <button className={`px-3 py-1.5 ${view === "grid" ? "bg-brand text-white" : "hover:bg-slate-50"}`} onClick={() => setView("grid")}>▦ 卡片</button>
          </div>
        )}
      </div>

      {/* 主檔新增/編輯開放給所有登入者(含操作員);套表校正 offset 仍限管理員 */}
      {tab === "vendors" && <CompaniesPanel isAdmin role="vendor" view={view} />}
      {tab === "receivers" && <CompaniesPanel isAdmin role="receiver" view={view} />}
      {tab === "products" && <ProductsPanel isAdmin view={view} />}
      {tab === "process" && <ProcessPanel isAdmin view={view} />}
      {tab === "specs" && <SpecsPanel isAdmin />}
      {tab === "calibration" && <CalibrationPanel isAdmin={isAdmin} />}
    </div>
  );
}

// 點陣套表校正:下載校正頁、調整 offset 並存檔(免改程式微調對位)
function CalibrationPanel({ isAdmin }: { isAdmin: boolean }) {
  const [offsetX, setOffsetX] = useState("0");
  const [offsetY, setOffsetY] = useState("0");
  const [layout, setLayout] = useState<Record<string, unknown> | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    printingApi.getLayout().then((l) => {
      setLayout(l);
      const off = (l.offset as { x: number; y: number }) ?? { x: 0, y: 0 };
      setOffsetX(String(off.x));
      setOffsetY(String(off.y));
    }).catch(() => {});
  }, []);

  async function save() {
    if (!layout) return;
    setMsg(null);
    setError(null);
    try {
      await printingApi.saveLayout({ ...layout, offset: { x: Number(offsetX), y: Number(offsetY) } });
      setMsg("已儲存,重新下載校正頁即可看到位移");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "儲存失敗");
    }
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <h2 className="font-bold">點陣套表校正</h2>
        <p className="text-sm text-slate-500">
          流程:① 下載「校正頁」印在現成三聯單上 → ② 量測資料偏移多少 point(1/72 吋)→
          ③ 調整下方 offset 並儲存 → ④ 重新下載再印,反覆對準。
        </p>
        <a className="inline-block" href={printingApi.calibrationUrl()} target="_blank" rel="noreferrer">
          <Button type="button" variant="secondary">下載 / 預覽校正頁</Button>
        </a>
        {isAdmin ? (
          <>
            <div className="grid grid-cols-2 gap-3 sm:max-w-xs">
              <Field label="offset X (point)">
                <Input type="number" value={offsetX} onChange={(e) => setOffsetX(e.target.value)} />
              </Field>
              <Field label="offset Y (point)">
                <Input type="number" value={offsetY} onChange={(e) => setOffsetY(e.target.value)} />
              </Field>
            </div>
            <ErrorBar message={error} />
            {msg && <p className="text-sm text-green-600">{msg}</p>}
            <Button type="button" onClick={save} disabled={!layout}>儲存 offset</Button>
          </>
        ) : (
          <p className="text-sm text-slate-400">offset 調整需管理員權限。</p>
        )}
      </Card>
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`min-h-[44px] whitespace-nowrap rounded-xl px-4 font-medium ${active ? "bg-brand text-white" : "bg-white text-slate-700 border border-slate-300"}`}
    >
      {children}
    </button>
  );
}

function CompaniesPanel({ isAdmin, role, view }: { isAdmin: boolean; role: "vendor" | "receiver"; view: "list" | "grid" }) {
  const [items, setItems] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [method, setMethod] = useState(""); // 接收單位:依加工方式篩選("" = 全部)
  const [addOpen, setAddOpen] = useState(false);
  const [detail, setDetail] = useState<Company | null>(null);

  const roleLabel = role === "vendor" ? "廠商單位" : "接收單位";

  function reload() {
    setLoading(true);
    companiesApi.list(role).then(setItems).catch(() => {}).finally(() => setLoading(false));
  }
  useEffect(reload, [role]);

  // 接收單位才有加工方式:蒐集所有出現過的基底分類(去重、排序)當下拉選項
  const methodOptions = role === "receiver" ? receiverMethodOptions(items) : [];

  const q = query.trim().toLowerCase();
  const filtered = items.filter((c) => {
    // 名稱 / 縮寫 / 電話 / 傳真 都可搜
    if (q && !`${c.name}${c.abbr ?? ""}${c.phone ?? ""}${c.fax ?? ""}`.toLowerCase().includes(q)) return false;
    if (method && receiverMethod(c) !== method) return false;
    return true;
  });
  const paged = usePaged(filtered, view === "grid" ? 12 : 10);

  return (
    <div className="space-y-4">
      {/* 搜尋列 + 右上角新增按鈕 */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={role === "receiver" ? `搜尋${roleLabel}(名稱 / 縮寫 / 電話 / 傳真)` : `搜尋${roleLabel}(名稱 / 電話 / 傳真)`}
          />
        </div>
        {role === "receiver" && methodOptions.length > 0 && (
          <div className="w-40 shrink-0">
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="">全部加工方式</option>
              {methodOptions.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </Select>
          </div>
        )}
        {isAdmin && (
          <Button type="button" onClick={() => setAddOpen(true)} className="whitespace-nowrap">
            ＋ 新增{roleLabel}
          </Button>
        )}
      </div>

      <Card>
        <h2 className="mb-2 font-bold">
          {roleLabel} <span className="text-sm font-normal text-slate-400">({filtered.length})</span>
        </h2>
        {loading ? <Spinner /> : filtered.length === 0 ? (
          <p className="py-6 text-center text-slate-400">沒有符合的{roleLabel}</p>
        ) : (
          <>
            {view === "grid" ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {paged.pageItems.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setDetail(c)}
                    className="flex flex-col rounded-xl border border-slate-200 p-3 text-left transition hover:border-brand hover:bg-slate-50"
                  >
                    <span className="truncate font-medium text-brand">{c.name}</span>
                    <span className="mt-1 text-xs text-slate-500">{c.phone ? `☎ ${c.phone}` : "—"}</span>
                    {c.fax && <span className="truncate text-xs text-slate-400">傳真 {c.fax}</span>}
                  </button>
                ))}
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {paged.pageItems.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setDetail(c)}
                      className="flex w-full items-center justify-between gap-3 rounded-lg px-1 py-3 text-left hover:bg-slate-50"
                    >
                      <span className="font-medium text-brand">{c.name}</span>
                      <span className="text-right text-sm text-slate-500">
                        {c.phone ? `☎ ${c.phone}` : ""}{c.fax ? ` · 傳真 ${c.fax}` : ""}
                        <span className="ml-1 text-slate-300">›</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex justify-end">
              <Pager page={paged.page} totalPages={paged.totalPages} onChange={paged.setPage} />
            </div>
          </>
        )}
      </Card>

      {addOpen && (
        <CompanyAddModal
          role={role}
          roleLabel={roleLabel}
          onClose={() => setAddOpen(false)}
          onSaved={() => { setAddOpen(false); reload(); }}
        />
      )}
      {detail && (
        <CompanyDetailModal
          key={detail.id}
          company={detail}
          isAdmin={isAdmin}
          onClose={() => setDetail(null)}
          onSaved={(updated) => { setDetail(updated); reload(); }}
          onDeleted={() => { setDetail(null); reload(); }}
        />
      )}
    </div>
  );
}

// 新增公司(用途由所在分頁決定,不需再選)。廠商可加多位聯絡人;接收用單一電話/傳真。
function CompanyAddModal({
  role, roleLabel, onClose, onSaved,
}: { role: "vendor" | "receiver"; roleLabel: string; onClose: () => void; onSaved: () => void }) {
  const isVendor = role === "vendor";
  const [name, setName] = useState("");
  const [abbr, setAbbr] = useState("");
  const [phone, setPhone] = useState("");
  const [fax, setFax] = useState("");
  const [address, setAddress] = useState("");
  const [taxid, setTaxid] = useState("");
  const [method, setMethod] = useState(""); // 接收單位:加工方式
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setError(null);
    setBusy(true);
    try {
      if (isVendor) {
        const { detail, phone: p, fax: f } = buildVendorDetail(null, name.trim(), address, taxid, contacts);
        await companiesApi.create({ name: name.trim(), role_type: role, phone: p, fax: f, address, detail });
      } else {
        // 接收單位:縮寫預設同名稱;加工方式存進 detail
        await companiesApi.create({
          name: name.trim(), role_type: role, phone, fax, address,
          abbr: abbr.trim() || name.trim(),
          detail: method.trim() ? { proccessMethod: method.trim() } : undefined,
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "新增失敗");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      title={`新增${roleLabel}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>取消</Button>
          <Button onClick={save} disabled={busy || !name.trim()}>{busy ? "儲存中…" : "新增"}</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="名稱" required><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        {isVendor && (
          <Field label="統一編號"><Input value={taxid} onChange={(e) => setTaxid(e.target.value)} placeholder="8 碼數字" /></Field>
        )}
        <Field label="地址"><Input value={address} onChange={(e) => setAddress(e.target.value)} /></Field>
        {isVendor ? (
          <ContactsEditor contacts={contacts} setContacts={setContacts} />
        ) : (
          <>
            <Field label="縮寫" hint="預設同名稱,可自行修改;銷貨統計表會顯示縮寫">
              <Input value={abbr} onChange={(e) => setAbbr(e.target.value)} placeholder={name || "預設同名稱"} />
            </Field>
            <Field label="加工方式" hint="例:CNC、研磨、車工;建單時可依此分類篩選">
              <Input value={method} onChange={(e) => setMethod(e.target.value)} placeholder="例:CNC" />
            </Field>
            <Field label="電話"><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
            <Field label="傳真"><Input value={fax} onChange={(e) => setFax(e.target.value)} /></Field>
          </>
        )}
        <ErrorBar message={error} />
      </div>
    </Modal>
  );
}

// 點公司 → 顯示完整資料(廠商:多位聯絡人;接收:加工方式等),admin 可切換編輯
function CompanyDetailModal({
  company, isAdmin, onClose, onSaved, onDeleted,
}: { company: Company; isAdmin: boolean; onClose: () => void; onSaved: (updated: Company) => void; onDeleted: () => void }) {
  const isVendor = company.role_type === "vendor";
  const roleLabel = isVendor ? "廠商單位" : "接收單位";
  const [editing, setEditing] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [name, setName] = useState(company.name);
  const [abbr, setAbbr] = useState(company.abbr ?? company.name);
  const [phone, setPhone] = useState(company.phone ?? "");
  const [fax, setFax] = useState(company.fax ?? "");
  const [address, setAddress] = useState(company.address ?? "");
  const [taxid, setTaxid] = useState(String((company.detail as Record<string, unknown> | null)?.taxid ?? ""));
  const [method, setMethod] = useState(String((company.detail as Record<string, unknown> | null)?.proccessMethod ?? ""));
  const [contacts, setContacts] = useState<Contact[]>(() => toContacts(company.detail));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const d = (company.detail ?? null) as Record<string, unknown> | null;
  const viewContacts = d && Array.isArray(d.contact) ? (d.contact as Array<Record<string, unknown>>) : null;
  const recvFields: [string, string][] = [["proccessMethod", "加工方式"], ["name", "聯絡人"], ["mobile", "手機"]];

  async function save() {
    setError(null);
    setBusy(true);
    try {
      // 接收單位:把加工方式併回 detail(保留 detail 內其他欄位,如聯絡人/手機)
      const recvDetail = { ...(d ?? {}), proccessMethod: method.trim() };
      const body = isVendor
        ? { name: name.trim(), address, ...buildVendorDetail(d, name.trim(), address, taxid, contacts) }
        : { name: name.trim(), phone, fax, address, abbr: abbr.trim() || name.trim(), detail: recvDetail };
      const updated = await companiesApi.update(company.id, body);
      onSaved(updated);
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "儲存失敗");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
    <Modal
      open
      title={company.name}
      onClose={onClose}
      footer={editing ? (
        <>
          <Button variant="secondary" onClick={() => setEditing(false)} disabled={busy}>取消</Button>
          <Button onClick={save} disabled={busy || !name.trim()}>{busy ? "儲存中…" : "儲存"}</Button>
        </>
      ) : (
        <>
          <Button variant="secondary" onClick={onClose}>關閉</Button>
          {isAdmin && <Button variant="danger" onClick={() => setConfirmDel(true)}>刪除</Button>}
          {isAdmin && <Button onClick={() => setEditing(true)}>編輯</Button>}
        </>
      )}
    >
      {editing ? (
        <div className="space-y-3">
          <Field label="名稱" required><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          {isVendor && (
            <Field label="統一編號"><Input value={taxid} onChange={(e) => setTaxid(e.target.value)} placeholder="8 碼數字" /></Field>
          )}
          <Field label="地址"><Input value={address} onChange={(e) => setAddress(e.target.value)} /></Field>
          {isVendor ? (
            <ContactsEditor contacts={contacts} setContacts={setContacts} />
          ) : (
            <>
              <Field label="縮寫" hint="銷貨統計表會顯示此縮寫">
                <Input value={abbr} onChange={(e) => setAbbr(e.target.value)} placeholder={name} />
              </Field>
              <Field label="加工方式" hint="例:CNC、研磨、車工;建單時可依此分類篩選">
                <Input value={method} onChange={(e) => setMethod(e.target.value)} placeholder="例:CNC" />
              </Field>
              <Field label="電話"><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
              <Field label="傳真"><Input value={fax} onChange={(e) => setFax(e.target.value)} /></Field>
            </>
          )}
          <ErrorBar message={error} />
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <span><span className="text-slate-400">用途 </span>{company.role_type === "vendor" ? "廠商單位" : "接收單位"}</span>
            {company.role_type === "receiver" && company.abbr && (
              <span><span className="text-slate-400">縮寫 </span>{company.abbr}</span>
            )}
            {d?.taxid ? <span><span className="text-slate-400">統一編號 </span>{String(d.taxid)}</span> : null}
            {company.phone && <span><span className="text-slate-400">電話 </span>{company.phone}</span>}
            {company.fax && <span><span className="text-slate-400">傳真 </span>{company.fax}</span>}
          </div>
          {company.address && <p><span className="text-slate-400">地址 </span>{company.address}</p>}

          {viewContacts && (
            <div>
              <p className="mb-1 font-medium">聯絡人({viewContacts.length})</p>
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {viewContacts.map((c, i) => (
                  <li key={i} className="px-3 py-2">
                    <span className="font-medium">{String(c.name ?? "—")}</span>
                    <span className="ml-2 text-slate-500">
                      {c.company_phone ? `☎ ${String(c.company_phone)} ` : ""}
                      {c.company_fax ? `傳真 ${String(c.company_fax)} ` : ""}
                      {c.mobile ? `手機 ${String(c.mobile)}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!viewContacts && d && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              {recvFields.map(([k, label]) =>
                d[k] ? (
                  <Fragment key={k}>
                    <dt className="text-slate-400">{label}</dt>
                    <dd>{String(d[k])}</dd>
                  </Fragment>
                ) : null,
              )}
            </dl>
          )}
        </div>
      )}
    </Modal>

    <ConfirmModal
      open={confirmDel}
      title={`刪除${roleLabel}`}
      message={<>確定要刪除{roleLabel}「<b>{company.name}</b>」嗎?刪除後不會出現在清單與建單下拉,歷史單據不受影響。</>}
      requireText={company.name}
      onClose={() => setConfirmDel(false)}
      onConfirm={async () => { await companiesApi.remove(company.id); setConfirmDel(false); onDeleted(); }}
    />
    </>
  );
}

function ProductsPanel({ isAdmin, view }: { isAdmin: boolean; view: "list" | "grid" }) {
  return (
    <SimpleMasterPanel
      isAdmin={isAdmin}
      view={view}
      label="品名"
      api={{
        list: () => productsApi.list(),
        create: (b) => productsApi.create(b),
        update: (id, b) => productsApi.update(id, b),
        remove: (id) => productsApi.remove(id),
      }}
    />
  );
}

function ProcessPanel({ isAdmin, view }: { isAdmin: boolean; view: "list" | "grid" }) {
  return (
    <SimpleMasterPanel
      isAdmin={isAdmin}
      view={view}
      label="加工項目"
      placeholder="例:車刃、咬花"
      api={{
        list: () => processItemsApi.list(),
        create: (b) => processItemsApi.create(b),
        update: (id, b) => processItemsApi.update(id, b),
        remove: (id) => processItemsApi.remove(id),
      }}
    />
  );
}

function SpecsPanel({ isAdmin }: { isAdmin: boolean }) {
  const [items, setItems] = useState<Spec[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"規格1" | "規格2">("規格1");
  // 去重後的待刪項目:同名(可能對應多個 id / 多個搭配組合),刪除時一起刪掉
  const [delSpec, setDelSpec] = useState<{ name: string; ids: number[] } | null>(null);

  function reload() {
    setLoading(true);
    specsApi.list().then(setItems).catch(() => {}).finally(() => setLoading(false));
  }
  useEffect(reload, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await specsApi.create({ name, kind });
      setName("");
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "新增失敗");
    }
  }

  // 依 kind 分兩欄,同名去重(規格2 因搭配組合會有重複),按公制/英制排序
  function uniqueByName(list: Spec[]): { name: string; ids: number[] }[] {
    const map = new Map<string, number[]>();
    for (const s of list) {
      const arr = map.get(s.name);
      if (arr) arr.push(s.id);
      else map.set(s.name, [s.id]);
    }
    return Array.from(map.entries())
      .map(([name, ids]) => ({ name, ids }))
      .sort((a, b) => compareSpecName(a.name, b.name));
  }
  const spec1 = uniqueByName(items.filter((s) => s.kind !== "規格2"));
  const spec2 = uniqueByName(items.filter((s) => s.kind === "規格2"));

  const renderChips = (list: { name: string; ids: number[] }[]) => (
    <ul className="flex flex-wrap gap-1.5">
      {list.map((s) => (
        <li key={s.name} className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-sm">
          <span>{s.name}</span>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setDelSpec(s)}
              className="ml-0.5 text-base leading-none text-slate-400 hover:text-red-500"
              aria-label={`刪除 ${s.name}`}
            >
              ×
            </button>
          )}
        </li>
      ))}
    </ul>
  );

  return (
    <div className="space-y-4">
      {isAdmin && (
        <Card>
          {/* 規格分「規格1 / 規格2」兩類;建單時規格1、規格2 各自下拉 */}
          <form onSubmit={add} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="類別">
              <Select value={kind} onChange={(e) => setKind(e.target.value as "規格1" | "規格2")}>
                <option value="規格1">規格1</option>
                <option value="規格2">規格2</option>
              </Select>
            </Field>
            <Field label="規格值" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder='例:1/4"x 6P 或 13' />
            </Field>
            <div className="flex items-end">
              <Button type="submit" className="w-full">新增規格</Button>
            </div>
          </form>
          <ErrorBar message={error} />
        </Card>
      )}
      <Card>
        {loading ? <Spinner /> : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <h3 className="mb-1 font-bold text-slate-600">規格1 <span className="text-xs font-normal text-slate-400">({spec1.length})</span></h3>
              {renderChips(spec1)}
            </div>
            <div>
              <h3 className="mb-1 font-bold text-slate-600">規格2 <span className="text-xs font-normal text-slate-400">({spec2.length})</span></h3>
              {renderChips(spec2)}
            </div>
          </div>
        )}
      </Card>

      <ConfirmModal
        open={!!delSpec}
        title="刪除規格"
        message={<>確定要刪除規格「<b>{delSpec?.name}</b>」嗎?刪除後不會出現在建單下拉,歷史單據不受影響。</>}
        onClose={() => setDelSpec(null)}
        onConfirm={async () => {
          if (delSpec) {
            // 同名可能有多筆(不同搭配組合),一起刪
            await Promise.all(delSpec.ids.map((id) => specsApi.remove(id)));
            setDelSpec(null);
            reload();
          }
        }}
      />
    </div>
  );
}
