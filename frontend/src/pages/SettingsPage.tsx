// 設定頁:目前提供深色/淺色模式切換(其他設定日後擴充)。
import { Card } from "../components/ui";
import { useAuth } from "../lib/AuthContext";
import { useTheme } from "../lib/ThemeContext";

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { user } = useAuth();

  const opt = (value: "light" | "dark", label: string, icon: string) => (
    <button
      onClick={() => setTheme(value)}
      className={`flex flex-1 flex-col items-center gap-2 rounded-2xl border-2 p-6 transition ${
        theme === value ? "border-brand bg-brand/5" : "border-slate-200 hover:border-slate-300 dark:border-slate-700"
      }`}
    >
      <span className="text-4xl">{icon}</span>
      <span className="font-medium">{label}</span>
      {theme === value && <span className="text-sm text-brand">使用中</span>}
    </button>
  );

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-bold sm:text-2xl">設定</h1>

      <Card className="space-y-3">
        <h2 className="font-bold">外觀</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">選擇介面的明暗主題(會記住你的選擇)。</p>
        <div className="flex gap-3">
          {opt("light", "淺色", "☀️")}
          {opt("dark", "深色", "🌙")}
        </div>
      </Card>

      <Card className="space-y-2">
        <h2 className="font-bold">帳號</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          目前登入:{user?.display_name}({user?.role === "admin" ? "管理員" : "操作員"})
        </p>
        <p className="text-sm text-slate-400">使用者管理(新增/停用/重設密碼)將於後續版本提供。</p>
      </Card>
    </div>
  );
}
