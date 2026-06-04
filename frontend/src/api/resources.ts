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
  create: (body: { name: string }) => api<Spec>("/specs", { method: "POST", body }),
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
  create: (body: OrderInput) => api<Order>("/orders", { method: "POST", body }),
  update: (id: number, body: OrderInput) =>
    api<Order>(`/orders/${id}`, { method: "PUT", body }),
  remove: (id: number) => api<{ deleted: number }>(`/orders/${id}`, { method: "DELETE" }),
};
