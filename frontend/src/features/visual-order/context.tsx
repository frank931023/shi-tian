// 視覺化建單的共享狀態 context。
// 讓畫布上的自訂節點(品項節點、訂單節點)能存取主檔下拉、更新自己的欄位、
// 讀取總額、送出訂單 —— 不必把一堆 callback 塞進每個節點的 data。
import { createContext, useContext } from "react";
import type { Company, ProcessItem, Product } from "../../lib/types";

// 品項節點自身的欄位(存在 node.data)
export interface ItemNodeData {
  product_name: string;
  spec: string;
  process_item: string;
  quantity: string;
  unit: string;
  unit_price: string;
  [key: string]: unknown; // React Flow 的 data 需可索引
}

export const emptyItemData = (): ItemNodeData => ({
  product_name: "",
  spec: "",
  process_item: "",
  quantity: "",
  unit: "",
  unit_price: "",
});

export interface VisualOrderCtx {
  products: Product[];
  processItems: ProcessItem[];
  vendors: Company[];
  receivers: Company[];
  vendorId: string;
  receiverId: string;
  setVendorId: (v: string) => void;
  setReceiverId: (v: string) => void;
  total: number;
  connectedCount: number;
  updateItem: (id: string, patch: Partial<ItemNodeData>) => void;
  removeItem: (id: string) => void;
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
