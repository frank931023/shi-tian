import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { ApiError } from "../api/client";
import { authApi } from "../api/resources";
import { Button, Card, ErrorBar, Field, Input } from "../components/ui";

// 把各種登入錯誤翻成好懂的中文原因
function loginErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 429) return "登入嘗試次數過多,請稍候約一分鐘再試。";
    if (err.status === 401 || err.code === "invalid_credentials") return "帳號或密碼錯誤。";
    if (err.code === "network") return "無法連線到伺服器,請檢查網路後再試。";
    // 其他非預期(500、CSRF 過期等)
    return "發生錯誤,請詢問管理員。";
  }
  // 不是 ApiError(多半是 fetch 直接失敗 = 連不到伺服器)
  return "無法連線到伺服器,請檢查網路後再試。";
}

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [noAdmin, setNoAdmin] = useState(false);
  const [busy, setBusy] = useState(false);

  // 載入時偵測系統是否還沒有管理員
  useEffect(() => {
    authApi.status().then((s) => setNoAdmin(!s.has_admin)).catch(() => {});
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(username, password);
      navigate("/orders");
    } catch (err) {
      setError(loginErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="text-lg font-bold text-brand">旭田興有限公司</p>
          <h1 className="mt-1 text-xl font-bold">移轉單系統登入</h1>
        </div>
        {noAdmin && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            系統尚未建立管理員,請先在後台建立帳號(<code>flask create-admin</code>)。
          </div>
        )}
        <form onSubmit={onSubmit} className="space-y-4">
          <ErrorBar message={error} />
          <Field label="帳號" required>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
            />
          </Field>
          <Field label="密碼" required>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </Field>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "登入中…" : "登入"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
