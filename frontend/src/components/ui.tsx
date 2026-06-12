// 可重用的小 UI 元件。全部以「大字、大點擊區、清楚對比」為基底(長輩友善),
// 並用 Tailwind 斷點確保手機/平板/筆電都好用。
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const variantClass: Record<Variant, string> = {
  primary: "bg-brand text-white hover:bg-brand-dark",
  secondary: "bg-white text-slate-800 border border-slate-300 hover:bg-slate-50",
  danger: "bg-red-600 text-white hover:bg-red-700",
  ghost: "bg-transparent text-slate-600 hover:bg-slate-100",
};

export function Button({
  variant = "primary",
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl px-5 text-base font-semibold shadow-sm transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${variantClass[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  required,
  children,
  hint,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

const inputBase =
  "w-full min-h-[48px] rounded-xl border border-slate-300 bg-white px-3 text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${inputBase} ${props.className ?? ""}`} {...props} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${inputBase} ${props.className ?? ""}`} {...props} />;
}

// 比對分數:完全包含 > 子序列(模糊);0=不符
function matchScore(text: string, q: string): number {
  const t = text.toLowerCase();
  if (t.includes(q)) return 1000 - t.indexOf(q); // 越前面分數越高
  let ti = 0;
  let qi = 0;
  while (ti < t.length && qi < q.length) {
    if (t[ti] === q[qi]) qi++;
    ti++;
  }
  return qi === q.length ? 1 : 0; // 子序列符合 → 弱相似
}

// 可輸入搜尋的下拉(打字找相似/包含的選項)。value/onChange 用「id 字串」。
export function Combobox({
  value,
  onChange,
  options,
  placeholder,
  allowClear = true,
  disabled = false,
}: {
  value: string;
  onChange: (id: string) => void;
  // group:下拉內的分組標題(如加工方式);keywords:額外可搜尋字串(讓打分組名也能篩到)
  options: { id: string | number; label: string; group?: string; keywords?: string }[];
  placeholder?: string;
  allowClear?: boolean;
  disabled?: boolean; // 連動式下拉:上層未選時鎖住
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => String(o.id) === value);
  const hasGroups = options.some((o) => o.group);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 300);
    return options
      .map((o) => ({ o, s: matchScore(`${o.label} ${o.keywords ?? ""}`, q) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 300)
      .map((x) => x.o);
  }, [query, options]);

  // 依 group 分組(保留出現順序,組名依繁中排序);無 group 時回單一無名分組
  const grouped = useMemo(() => {
    if (!hasGroups) return [["", filtered]] as [string, typeof filtered][];
    const map = new Map<string, typeof filtered>();
    for (const o of filtered) {
      const g = o.group || "其他";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(o);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], "zh-Hant"));
  }, [filtered, hasGroups]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const renderOption = (o: { id: string | number; label: string }) => (
    <li key={o.id}>
      <button
        type="button"
        className={`block w-full px-3 py-2 text-left text-sm hover:bg-brand/10 ${
          String(o.id) === value ? "bg-brand/5 font-medium" : ""
        }`}
        onMouseDown={(e) => { e.preventDefault(); onChange(String(o.id)); setOpen(false); }}
      >
        {o.label}
      </button>
    </li>
  );

  return (
    <div className="relative" ref={boxRef}>
      <input
        className={`${inputBase} ${disabled ? "cursor-not-allowed bg-slate-100 text-slate-400" : ""}`}
        value={open ? query : selected?.label ?? ""}
        placeholder={placeholder ?? "輸入關鍵字搜尋…"}
        disabled={disabled}
        onFocus={() => { if (!disabled) { setOpen(true); setQuery(""); } }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
      />
      {open && !disabled && (
        <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
          {allowClear && (
            <li>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm text-slate-400 hover:bg-slate-100"
                onMouseDown={(e) => { e.preventDefault(); onChange(""); setOpen(false); }}
              >
                — 清除 —
              </button>
            </li>
          )}
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-slate-400">找不到符合的</li>
          ) : hasGroups ? (
            grouped.map(([g, items]) => (
              <Fragment key={g}>
                <li className="sticky top-0 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">{g}</li>
                {items.map(renderOption)}
              </Fragment>
            ))
          ) : (
            filtered.map(renderOption)
          )}
        </ul>
      )}
    </div>
  );
}

