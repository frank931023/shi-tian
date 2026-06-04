// 訂單節點:畫布中央的匯總卡。
// 左側 target handle 接收品項節點的連線;顯示廠商/接收/已連品項數/總額,並可送出。
import { Handle, Position } from "@xyflow/react";
import { money } from "../../lib/format";
import { useVisualOrder } from "./context";

export default function OrderNode() {
  const {
    vendors, receivers, vendorId, receiverId, setVendorId, setReceiverId,
    total, connectedCount, submit, busy,
  } = useVisualOrder();

  const selectCls =
    "nodrag w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-brand";

  return (
    <div className="w-64 rounded-2xl border-2 border-brand bg-white p-4 shadow-lg">
      {/* 左側輸入:接收品項連線 */}
      <Handle type="target" position={Position.Left} className="!h-3 !w-3 !bg-brand" />

      <p className="mb-2 text-center text-base font-bold text-brand">訂單</p>

      <div className="space-y-2">
        <label className="block">
          <span className="text-xs text-slate-500">廠商單位</span>
          <select className={selectCls} value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
            <option value="">— 請選擇 —</option>
            {vendors.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-slate-500">接收單位</span>
          <select className={selectCls} value={receiverId} onChange={(e) => setReceiverId(e.target.value)}>
            <option value="">— 請選擇 —</option>
            {receivers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-3 rounded-xl bg-slate-50 p-2 text-center">
        <p className="text-xs text-slate-500">已連結 {connectedCount} 項品項</p>
        <p className="text-xl font-bold text-brand">{money(total)}</p>
      </div>

      <button
        className="nodrag mt-3 w-full rounded-xl bg-brand px-4 py-2.5 font-semibold text-white shadow-sm transition hover:bg-brand-dark active:scale-[0.98] disabled:opacity-50"
        onClick={submit}
        disabled={busy || connectedCount === 0}
      >
        {busy ? "建立中…" : "產生訂單"}
      </button>
    </div>
  );
}
