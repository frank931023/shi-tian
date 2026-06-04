// 響應式主版面:
// - 手機(預設):頂部精簡列 + 底部固定導覽(大圖示好點)。
// - 筆電(lg+):左側固定側邊欄導覽,內容區在右。
// 中間(平板)介於兩者:用底部導覽 + 較寬內容。
import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";

const HOME = "/orders"; // 點公司名稱回首頁

interface NavItem {
  to: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
}

const NAV: NavItem[] = [
  { to: "/orders/build", label: "建單", icon: "➕" },
  { to: "/orders", label: "訂單", icon: "📋" },
  { to: "/reports", label: "報表", icon: "📊" },
  { to: "/masters", label: "主檔", icon: "🗂️", adminOnly: true },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const items = NAV.filter((n) => !n.adminOnly || user?.role === "admin");

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-xl px-4 py-3 text-base font-medium transition ${
      collapsed ? "justify-center !px-0" : ""
    } ${isActive ? "bg-brand text-white" : "text-slate-700 hover:bg-slate-100"}`;

  // 底部導覽用的樣式(手機/平板)
  const bottomClass = ({ isActive }: { isActive: boolean }) =>
    `flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium ${
      isActive ? "text-brand" : "text-slate-500"
    }`;

  return (
    <div className="min-h-screen lg:flex">
      {/* 側邊欄(筆電,可收合成窄條) */}
      <aside className={`hidden shrink-0 border-r border-slate-200 bg-white p-3 lg:flex lg:flex-col ${collapsed ? "w-16" : "w-60"}`}>
        <div className="flex items-center justify-between px-1 py-2">
          {!collapsed ? (
            // 公司名稱:點擊回首頁
            <Link to={HOME} className="leading-tight hover:opacity-80" title="回首頁">
              <p className="text-lg font-bold text-brand">旭田興有限公司</p>
              <p className="text-xs text-slate-400">移轉單系統</p>
            </Link>
          ) : (
            <Link to={HOME} className="text-xl font-bold text-brand" title="旭田興有限公司 · 回首頁">旭</Link>
          )}
          <button
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? "展開側欄" : "收合側欄"}
            className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100"
          >
            {collapsed ? "»" : "«"}
          </button>
        </div>
        <nav className="mt-2 flex flex-col gap-1">
          {items.map((n) => (
            <NavLink key={n.to} to={n.to} className={linkClass} title={n.label}>
              <span className="text-xl">{n.icon}</span>
              {!collapsed && n.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto border-t border-slate-100 pt-3">
          {!collapsed && (
            <p className="px-2 text-sm text-slate-500">{user?.username}</p>
          )}
          <button
            onClick={() => logout().then(() => navigate("/login"))}
            title="登出"
            className={`mt-2 w-full rounded-xl px-4 py-2 text-base text-slate-600 hover:bg-slate-100 ${collapsed ? "text-center !px-0" : "text-left"}`}
          >
            {collapsed ? "⎋" : "登出"}
          </button>
        </div>
      </aside>

      {/* 主內容 */}
      <div className="flex flex-1 flex-col">
        {/* 頂部列(手機/平板顯示品牌與登出;筆電隱藏品牌) */}
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
          <Link to={HOME} className="text-lg font-bold text-brand">旭田興有限公司</Link>
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
