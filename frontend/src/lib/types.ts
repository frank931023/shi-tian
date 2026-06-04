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
  role_type: "vendor" | "receiver" | "both";
  phone?: string | null;
  address?: string | null;
  note?: string | null;
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
