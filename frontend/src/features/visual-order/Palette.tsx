// 視覺化建單的側欄元件庫:分類 + 可展開。
// 桌機可「拖曳」到畫布;平板/觸控請改「點一下」加入畫布中央(HTML5 拖放不支援觸控)。
import { useState } from "react";
import type { Company, ProcessItem, Product, Spec } from "../../lib/types";
import { COMMON_UNITS, type DragPayload } from "./context";
import type { Combo } from "./recentCombos";

interface Props {
  vendors: Company[];
  receivers: Company[];
  products: Product[];
  processItems: ProcessItem[];
  specs: Spec[];
  recent: Combo[];
  startDrag: (payload: DragPayload) => (e: React.DragEvent) => void;
  onPick: (payload: DragPayload) => void; // 點擊加入(觸控用)
  onCollapse: () => void;
}

// 小晶片:可拖曳(桌機)或點擊(觸控)加入
function Chip({
  label, payload, startDrag, onPick, accent = false,
}: {
  label: string;
  payload: DragPayload;
  startDrag: (p: DragPayload) => (e: React.DragEvent) => void;
  onPick: (p: DragPayload) => void;
  accent?: boolean;
}) {
  return (
    <div
      draggable
      onDragStart={startDrag(payload)}
      onClick={() => onPick(payload)}
      role="button"
      title="拖曳或點擊加入"
      className={`cursor-pointer select-none truncate rounded-lg border px-2.5 py-1.5 text-sm font-medium shadow-sm active:scale-95 ${
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
  vendors, receivers, products, processItems, specs, recent, startDrag, onPick, onCollapse,
}: Props) {
  // 統一產生晶片(closure 帶 startDrag / onPick,呼叫端只給 key/label/payload)
  const item = (key: React.Key, label: string, payload: DragPayload, accent = false) => (
    <Chip key={key} label={label} payload={payload} startDrag={startDrag} onPick={onPick} accent={accent} />
  );

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
      <p className="mb-1 text-xs text-slate-400">桌機可拖曳;平板請「點一下」加入畫布</p>

      <div className="-mr-1 flex-1 overflow-y-auto pr-1">
        <Section title="廠商單位" count={vendors.length}>
          {vendors.map((c) => item(c.id, c.name, { kind: "company", role: "vendor", companyId: String(c.id) }))}
          {item("v-custom", "＋ 自訂", { kind: "company", role: "vendor" }, true)}
        </Section>

        <Section title="接收單位" count={receivers.length}>
          {receivers.map((c) => item(c.id, c.name, { kind: "company", role: "receiver", companyId: String(c.id) }))}
          {item("r-custom", "＋ 自訂", { kind: "company", role: "receiver" }, true)}
        </Section>

        <Section title="品名" count={products.length}>
          {products.map((p) => item(p.id, p.name, { kind: "field", field: "品名", value: p.name }))}
          {item("p-custom", "＋ 自訂品名", { kind: "field", field: "品名" }, true)}
        </Section>

        <Section title="加工項目" count={processItems.length}>
          {processItems.map((p) => item(p.id, p.name, { kind: "field", field: "加工", value: p.name }))}
          {item("proc-custom", "＋ 自訂", { kind: "field", field: "加工" }, true)}
        </Section>

        <Section title="規格1" count={specs.filter((s) => s.kind !== "規格2").length}>
          {specs.filter((s) => s.kind !== "規格2").map((s) => item(s.id, s.name, { kind: "field", field: "規格1", value: s.name }))}
          {item("s1-custom", "＋ 規格1(打字)", { kind: "field", field: "規格1", custom: true }, true)}
        </Section>

        <Section title="規格2" count={specs.filter((s) => s.kind !== "規格1").length}>
          {specs.filter((s) => s.kind !== "規格1").map((s) => item(`s2-${s.id}`, s.name, { kind: "field", field: "規格2", value: s.name }))}
          {item("s2-custom", "＋ 規格2(打字)", { kind: "field", field: "規格2", custom: true }, true)}
        </Section>

        <Section title="數量">
          {item("qty", "＋ 數量(可填數字)", { kind: "field", field: "數量" }, true)}
        </Section>

        <Section title="單位">
          {COMMON_UNITS.map((u) => item(u, u, { kind: "field", field: "單位", value: u }))}
          {item("unit-custom", "＋ 自訂(打字)", { kind: "field", field: "單位", custom: true }, true)}
        </Section>

        <Section title="備註">
          {item("remark", "＋ 備註(選填)", { kind: "field", field: "備註", custom: true }, true)}
        </Section>

        <Section title="整排">
          {item("row", "＋ 空白排(多欄)", { kind: "row" }, true)}
        </Section>

        <Section title="最近使用組合" count={recent.length}>
          {recent.length === 0 ? (
            <p className="text-xs text-slate-400">建單後會記住常用組合</p>
          ) : (
            recent.map((c, i) =>
              item(
                `combo-${i}`,
                `${c.product_name}${c.spec ? "·" + c.spec : ""}${c.process_item ? "·" + c.process_item : ""}`,
                { kind: "combo", combo: c },
              ),
            )
          )}
        </Section>
      </div>
    </div>
  );
}
