// 廠商 / 接收 節點:名字「包在框裡」,右側可拉線連到訂單。
import { Handle, Position, type NodeProps } from "@xyflow/react";

import { CascadeSelect } from "../../components/ui";
import { receiverMethod, receiverMethodOptions } from "../../lib/company";
import { useVisualOrder, type CompanyNodeData } from "./context";

export default function CompanyNode({ id, data }: NodeProps) {
  const d = data as CompanyNodeData;
  const { vendors, receivers, updateNode, removeNode } = useVisualOrder();
  const isVendor = d.role === "vendor";
  const accent = isVendor ? "border-amber-400" : "border-emerald-400";
  const titleColor = isVendor ? "text-amber-600" : "text-emerald-600";

  // 接收單位:單一欄位的階層選單,依加工方式分組(無方式者歸「未分類」)
  const recvGroups = isVendor
    ? []
    : [
        ...receiverMethodOptions(receivers).map((m) => ({
          key: m,
          items: receivers.filter((c) => receiverMethod(c) === m).map((c) => ({ id: c.id, label: c.name })),
        })),
        ...(() => {
          const un = receivers.filter((c) => !receiverMethod(c));
          return un.length ? [{ key: "未分類", items: un.map((c) => ({ id: c.id, label: c.name })) }] : [];
        })(),
      ];

  return (
    <div className={`w-52 rounded-2xl border-2 ${accent} bg-white p-3 shadow-md`}>
      <div className="mb-1.5 flex items-center justify-between">
        <span className={`text-sm font-bold ${titleColor}`}>
          {isVendor ? "廠商單位" : "接收單位"}
        </span>
        <button className="nodrag text-xs text-red-500 hover:underline" onClick={() => removeNode(id)}>
          刪除
        </button>
      </div>

      {isVendor ? (
        <select
          className="nodrag w-full rounded-lg border border-slate-300 px-2 py-2 text-base outline-none focus:border-brand"
          value={d.companyId}
          onChange={(e) => updateNode(id, { companyId: e.target.value })}
        >
          <option value="">— 請選擇 —</option>
          {vendors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      ) : (
        // 單一欄位:左選加工方式 → 右跑出該方式的公司
        <CascadeSelect
          value={d.companyId}
          onChange={(v) => updateNode(id, { companyId: v })}
          groups={recvGroups}
          placeholder="選擇接收單位…"
        />
      )}

      <Handle type="source" position={Position.Right} className="!h-4 !w-4 !border-2 !border-white !bg-brand" />
    </div>
  );
}
