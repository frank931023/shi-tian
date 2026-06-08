// 各資源的 API 呼叫封裝(薄薄一層,語意清楚)。
import { api } from "./client";
import type {
  Company,
  Order,
  OrderItem,
  Paginated,
  ProcessItem,
  Product,
  Spec,
  User,
} from "../lib/types";

// ---- 認證 ----
export const authApi = {
  login: (username: string, password: string) =>
    api<{ user: User; csrf: string }>("/auth/login", {
      method: "POST",
      body: { username, password },
    }),
  logout: () => api("/auth/logout", { method: "POST" }),
  me: () => api<User | null>("/auth/me"),
};

// ---- 主檔 ----
export const companiesApi = {
  list: (role?: "vendor" | "receiver") =>
    api<Company[]>("/companies", { params: { role } }),
  create: (body: Partial<Company>) =>
    api<Company>("/companies", { method: "POST", body }),
  update: (id: number, body: Partial<Company>) =>
    api<Company>(`/companies/${id}`, { method: "PATCH", body }),
};

export const productsApi = {
  list: () => api<Product[]>("/products"),
  create: (body: Partial<Product>) =>
    api<Product>("/products", { method: "POST", body }),
};

export const processItemsApi = {
  list: () => api<ProcessItem[]>("/process-items"),
  create: (body: { name: string }) =>
    api<ProcessItem>("/process-items", { method: "POST", body }),
};

export const specsApi = {
  list: () => api<Spec[]>("/specs"),
  create: (body: { name: string; kind?: "規格1" | "規格2" | null }) =>
    api<Spec>("/specs", { method: "POST", body }),
};

// ---- 報表 ----
export interface ReportRange { from?: string; to?: string; }
export interface Summary {
  total_count: number;
  total_quantity: number;
  vendor_count: number;
  receiver_count: number;
  group_by: "week" | "month";
  series: { period: string; quantity: number }[];
}
export interface Share { name: string; quantity: number; count?: number; }

type Params = Record<string, string | number | undefined>;
export const reportsApi = {
  summary: (range: ReportRange & { group_by: "week" | "month" }) =>
    api<Summary>("/reports/summary", { params: range as unknown as Params }),
  byProduct: (range: ReportRange) => api<Share[]>("/reports/by-product", { params: range as unknown as Params }),
  byCompany: (range: ReportRange, role: "vendor" | "receiver" = "vendor") =>
    api<Share[]>("/reports/by-company", { params: { ...range, role } as unknown as Params }),
  byProcess: (range: ReportRange) => api<Share[]>("/reports/by-process", { params: range as unknown as Params }),
};

// ---- 訂單 ----
export interface OrderFilters {
  from?: string;
  to?: string;
  vendor_id?: number;
  product?: string;
  status?: string;
  q?: string;
  page?: number;
  page_size?: number;
}

export interface OrderInput {
  vendor_id?: number | null;
  receiver_id?: number | null;
  order_date: string;
  status?: string;
  note?: string | null;
  items: OrderItem[];
}

export const ordersApi = {
  list: (filters: OrderFilters) =>
    api<Paginated<Order>>("/orders", { params: filters as Record<string, string | number | undefined> }),
  get: (id: number) => api<Order>(`/orders/${id}`),
  // 銷貨統計表:依客戶 + 期間取含明細的訂單(不分頁)
  statement: (vendorId: number, range: { from?: string; to?: string }) =>
    api<Order[]>("/orders/statement", { params: { vendor_id: vendorId, ...range } }),
  create: (body: OrderInput) => api<Order>("/orders", { method: "POST", body }),
  update: (id: number, body: OrderInput) =>
    api<Order>(`/orders/${id}`, { method: "PUT", body }),
  remove: (id: number) => api<{ deleted: number }>(`/orders/${id}`, { method: "DELETE" }),
  // 匯出目前篩選結果(全部,不分頁)成 CSV / Excel;回傳下載 URL(GET 帶 cookie)
  exportUrl: (filters: OrderFilters, format: "csv" | "xlsx") => {
    const qs = new URLSearchParams();
    const keys: (keyof OrderFilters)[] = ["from", "to", "vendor_id", "product", "status", "q"];
    for (const k of keys) {
      const v = filters[k];
      if (v !== undefined && v !== null && v !== "") qs.append(k, String(v));
    }
    qs.append("format", format);
    return `/api/orders/export?${qs.toString()}`;
  },
  // PDF 預覽走瀏覽器直接開(GET 帶 cookie),這裡只提供 URL
  pdfUrl: (id: number) => `/api/orders/${id}/pdf`,
  dotmatrixPdfUrl: (id: number) => `/api/orders/${id}/dotmatrix-pdf`,
  print: (id: number, target: "normal" | "dotmatrix" = "normal") =>
    api<{ queue: string; job: string; status: string }>(`/orders/${id}/print`, {
      method: "POST",
      body: { target },
    }),
};

// ---- 使用者管理(admin)----
export interface UserUpdate {
  display_name?: string;
  role?: "admin" | "operator";
  is_active?: boolean;
  password?: string;
}
export const usersApi = {
  list: () => api<User[]>("/users"),
  create: (body: { username: string; display_name?: string; role: "admin" | "operator"; password: string }) =>
    api<User>("/users", { method: "POST", body }),
  update: (id: number, body: UserUpdate) =>
    api<User>(`/users/${id}`, { method: "PATCH", body }),
};

// ---- 點陣套表校正(Phase 7)----
export const printingApi = {
  calibrationUrl: () => "/api/print/calibration",
  getLayout: () => api<Record<string, unknown>>("/print/dotmatrix-layout"),
  saveLayout: (layout: Record<string, unknown>) =>
    api("/print/dotmatrix-layout", { method: "PUT", body: layout }),
};
