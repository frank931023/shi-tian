// 與後端對應的型別定義(集中一處,方便維護)。

export type Role = "admin" | "operator";

export interface User {
  id: number;
  username: string;
  display_name: string | null;
  role: Role;
  is_active: boolean;
}

export interface Company {
  id: number;
  name: string;
  abbr?: string | null; // 縮寫(預設等於名稱;銷貨統計表顯示用)
  role_type: "vendor" | "receiver"; // 廠商與接收完全分開,無「兩者」
  phone?: string | null;
  fax?: string | null;
  address?: string | null;
  note?: string | null;
  // 完整原始資料(廠商:含多位聯絡人 contact[];接收:加工方式等),供點入查看
  detail?: Record<string, unknown> | null;
  is_active: boolean;
}

export interface Product {
  id: number;
  name: string;
  default_unit?: string | null;
  note?: string | null;
  is_active: boolean;
}

export interface ProcessItem {
  id: number;
  name: string;
  note?: string | null;
  is_active: boolean;
}

export interface Spec {
  id: number;
  name: string;
  kind?: "規格1" | "規格2" | null; // 規格分兩類;null=舊資料,兩類皆可用
  group_index?: number | null;      // 規格1↔規格2 的可搭配組合(同組才能配)
  is_active: boolean;
}

export interface OrderItem {
  id?: number;
  sort_order?: number;
  product_name: string;
  product_id?: number | null;
  spec?: string | null;
  process_item?: string | null;
  net_weight_kg?: number | null;
  quantity: number;
  unit?: string | null;
  unit_price?: number | null;
  amount?: number; // 後端回傳;前端只顯示
  remark?: string | null;
}

export type OrderStatus = "draft" | "confirmed" | "printed" | "void";

export interface Order {
  id: number;
  order_no: string;
  vendor_id?: number | null;
  vendor_name?: string | null;
  receiver_id?: number | null;
  receiver_name?: string | null;
  receiver_abbr?: string | null; // 接收單位縮寫(銷貨統計顯示用)
  order_date: string; // YYYY-MM-DD
  status: OrderStatus;
  total_amount: number;
  note?: string | null;
  created_at?: string;
  items?: OrderItem[];
}

export interface Paginated<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
}
