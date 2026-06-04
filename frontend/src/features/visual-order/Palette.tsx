// 視覺化建單的側欄元件庫:分類 + 可展開,拖出「已填好值」的節點。
// - 廠商/接收:列實際公司
// - 品名/加工:列主檔實際值
// - 規格/數量/單位:沒有主檔 → 提供常用值與「自訂」空白節點
// - 最近使用組合:整排五欄一次拖出
import { useState } from "react";
import type { Company, ProcessItem, Product, Spec } from "../../lib/types";
import type { DragPayload } from "./context";
import type { Combo } from "./recentCombos";

interface Props {
  vendors: Company[];
  receivers: Company[];
  products: Product[];
  processItems: ProcessItem[];
  specs: Spec[];
  recent: Combo[];
  startDrag: (payload: DragPayload) => (e: React.DragEvent) => void;
  onCollapse: () => void;
}

const COMMON_UNITS = ["K", "KG", "件", "支", "箱"];

// 可拖曳的小晶片
function Chip({
  label,
  onDragStart,
  accent = false,
}: {
  label: string;
  onDragStart: (e: React.DragEvent) => void;
  accent?: boolean;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      title="拖到畫布加入"
      className={`cursor-grab select-none truncate rounded-lg border px-2.5 py-1.5 text-sm font-medium shadow-sm active:cursor-grabbing ${
        accent ? "border-brand/40 bg-brand/5 text-brand" : "border-slate-300 bg-white hover:border-brand"
      }`}
    >
      {label}
    </div>
  );
}

// 可展開的分類區塊
function Section({
  title,
  count,
  defaultOpen = false,
  children,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-slate-100 pb-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between py-2 text-left text-sm font-semibold text-slate-600"
      >
        <span>
          {title}
          {count !== undefined && <span className="ml-1 text-xs text-slate-400">({count})</span>}
        </span>
        <span className="text-slate-400">{open ? "▾" : "▸"}</span>
      </button>
      {open && <div className="flex flex-wrap gap-1.5 pb-1">{children}</div>}
    </div>
  );
}

export default function Palette({
  vendors, receivers, products, processItems, specs, recent, startDrag, onCollapse,
}: Props) {
  return (
    <div className="flex h-full flex-col">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-bold text-slate-700">元件庫</span>
        <button
          onClick={onCollapse}
          title="收合側欄"
          className="rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
        >
          ⟨ 收合
        </button>
      </div>

      <div className="-mr-1 flex-1 overflow-y-auto pr-1">
        <Section title="廠商單位" count={vendors.length} defaultOpen>
          {vendors.map((c) => (
            <Chip key={c.id} label={c.name} onDragStart={startDrag({ kind: "company", role: "vendor", companyId: String(c.id) })} />
          ))}
          <Chip label="＋ 自訂" onDragStart={startDrag({ kind: "company", role: "vendor" })} accent />
        </Section>

        <Section title="接收單位" count={receivers.length}>
          {receivers.map((c) => (
            <Chip key={c.id} label={c.name} onDragStart={startDrag({ kind: "company", role: "receiver", companyId: String(c.id) })} />
          ))}
          <Chip label="＋ 自訂" onDragStart={startDrag({ kind: "company", role: "receiver" })} accent />
        </Section>

        <Section title="品名" count={products.length} defaultOpen>
          {products.map((p) => (
            <Chip key={p.id} label={p.name} onDragStart={startDrag({ kind: "field", field: "品名", value: p.name })} />
          ))}
          <Chip label="＋ 自訂品名" onDragStart={startDrag({ kind: "field", field: "品名" })} accent />
        </Section>

        <Section title="加工項目" count={processItems.length}>
          {processItems.map((p) => (
            <Chip key={p.id} label={p.name} onDragStart={startDrag({ kind: "field", field: "加工", value: p.name })} />
          ))}
          <Chip label="＋ 自訂" onDragStart={startDrag({ kind: "field", field: "加工" })} accent />
        </Section>

        <Section title="規格" count={specs.length}>
          {specs.map((s) => (
            <Chip key={s.id} label={s.name} onDragStart={startDrag({ kind: "field", field: "規格", value: s.name })} />
          ))}
          <Chip label="＋ 自訂" onDragStart={startDrag({ kind: "field", field: "規格" })} accent />
        </Section>

        <Section title="數量">
          <Chip label="＋ 數量(可填數字)" onDragStart={startDrag({ kind: "field", field: "數量" })} accent />
        </Section>

        <Section title="單位">
          {COMMON_UNITS.map((u) => (
            <Chip key={u} label={u} onDragStart={startDrag({ kind: "field", field: "單位", value: u })} />
          ))}
          <Chip label="＋ 自訂" onDragStart={startDrag({ kind: "field", field: "單位" })} accent />
        </Section>

        <Section title="整排" defaultOpen>
          <Chip label="＋ 空白排(五欄)" onDragStart={startDrag({ kind: "row" })} accent />
        </Section>

        <Section title="最近使用組合" count={recent.length} defaultOpen>
          {recent.length === 0 ? (
            <p className="text-xs text-slate-400">建單後會記住常用組合</p>
          ) : (
            recent.map((c, i) => (
              <Chip
                key={i}
                label={`${c.product_name}${c.spec ? "·" + c.spec : ""}${c.process_item ? "·" + c.process_item : ""}`}
                onDragStart={startDrag({ kind: "combo", combo: c })}
              />
            ))
          )}
        </Section>
      </div>
    </div>
  );
}
