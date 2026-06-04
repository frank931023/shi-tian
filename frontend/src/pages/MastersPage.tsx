// 主檔管理:所有人都能查看;新增限 admin(operator 唯讀,符合 §5)。
import { useEffect, useState } from "react";
import { ApiError } from "../api/client";
import { companiesApi, printingApi, processItemsApi, productsApi } from "../api/resources";
import { Button, Card, ErrorBar, Field, Input, Select, Spinner } from "../components/ui";
import { useAuth } from "../lib/AuthContext";
import type { Company, ProcessItem, Product } from "../lib/types";

type Tab = "companies" | "products" | "process" | "calibration";

export default function MastersPage() {
  const [tab, setTab] = useState<Tab>("companies");
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-xl font-bold sm:text-2xl">主檔</h1>
      {!isAdmin && <p className="text-sm text-slate-500">你可以查看主檔;新增/修改需管理員權限。</p>}

      {/* 分頁切換:大按鈕,手機也好點 */}
      <div className="flex gap-2 overflow-x-auto">
        <TabBtn active={tab === "companies"} onClick={() => setTab("companies")}>公司</TabBtn>
        <TabBtn active={tab === "products"} onClick={() => setTab("products")}>品名</TabBtn>
        <TabBtn active={tab === "process"} onClick={() => setTab("process")}>加工項目</TabBtn>
        <TabBtn active={tab === "calibration"} onClick={() => setTab("calibration")}>套表校正</TabBtn>
      </div>

      {tab === "companies" && <CompaniesPanel isAdmin={isAdmin} />}
      {tab === "products" && <ProductsPanel isAdmin={isAdmin} />}
      {tab === "process" && <ProcessPanel isAdmin={isAdmin} />}
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

function CompaniesPanel({ isAdmin }: { isAdmin: boolean }) {
  const [items, setItems] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [roleType, setRoleType] = useState("both");
  const [phone, setPhone] = useState("");

  function reload() {
    setLoading(true);
    companiesApi.list().then(setItems).catch(() => {}).finally(() => setLoading(false));
  }
  useEffect(reload, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await companiesApi.create({ name, role_type: roleType as Company["role_type"], phone });
      setName(""); setPhone(""); setRoleType("both");
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "新增失敗");
    }
  }

  return (
    <div className="space-y-4">
      {isAdmin && (
        <Card>
          <form onSubmit={add} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <Field label="名稱" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </Field>
            <Field label="用途">
              <Select value={roleType} onChange={(e) => setRoleType(e.target.value)}>
                <option value="both">兩者</option>
                <option value="vendor">廠商</option>
                <option value="receiver">接收</option>
              </Select>
            </Field>
            <Field label="電話">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
            <div className="flex items-end">
              <Button type="submit" className="w-full">新增公司</Button>
            </div>
          </form>
          <ErrorBar message={error} />
        </Card>
      )}
      <Card>
        {loading ? <Spinner /> : (
          <ul className="divide-y divide-slate-100">
            {items.map((c) => (
              <li key={c.id} className="flex items-center justify-between py-3">
                <span className="font-medium">{c.name}</span>
                <span className="text-sm text-slate-500">
                  {c.role_type === "vendor" ? "廠商" : c.role_type === "receiver" ? "接收" : "兩者"}
                  {c.phone ? ` · ${c.phone}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function ProductsPanel({ isAdmin }: { isAdmin: boolean }) {
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");

  function reload() {
    setLoading(true);
    productsApi.list().then(setItems).catch(() => {}).finally(() => setLoading(false));
  }
  useEffect(reload, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await productsApi.create({ name, default_unit: unit || null });
      setName(""); setUnit("");
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "新增失敗");
    }
  }

  return (
    <div className="space-y-4">
      {isAdmin && (
        <Card>
          <form onSubmit={add} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="品名" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </Field>
            <Field label="預設單位">
              <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="K / KG / 件" />
            </Field>
            <div className="flex items-end">
              <Button type="submit" className="w-full">新增品名</Button>
            </div>
          </form>
          <ErrorBar message={error} />
        </Card>
      )}
      <Card>
        {loading ? <Spinner /> : (
          <ul className="divide-y divide-slate-100">
            {items.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-3">
                <span className="font-medium">{p.name}</span>
                <span className="text-sm text-slate-500">{p.default_unit ?? ""}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function ProcessPanel({ isAdmin }: { isAdmin: boolean }) {
  const [items, setItems] = useState<ProcessItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");

  function reload() {
    setLoading(true);
    processItemsApi.list().then(setItems).catch(() => {}).finally(() => setLoading(false));
  }
  useEffect(reload, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await processItemsApi.create({ name });
      setName("");
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "新增失敗");
    }
  }

  return (
    <div className="space-y-4">
      {isAdmin && (
        <Card>
          <form onSubmit={add} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="加工項目" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="例:車刃、咬花" />
            </Field>
            <div className="flex items-end sm:col-span-2">
              <Button type="submit">新增加工項目</Button>
            </div>
          </form>
          <ErrorBar message={error} />
        </Card>
      )}
      <Card>
        {loading ? <Spinner /> : (
          <ul className="divide-y divide-slate-100">
            {items.map((p) => (
              <li key={p.id} className="py-3 font-medium">{p.name}</li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
