// 右下角浮動聊天機器人。
// - 只在平板 / 電腦顯示(手機隱藏:hidden md:flex)。
// - 只有「目前登入者被允許使用」時才出現(後端 /chat/config 決定)。
// - 點圓圈才展開對話視窗。對話 id 每次開啟頁面產生一個(供後端記憶該對話)。
import { useEffect, useRef, useState } from "react";
import { ApiError } from "../api/client";
import { chatApi, type ChatResult } from "../api/resources";

interface Msg { role: "user" | "bot"; text: string; result?: ChatResult["result"] }

export default function ChatWidget() {
  const [allowed, setAllowed] = useState(false);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "bot", text: "你好,我可以幫你查詢訂單、廠商、品名等資料。請直接用中文說明你想查什麼。" },
  ]);
  const convId = useRef<string>(
    (globalThis.crypto?.randomUUID?.() ?? `c-${Date.now()}-${Math.floor(Math.random() * 1e6)}`),
  );
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatApi.config().then((c) => setAllowed(c.allowed)).catch(() => setAllowed(false));
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [msgs, open, busy]);

  if (!allowed) return null;

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", text }]);
    setBusy(true);
    try {
      const res = await chatApi.send(text, convId.current);
      setMsgs((m) => [...m, { role: "bot", text: res.answer, result: res.result }]);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "發生問題,請稍後再試";
      setMsgs((m) => [...m, { role: "bot", text: msg }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* 對話視窗 */}
      {open && (
        <div className="fixed bottom-36 right-4 z-40 hidden w-[360px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl md:flex lg:bottom-24"
          style={{ height: "min(70vh, 540px)" }}>
          <div className="flex items-center justify-between bg-brand px-4 py-3 text-white">
            <span className="flex items-center gap-2 font-semibold"><RobotIcon /> 資料查詢助理</span>
            <button onClick={() => setOpen(false)} className="rounded p-1 hover:bg-white/20" aria-label="關閉">✕</button>
          </div>
          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-3">
            {msgs.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                  m.role === "user" ? "bg-brand text-white" : "border border-slate-200 bg-white text-slate-700"
                }`}>
                  {m.text}
                  {m.result && m.result.rows.length > 0 && <ResultTable result={m.result} />}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start">
                <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-400">查詢中…</div>
              </div>
            )}
          </div>
          <div className="flex items-end gap-2 border-t border-slate-200 p-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              rows={1}
              placeholder="輸入問題,Enter 送出…"
              className="max-h-28 min-h-[40px] flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand"
            />
            <button
              onClick={send}
              disabled={busy || !input.trim()}
              className="shrink-0 rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              送出
            </button>
          </div>
        </div>
      )}

      {/* 浮動圓圈按鈕(手機隱藏) */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="開啟資料查詢助理"
        className="fixed bottom-20 right-4 z-40 hidden h-14 w-14 items-center justify-center rounded-full bg-brand text-white shadow-lg transition hover:scale-105 md:flex lg:bottom-6"
      >
        {open ? <span className="text-xl">✕</span> : <RobotIcon big />}
      </button>
    </>
  );
}

function ResultTable({ result }: { result: NonNullable<ChatResult["result"]> }) {
  return (
    <div className="mt-2 max-h-48 overflow-auto rounded-lg border border-slate-200">
      <table className="w-full text-left text-xs">
        <thead className="bg-slate-100 text-slate-500">
          <tr>{result.columns.map((c) => <th key={c} className="px-2 py-1 font-medium">{c}</th>)}</tr>
        </thead>
        <tbody>
          {result.rows.slice(0, 20).map((row, i) => (
            <tr key={i} className="border-t border-slate-100">
              {row.map((cell, j) => <td key={j} className="px-2 py-1">{cell === null ? "" : String(cell)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RobotIcon({ big = false }: { big?: boolean }) {
  const s = big ? 26 : 18;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="8" width="16" height="11" rx="2" />
      <path d="M12 8V4M12 4h-1.5M12 4h1.5" />
      <circle cx="9" cy="13" r="1" fill="currentColor" />
      <circle cx="15" cy="13" r="1" fill="currentColor" />
      <path d="M2 13v2M22 13v2" />
    </svg>
  );
}
