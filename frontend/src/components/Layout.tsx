// 響應式主版面:
// - 手機(預設):頂部精簡列 + 底部固定導覽(大圖示好點)。
// - 筆電(lg+):左側固定側邊欄導覽,內容區在右。
// 中間(平板)介於兩者:用底部導覽 + 較寬內容。
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";

interface NavItem {
  to: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
}

const NAV: NavItem[] = [
  { to: "/orders/new", label: "建單", icon: "➕" },
  { to: "/orders/visual", label: "視覺建單", icon: "🧩" },
  { to: "/orders", label: "訂單", icon: "📋" },
  { to: "/reports", label: "報表", icon: "📊" },
  { to: "/masters", label: "主檔", icon: "🗂️", adminOnly: true },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const items = NAV.filter((n) => !n.adminOnly || user?.role === "admin");

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-xl px-4 py-3 text-base font-medium transition ${
      isActive ? "bg-brand text-white" : "text-slate-700 hover:bg-slate-100"
    }`;

  // 底部導覽用的樣式(手機/平板)
  const bottomClass = ({ isActive }: { isActive: boolean }) =>
    `flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium ${
      isActive ? "text-brand" : "text-slate-500"
    }`;

  return (
    <div className="min-h-screen lg:flex">
      {/* 側邊欄(筆電) */}
      <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-white p-4 lg:flex lg:flex-col">
        <div className="px-2 py-3">
          <p className="text-sm font-medium text-brand">旭田</p>
          <p className="text-lg font-bold">移轉單系統</p>
        </div>
        <nav className="mt-2 flex flex-col gap-1">
          {items.map((n) => (
            <NavLink key={n.to} to={n.to} className={linkClass}>
              <span className="text-xl">{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto border-t border-slate-100 pt-3">
          <p className="px-2 text-sm text-slate-500">
            {user?.display_name}({user?.role === "admin" ? "管理員" : "操作員"})
          </p>
          <button
            onClick={() => logout().then(() => navigate("/login"))}
            className="mt-2 w-full rounded-xl px-4 py-2 text-left text-base text-slate-600 hover:bg-slate-100"
          >
            登出
          </button>
        </div>
      </aside>

      {/* 主內容 */}
      <div className="flex flex-1 flex-col">
        {/* 頂部列(手機/平板顯示品牌與登出;筆電隱藏品牌) */}
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
          <span className="text-lg font-bold text-brand">旭田 · 移轉單</span>
          <button
            onClick={() => logout().then(() => navigate("/login"))}
            className="rounded-lg px-3 py-2 text-base text-slate-600 hover:bg-slate-100"
          >
            登出
          </button>
        </header>

        {/* 內容:底部導覽在手機/平板存在,故留 padding-bottom */}
        <main className="flex-1 p-4 pb-24 sm:p-6 lg:pb-6">
          <Outlet />
        </main>
      </div>

      {/* 底部導覽(手機/平板) */}
      <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-slate-200 bg-white lg:hidden">
        {items.map((n) => (
          <NavLink key={n.to} to={n.to} className={bottomClass}>
            <span className="text-2xl">{n.icon}</span>
            {n.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
