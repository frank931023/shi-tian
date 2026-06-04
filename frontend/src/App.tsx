import { useEffect, useState } from "react";
import { getHealth } from "./api/client";

// Phase 0 的 Hello 頁:
// 1. 展示 RWD —— 版面在手機/平板/筆電會自動調整(見下方 className 的 sm/md/lg 斷點)。
// 2. 實際呼叫後端 /api/health,驗證「瀏覽器 → (proxy/Caddy) → 後端」這條路是通的。
export default function App() {
  // 後端連線狀態:loading / ok / error
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    getHealth()
      .then((r) => setStatus(r.status === "ok" ? "ok" : "error"))
      .catch(() => setStatus("error"));
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6">
      {/* 卡片:手機滿版、平板以上限制寬度並置中 */}
      <main className="w-full max-w-md md:max-w-2xl rounded-2xl bg-white p-6 sm:p-10 shadow-md">
        <p className="text-sm font-medium uppercase tracking-wide text-brand">
          旭田 · 單據數位化系統
        </p>

        {/* 標題字級隨螢幕放大:手機 2xl、平板 3xl、筆電 4xl */}
        <h1 className="mt-2 text-2xl sm:text-3xl lg:text-4xl font-bold">
          Phase 0 — 骨架已啟動 🎉
        </h1>

        <p className="mt-4 leading-relaxed text-slate-600">
          這是可運行的空骨架。下面這顆狀態燈是前端實際呼叫後端
          <code className="mx-1 rounded bg-slate-100 px-1.5 py-0.5 text-sm">/api/health</code>
          得到的結果,用來確認整條請求鏈是通的。
        </p>

        {/* 後端連線狀態指示 */}
        <div className="mt-6 flex items-center gap-3 rounded-xl bg-slate-50 p-4">
          <span
            className={
              "inline-block h-4 w-4 rounded-full " +
              (status === "ok"
                ? "bg-green-500"
                : status === "error"
                ? "bg-red-500"
                : "bg-yellow-400 animate-pulse")
            }
          />
          <span className="font-medium">
            後端狀態:
            {status === "loading" && "檢查中…"}
            {status === "ok" && "連線正常(ok)"}
            {status === "error" && "連不到後端,請確認 backend 已啟動"}
          </span>
        </div>

        {/* 一顆示範用的大按鈕,展示觸控友善的點擊區 */}
        <button
          className="btn-primary mt-6 w-full sm:w-auto"
          onClick={() => window.location.reload()}
        >
          重新檢查連線
        </button>
      </main>

      <p className="mt-6 text-center text-sm text-slate-400">
        手機 / 平板 / 筆電 自適應 · 縮放瀏覽器寬度可見版面變化
      </p>
    </div>
  );
}
