// 欄位節點:品名 / 規格 / 加工 / 數量 / 單位 各一種。
// 左側 target、右側 source:可串成一排(品名→規格→…),也可連到訂單。
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useVisualOrder, type FieldNodeData } from "./context";

// 每種欄位的外觀(顏色 + 提示)
const STYLE: Record<string, { color: string; placeholder: string }> = {
  品名: { color: "border-blue-400", placeholder: "品名,例:HBS" },
  規格: { color: "border-violet-400", placeholder: "規格,例:1/2-H17" },
  加工: { color: "border-pink-400", placeholder: "加工項目" },
  數量: { color: "border-teal-400", placeholder: "數量" },
  單位: { color: "border-slate-400", placeholder: "單位,例:K" },
};

export default function FieldNode({ id, data }: NodeProps) {
  const d = data as FieldNodeData;
  const { processItems, updateNode, removeNode } = useVisualOrder();
  const s = STYLE[d.field];
  const inputCls =
    "nodrag w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-brand";

  return (
    <div className={`w-44 rounded-xl border-2 ${s.color} bg-white p-2.5 shadow-md`}>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-bold text-slate-600">{d.field}</span>
        <button className="nodrag text-xs text-red-500 hover:underline" onClick={() => removeNode(id)}>
          ✕
        </button>
      </div>

      {d.field === "加工" ? (
        <select className={inputCls} value={d.value} onChange={(e) => updateNode(id, { value: e.target.value })}>
          <option value="">—</option>
          {processItems.map((p) => (
            <option key={p.id} value={p.name}>{p.name}</option>
          ))}
        </select>
      ) : d.field === "數量" ? (
        <input
          className={inputCls}
          type="number"
          inputMode="decimal"
          placeholder={s.placeholder}
          value={d.value}
          onChange={(e) => updateNode(id, { value: e.target.value })}
        />
      ) : (
        <input
          className={inputCls}
          list={d.field === "品名" ? "vo-product-options" : undefined}
          placeholder={s.placeholder}
          value={d.value}
          onChange={(e) => updateNode(id, { value: e.target.value })}
        />
      )}

      <Handle type="target" position={Position.Left} className="!h-4 !w-4 !border-2 !border-white !bg-slate-400" />
      <Handle type="source" position={Position.Right} className="!h-4 !w-4 !border-2 !border-white !bg-brand" />
    </div>
  );
}
