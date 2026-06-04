// 品項節點:畫布上一張可填寫的品項小卡。
// 右側有一個 source handle,用來拉線連到「訂單」節點。
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { lineAmount, money } from "../../lib/format";
import { useVisualOrder, type ItemNodeData } from "./context";

export default function ItemNode({ id, data }: NodeProps) {
  const d = data as ItemNodeData;
  const { processItems, updateItem, removeItem } = useVisualOrder();
  const amt = lineAmount(Number(d.quantity), Number(d.unit_price));

  const inputCls =
    "w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-brand";

  // nodrag:讓欄位可以正常點擊輸入,而不會被 React Flow 當成拖曳節點
  return (
    <div className="w-60 rounded-xl border-2 border-slate-200 bg-white p-3 shadow-md">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-bold text-brand">品項</span>
        <button
          className="nodrag text-xs text-red-500 hover:underline"
          onClick={() => removeItem(id)}
        >
          刪除
        </button>
      </div>

      <div className="space-y-1.5">
        <input
          className={`nodrag ${inputCls}`}
          list="vo-product-options"
          placeholder="品名 *"
          value={d.product_name}
          onChange={(e) => updateItem(id, { product_name: e.target.value })}
        />
        <input
          className={`nodrag ${inputCls}`}
          placeholder="規格"
          value={d.spec}
          onChange={(e) => updateItem(id, { spec: e.target.value })}
        />
        <select
          className={`nodrag ${inputCls}`}
          value={d.process_item}
          onChange={(e) => updateItem(id, { process_item: e.target.value })}
        >
          <option value="">加工項目—</option>
          {processItems.map((p) => (
            <option key={p.id} value={p.name}>{p.name}</option>
          ))}
        </select>
        <div className="flex gap-1.5">
          <input
            className={`nodrag ${inputCls}`}
            type="number"
            inputMode="decimal"
            placeholder="數量 *"
            value={d.quantity}
            onChange={(e) => updateItem(id, { quantity: e.target.value })}
          />
          <input
            className={`nodrag ${inputCls} w-16`}
            placeholder="單位"
            value={d.unit}
            onChange={(e) => updateItem(id, { unit: e.target.value })}
          />
        </div>
        <input
          className={`nodrag ${inputCls}`}
          type="number"
          inputMode="decimal"
          placeholder="單價"
          value={d.unit_price}
          onChange={(e) => updateItem(id, { unit_price: e.target.value })}
        />
        <div className="rounded-lg bg-slate-50 px-2 py-1 text-right text-sm font-semibold">
          {money(amt)}
        </div>
      </div>

      {/* 右側輸出:拉到訂單節點(品名 datalist 由頁面統一提供) */}
      <Handle type="source" position={Position.Right} className="!h-3 !w-3 !bg-brand" />
    </div>
  );
}
