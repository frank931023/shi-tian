// 視覺化建單(欄位節點版)的共享狀態 context。
import { createContext, useContext } from "react";
import type { Company, ProcessItem, Product, Spec } from "../../lib/types";
import type { Combo } from "./recentCombos";

// 欄位節點的種類(規格分成規格1/規格2 兩欄輸入,送出時合併成單一 spec)
export type FieldKind = "品名" | "規格1" | "規格2" | "加工" | "數量" | "單位" | "備註";
// 一「排」預設的欄位(備註是選配,不在預設排內)
export const FIELD_KINDS: FieldKind[] = ["品名", "規格1", "規格2", "加工", "數量", "單位"];
// 可從「+」新增的欄位(含選配的備註)
export const ADDABLE_KINDS: FieldKind[] = ["品名", "規格1", "規格2", "加工", "數量", "單位", "備註"];
// 常用單位(下拉用)
export const COMMON_UNITS = ["K", "KG", "件", "支", "箱"];

// 側欄拖曳到畫布時帶的內容(可含預填值;custom=true 代表自訂文字節點)
export type DragPayload =
  | { kind: "company"; role: "vendor" | "receiver"; companyId?: string }
  | { kind: "field"; field: FieldKind; value?: string; custom?: boolean }
  | { kind: "row" }
  | { kind: "combo"; combo: Combo };

// 各節點 data 形狀
export interface FieldNodeData {
  field: FieldKind;
  value: string;
  custom?: boolean; // true=自訂文字輸入;否則規格/單位用下拉
  [k: string]: unknown;
}
export interface CompanyNodeData {
  role: "vendor" | "receiver";
  companyId: string;
  [k: string]: unknown;
}

// 還原後的一排(給預覽/送出用)
export interface ReconstructedRow {
  product_name: string;
  spec: string;
  process_item: string;
  quantity: string;
  unit: string;
  remark: string;
}

export interface VisualOrderCtx {
  products: Product[];
  processItems: ProcessItem[];
  specs: Spec[];
  vendors: Company[];
  receivers: Company[];
  rows: ReconstructedRow[]; // 即時還原的排
  totalQty: number;         // 合計數量(視覺建單不含單價)
  orderDate: string;        // 訂單日期(YYYY-MM-DD)
  setOrderDate: (v: string) => void;
  updateNode: (id: string, patch: Record<string, unknown>) => void;
  removeNode: (id: string) => void;
  // 點節點上的「+」:在該節點旁建議並建立下一個欄位節點
  suggestNext: (id: string, x: number, y: number) => void;
  submit: () => void;
  busy: boolean;
}

const Ctx = createContext<VisualOrderCtx | null>(null);
export const VisualOrderProvider = Ctx.Provider;

export function useVisualOrder(): VisualOrderCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useVisualOrder 必須在 VisualOrderProvider 內使用");
  return v;
}
