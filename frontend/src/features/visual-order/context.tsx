// 視覺化建單(欄位節點版)的共享狀態 context。
import { createContext, useContext } from "react";
import type { Company, ProcessItem, Product } from "../../lib/types";
import type { Combo } from "./recentCombos";

// 欄位節點的種類
export type FieldKind = "品名" | "規格" | "加工" | "數量" | "單位";
export const FIELD_KINDS: FieldKind[] = ["品名", "規格", "加工", "數量", "單位"];

// 側欄拖曳到畫布時帶的內容(可含預填值)
export type DragPayload =
  | { kind: "company"; role: "vendor" | "receiver"; companyId?: string }
  | { kind: "field"; field: FieldKind; value?: string }
  | { kind: "row" }
  | { kind: "combo"; combo: Combo };

// 各節點 data 形狀
export interface FieldNodeData {
  field: FieldKind;
  value: string;
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
}

export interface VisualOrderCtx {
  products: Product[];
  processItems: ProcessItem[];
  vendors: Company[];
  receivers: Company[];
  rows: ReconstructedRow[]; // 即時還原的排
  totalQty: number;         // 合計數量(視覺建單不含單價)
  updateNode: (id: string, patch: Record<string, unknown>) => void;
  removeNode: (id: string) => void;
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
