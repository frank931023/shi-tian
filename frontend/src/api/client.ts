// 後端 API 的統一封裝。
//
// 設計重點:
// - 全部走相對路徑 /api/...:開發由 Vite proxy、正式由 Caddy 反代,前端零改動。
// - credentials: "include" → 帶上 session cookie。
// - 寫入方法(POST/PUT/DELETE)自動從 csrf_token cookie 讀出 token,塞進 X-CSRF-Token。
// - 解析後端統一格式 { data, error };error 不為 null 時丟出 ApiError。

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

// 讓未授權(401)能被上層攔截 → 導回登入頁
type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;
export function setUnauthorizedHandler(fn: UnauthorizedHandler) {
  onUnauthorized = fn;
}

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return match ? decodeURIComponent(match[2]) : null;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  // 查詢字串參數
  params?: Record<string, string | number | undefined | null>;
}

export async function api<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const method = opts.method ?? "GET";

  // 組查詢字串
  let url = `/api${path}`;
  if (opts.params) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(opts.params)) {
      if (v !== undefined && v !== null && v !== "") qs.append(k, String(v));
    }
    const s = qs.toString();
    if (s) url += `?${s}`;
  }

  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET") {
    const csrf = getCookie("csrf_token");
    if (csrf) headers["X-CSRF-Token"] = csrf;
  }

  const res = await fetch(url, {
    method,
    headers,
    credentials: "include",
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (res.status === 401 && onUnauthorized) onUnauthorized();

  // 後端統一回傳 { data, error }
  let json: { data: T; error: { code: string; message: string } | null };
  try {
    json = await res.json();
  } catch {
    throw new ApiError("network", `伺服器回應異常 (HTTP ${res.status})`, res.status);
  }

  if (json.error) {
    throw new ApiError(json.error.code, json.error.message, res.status);
  }
  return json.data;
}