// 階層(連動)選單:單一欄位,點開後左欄選分類、右欄跑出該分類的項目。
// 用於「接收單位」:左=加工方式、右=該方式的公司。
export function CascadeSelect({
  value,
  onChange,
  groups,
  placeholder = "請選擇…",
  allowClear = true,
}: {
  value: string;
  onChange: (id: string) => void;
  groups: { key: string; items: { id: string | number; label: string }[] }[];
  placeholder?: string;
  allowClear?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // 找出目前選的項目 label 與所屬分類
  let selectedLabel = "";
  let selectedGroup = "";
  for (const g of groups) {
    const it = g.items.find((i) => String(i.id) === value);
    if (it) { selectedLabel = it.label; selectedGroup = g.key; break; }
  }
  const [active, setActive] = useState(selectedGroup || groups[0]?.key || "");

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const activeItems = groups.find((g) => g.key === active)?.items ?? [];

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        className={`${inputBase} flex items-center justify-between text-left`}
        onClick={() => {
          if (open) { setOpen(false); return; }
          setActive(selectedGroup || groups[0]?.key || "");
          setOpen(true);
        }}
      >
        <span className={`truncate ${selectedLabel ? "" : "text-slate-400"}`}>{selectedLabel || placeholder}</span>
        <span className="ml-2 shrink-0 text-slate-400">▾</span>
      </button>
      {open && (
        <div className="nodrag nowheel absolute z-40 mt-1 flex w-[22rem] max-w-[85vw] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          {/* 左:分類(加工方式) */}
          <ul className="max-h-64 w-32 shrink-0 overflow-auto border-r border-slate-100 bg-slate-50/60">
            {groups.length === 0 ? (
              <li className="px-3 py-2 text-sm text-slate-400">無分類</li>
            ) : groups.map((g) => (
              <li key={g.key}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(g.key)}
                  onClick={() => setActive(g.key)}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${
                    active === g.key ? "bg-white font-medium text-brand" : "text-slate-600 hover:bg-white"
                  }`}
                >
                  <span className="truncate">{g.key}</span>
                  <span className="ml-1 shrink-0 text-xs text-slate-300">›</span>
                </button>
              </li>
            ))}
          </ul>
          {/* 右:該分類的項目(公司) */}
          <ul className="max-h-64 flex-1 overflow-auto">
            {allowClear && (
              <li>
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm text-slate-400 hover:bg-slate-100"
                  onClick={() => { onChange(""); setOpen(false); }}
                >
                  — 清除 —
                </button>
              </li>
            )}
            {activeItems.length === 0 ? (
              <li className="px-3 py-2 text-sm text-slate-400">此分類沒有項目</li>
            ) : activeItems.map((it) => (
              <li key={it.id}>
                <button
                  type="button"
                  onClick={() => { onChange(String(it.id)); setOpen(false); }}
                  className={`block w-full truncate px-3 py-2 text-left text-sm hover:bg-brand/10 ${
                    String(it.id) === value ? "bg-brand/5 font-medium" : ""
                  }`}
                >
                  {it.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`${inputBase} min-h-[80px] py-2 ${props.className ?? ""}`}
      {...props}
    />
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl bg-white p-4 shadow-sm sm:p-6 ${className}`}>{children}</div>
  );
}

export function Spinner({ label = "載入中…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 p-8 text-slate-500">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-brand" />
      {label}
    </div>
  );
}

const statusStyle: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  confirmed: "bg-blue-100 text-blue-700",
  printed: "bg-green-100 text-green-700",
  void: "bg-red-100 text-red-700",
};
const statusLabel: Record<string, string> = {
  draft: "草稿",
  confirmed: "已確認",
  printed: "已列印",
  void: "作廢",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-sm font-medium ${statusStyle[status] ?? "bg-slate-100"}`}>
      {statusLabel[status] ?? status}
    </span>
  );
}

// 簡單的錯誤訊息條
export function ErrorBar({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
      {message}
    </div>
  );
}

// 分頁器:第一頁 / 上一頁 / 下一頁 / 最後一頁 + 直接跳頁
export function Pager({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  const [jump, setJump] = useState("");
  if (totalPages <= 1) return null;
  const go = (p: number) => onChange(Math.min(totalPages, Math.max(1, p)));
  const submitJump = () => { if (jump) { go(Number(jump)); setJump(""); } };
  const btn = "inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-slate-300 px-2 text-sm hover:bg-slate-50 disabled:opacity-40";
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-sm">
      <button className={btn} onClick={() => go(1)} disabled={page <= 1} title="第一頁">«</button>
      <button className={btn} onClick={() => go(page - 1)} disabled={page <= 1} title="上一頁">‹</button>
      <span className="px-2 text-slate-600">第 <b>{page}</b> / {totalPages} 頁</span>
      <button className={btn} onClick={() => go(page + 1)} disabled={page >= totalPages} title="下一頁">›</button>
      <button className={btn} onClick={() => go(totalPages)} disabled={page >= totalPages} title="最後一頁">»</button>
      <span className="ml-2 text-slate-400">跳至</span>
      <input
        className="h-9 w-14 rounded-lg border border-slate-300 px-2 text-center text-sm"
        value={jump}
        inputMode="numeric"
        placeholder={String(page)}
        onChange={(e) => setJump(e.target.value.replace(/\D/g, ""))}
        onKeyDown={(e) => { if (e.key === "Enter") submitJump(); }}
      />
      <button className={btn} onClick={submitJump} disabled={!jump}>前往</button>
    </div>
  );
}

// 對話框(Modal):點背景或 ✕ 關閉
export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  // 開啟時鎖住背景捲動,關閉時還原
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="mt-3">{children}</div>
        {footer && <div className="mt-5 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}
