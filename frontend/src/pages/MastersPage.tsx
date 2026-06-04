// 主檔管理(admin):公司、品名、加工項目的查詢與新增。
// 為求簡潔,先做「列表 + 新增」;停用/編輯可在後續 Phase 補上。
import { useEffect, useState } from "react";
import { ApiError } from "../api/client";
import { companiesApi, processItemsApi, productsApi } from "../api/resources";
import { Button, Card, ErrorBar, Field, Input, Select, Spinner } from "../components/ui";
import type { Company, ProcessItem, Product } from "../lib/types";

type Tab = "companies" | "products" | "process";

export default function MastersPage() {
  const [tab, setTab] = useState<Tab>("companies");

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-xl font-bold sm:text-2xl">主檔管理</h1>

      {/* 分頁切換:大按鈕,手機也好點 */}
      <div className="flex gap-2 overflow-x-auto">
        <TabBtn active={tab === "companies"} onClick={() => setTab("companies")}>公司</TabBtn>
        <TabBtn active={tab === "products"} onClick={() => setTab("products")}>品名</TabBtn>
        <TabBtn active={tab === "process"} onClick={() => setTab("process")}>加工項目</TabBtn>
      </div>

      {tab === "companies" && <CompaniesPanel />}
      {tab === "products" && <ProductsPanel />}
      {tab === "process" && <ProcessPanel />}
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

function CompaniesPanel() {
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

function ProductsPanel() {
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

function ProcessPanel() {
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
