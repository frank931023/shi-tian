// 訂單匯總節點:畫布中央的 hub。左側接收所有「廠商/接收/排」的連線。
import { Handle, Position } from "@xyflow/react";
import { useVisualOrder } from "./context";

export default function OrderNode() {
  const { rows, totalQty, submit, busy } = useVisualOrder();

  return (
    <div className="w-56 rounded-2xl border-2 border-brand bg-white p-4 shadow-lg">
      <Handle type="target" position={Position.Left} className="!h-3.5 !w-3.5 !bg-brand" />
      <p className="text-center text-base font-bold text-brand">訂單</p>
      <div className="mt-3 rounded-xl bg-slate-50 p-3 text-center">
        <p className="text-2xl font-bold text-brand">{rows.length} 排</p>
        <p className="text-xs text-slate-500">合計數量 {totalQty}</p>
      </div>
      <button
        className="nodrag mt-3 w-full rounded-xl bg-brand px-4 py-2.5 font-semibold text-white shadow-sm transition hover:bg-brand-dark active:scale-[0.98] disabled:opacity-50"
        onClick={submit}
        disabled={busy || rows.length === 0}
      >
        {busy ? "建立中…" : "產生訂單"}
      </button>
    </div>
  );
}
