// 後端 API 的封裝起點。
// 全部走相對路徑 /api/...:
//   - 開發時由 Vite proxy 轉到 localhost:8000
//   - 正式時由 Caddy 反代到 backend:8000
// 前端程式因此不必知道後端真實位址,環境切換零改動。

export async function getHealth(): Promise<{ status: string }> {
  const res = await fetch("/api/health");
  if (!res.ok) throw new Error(`health 檢查失敗:HTTP ${res.status}`);
  return res.json();
}
