// 設定頁(保留供日後擴充)。
// - 所有人:看自己的帳號資訊。
// - admin:使用者管理(列出所有帳號、新增、停用/啟用、重設密碼)。
//   ※ 依資安規範:密碼為 bcrypt 雜湊不可逆,只能「重設」不能檢視明碼。
import { useEffect, useState } from "react";
import { ApiError } from "../api/client";
import { usersApi } from "../api/resources";
import { Button, Card, ErrorBar, Field, Input, Select, Spinner } from "../components/ui";
import { useAuth } from "../lib/AuthContext";
import type { User } from "../lib/types";

export default function SettingsPage() {
  const { user } = useAuth();

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-xl font-bold sm:text-2xl">設定</h1>

      <Card className="space-y-1">
        <h2 className="font-bold">我的帳號</h2>
        <p className="text-sm text-slate-500">
          帳號 {user?.username}{user?.role === "admin" && " · 管理員"}
        </p>
      </Card>

      {user?.role === "admin" && <UsersPanel meId={user.id} />}
    </div>
  );
}

function UsersPanel({ meId }: { meId: number }) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 新增表單
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"admin" | "operator">("operator");
  const [password, setPassword] = useState("");

  function reload() {
    setLoading(true);
    usersApi.list().then(setUsers).catch((e) => setError(e instanceof ApiError ? e.message : "載入失敗")).finally(() => setLoading(false));
  }
  useEffect(reload, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await usersApi.create({ username, display_name: displayName || undefined, role, password });
      setUsername(""); setDisplayName(""); setRole("operator"); setPassword("");
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "新增失敗");
    }
  }

  async function toggleActive(u: User) {
    try {
      await usersApi.update(u.id, { is_active: !u.is_active });
      reload();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "操作失敗");
    }
  }

  async function resetPassword(u: User) {
    const pw = prompt(`為「${u.username}」設定新密碼(至少 4 碼):`);
    if (!pw) return;
    try {
      await usersApi.update(u.id, { password: pw });
      alert("已重設密碼");
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "重設失敗");
    }
  }

  async function changeRole(u: User, newRole: "admin" | "operator") {
    try {
      await usersApi.update(u.id, { role: newRole });
      reload();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "操作失敗");
    }
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <h2 className="font-bold">使用者管理</h2>
        <p className="text-sm text-slate-500">
          可看到所有帳號與權限。基於資安,密碼經 bcrypt 雜湊不可檢視,只能「重設」成新密碼。
        </p>
        <form onSubmit={add} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="帳號" required><Input value={username} onChange={(e) => setUsername(e.target.value)} required /></Field>
          <Field label="顯示名稱"><Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></Field>
          <Field label="角色">
            <Select value={role} onChange={(e) => setRole(e.target.value as "admin" | "operator")}>
              <option value="operator">操作員</option>
              <option value="admin">管理員</option>
            </Select>
          </Field>
          <Field label="密碼" required><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
          <div className="sm:col-span-2 lg:col-span-4">
            <Button type="submit">新增使用者</Button>
          </div>
        </form>
        <ErrorBar message={error} />
      </Card>

      <Card>
        {loading ? <Spinner /> : (
          <ul className="divide-y divide-slate-100">
            {users.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <p className="font-medium">
                    {u.username}
                    {u.id === meId && <span className="ml-2 text-xs text-brand">(你)</span>}
                    {!u.is_active && <span className="ml-2 text-xs text-red-500">已停用</span>}
                  </p>
                  <p className="text-sm text-slate-500">{u.display_name} · {u.role === "admin" ? "管理員" : "操作員"}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {u.id !== meId && (
                    <button
                      className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
                      onClick={() => changeRole(u, u.role === "admin" ? "operator" : "admin")}
                    >
                      改為{u.role === "admin" ? "操作員" : "管理員"}
                    </button>
                  )}
                  <button className="rounded-lg px-3 py-1.5 text-sm text-brand hover:bg-blue-50" onClick={() => resetPassword(u)}>重設密碼</button>
                  {u.id !== meId && (
                    <button
                      className={`rounded-lg px-3 py-1.5 text-sm ${u.is_active ? "text-red-600 hover:bg-red-50" : "text-green-600 hover:bg-green-50"}`}
                      onClick={() => toggleActive(u)}
                    >
                      {u.is_active ? "停用" : "啟用"}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
