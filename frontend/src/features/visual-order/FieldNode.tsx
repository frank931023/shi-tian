// 欄位節點:品名 / 規格 / 加工 / 數量 / 單位 / 備註。
// 左側 target、右側 source:可串成一排,也可連到訂單。
// 規格/單位 預設用「下拉選單」(來自主檔/常用值);若是從側欄拖「自訂」出來則用文字輸入。
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { COMMON_UNITS, useVisualOrder, type FieldNodeData } from "./context";

const STYLE: Record<string, { color: string; placeholder: string }> = {
  品名: { color: "border-blue-400", placeholder: "品名,例:HBS" },
  規格1: { color: "border-violet-400", placeholder: "規格1,例:1/2" },
  規格2: { color: "border-violet-400", placeholder: "規格2,例:H17" },
  加工: { color: "border-pink-400", placeholder: "加工項目" },
  數量: { color: "border-teal-400", placeholder: "數量" },
  單位: { color: "border-slate-400", placeholder: "單位,例:K" },
  備註: { color: "border-amber-400", placeholder: "備註(選填)" },
};

export default function FieldNode({ id, data }: NodeProps) {
  const d = data as FieldNodeData;
  const { processItems, specs, updateNode, removeNode, suggestNext } = useVisualOrder();
  const s = STYLE[d.field];
  const inputCls =
    "nodrag w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-brand";

  // 下拉選單:空選項 + 主檔值 +(若目前值不在清單內也補上)
  function renderSelect(options: string[]) {
    const opts = options.includes(d.value) || !d.value ? options : [...options, d.value];
    return (
      <select className={inputCls} value={d.value} onChange={(e) => updateNode(id, { value: e.target.value })}>
        <option value="">—</option>
        {opts.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    );
  }

  function renderInput(type = "text") {
    return (
      <input
        className={inputCls}
        type={type}
        inputMode={type === "number" ? "decimal" : undefined}
        list={d.field === "品名" ? "vo-product-options" : undefined}
        placeholder={s.placeholder}
        value={d.value}
        onChange={(e) => updateNode(id, { value: e.target.value })}
      />
    );
  }

  let control;
  if (d.field === "加工") control = renderSelect(processItems.map((p) => p.name));
  else if (d.field === "規格1" || d.field === "規格2") control = d.custom ? renderInput() : renderSelect(specs.map((s2) => s2.name));
  else if (d.field === "單位") control = d.custom ? renderInput() : renderSelect(COMMON_UNITS);
  else if (d.field === "數量") control = renderInput("number");
  else control = renderInput(); // 品名 / 備註

  return (
    <div className={`relative w-44 rounded-xl border-2 ${s.color} bg-white p-2.5 shadow-md`}>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-bold text-slate-600">
          {d.field}{d.field === "備註" && <span className="ml-1 font-normal text-slate-400">選填</span>}
        </span>
        <button className="nodrag text-xs text-red-500 hover:underline" onClick={() => removeNode(id)}>
          ✕
        </button>
      </div>

      {control}

      <button
        className="nodrag absolute -right-3 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 translate-x-full items-center justify-center rounded-full border border-brand bg-white text-sm font-bold text-brand shadow hover:bg-brand hover:text-white"
        title="新增下一個欄位並連線"
        onClick={(e) => { e.stopPropagation(); suggestNext(id, e.clientX, e.clientY); }}
      >
        +
      </button>

      <Handle type="target" position={Position.Left} className="!h-4 !w-4 !border-2 !border-white !bg-slate-400" />
      <Handle type="source" position={Position.Right} className="!h-4 !w-4 !border-2 !border-white !bg-brand" />
    </div>
  );
}
