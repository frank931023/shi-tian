import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { ApiError } from "../api/client";
import { Button, Card, ErrorBar, Field, Input } from "../components/ui";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(username, password);
      navigate("/orders");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "登入失敗,請稍後再試");
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
