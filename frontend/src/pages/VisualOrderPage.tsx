// 視覺化建單(欄位節點版):
// - 廠商/接收/品名/規格/加工/數量/單位 各自節點;可串成排、多排,連到中央訂單。
// - 側欄可拖出:單節點、空白排、最近使用組合。
// - 即時用 union-find 還原成「單頭 + 多排」並預覽;送出走同一支 POST /api/orders。
// - 手機自動退回一般表單。
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  addEdge,
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { ApiError } from "../api/client";
import { companiesApi, ordersApi, processItemsApi, productsApi } from "../api/resources";
import { Button, Card, ErrorBar } from "../components/ui";
import { today } from "../lib/format";
import type { Company, ProcessItem, Product } from "../lib/types";
import CompanyNode from "../features/visual-order/CompanyNode";
import FieldNode from "../features/visual-order/FieldNode";
import OrderNode from "../features/visual-order/OrderNode";
import {
  FIELD_KINDS,
  VisualOrderProvider,
  type FieldKind,
  type VisualOrderCtx,
} from "../features/visual-order/context";
import { ORDER_ID, reconstruct } from "../features/visual-order/reconstruct";
import { loadRecent, pushRecent, type Combo } from "../features/visual-order/recentCombos";

const nodeTypes = { company: CompanyNode, field: FieldNode, order: OrderNode };

// 側欄拖曳時放進 dataTransfer 的內容
type DragPayload =
  | { kind: "company"; role: "vendor" | "receiver" }
  | { kind: "field"; field: FieldKind }
  | { kind: "row" }
  | { kind: "combo"; combo: Combo };

function useIsDesktop() {
  const [desktop, setDesktop] = useState(() => window.matchMedia("(min-width: 1024px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const h = (e: MediaQueryListEvent) => setDesktop(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);
  return desktop;
}

// 初始畫布:訂單 + 廠商 + 接收 + 一排空白(都連到訂單)
function initialGraph(): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [
    { id: ORDER_ID, type: "order", position: { x: 720, y: 180 }, data: {}, deletable: false },
    { id: "vendor-1", type: "company", position: { x: 40, y: 20 }, data: { role: "vendor", companyId: "" } },
    { id: "receiver-1", type: "company", position: { x: 40, y: 140 }, data: { role: "receiver", companyId: "" } },
  ];
  const edges: Edge[] = [
    { id: "ev", source: "vendor-1", target: ORDER_ID },
    { id: "er", source: "receiver-1", target: ORDER_ID },
  ];
  // 一排空白:5 個欄位串好,尾端連訂單
  FIELD_KINDS.forEach((field, i) => {
    const id = `field-init-${i}`;
    nodes.push({ id, type: "field", position: { x: 40 + i * 150, y: 300 }, data: { field, value: "" } });
    if (i > 0) edges.push({ id: `ef-init-${i}`, source: `field-init-${i - 1}`, target: id });
  });
  edges.push({ id: "ef-init-order", source: `field-init-${FIELD_KINDS.length - 1}`, target: ORDER_ID });
  return { nodes, edges };
}

function VisualOrderInner() {
  const navigate = useNavigate();
  const { screenToFlowPosition } = useReactFlow();

  const [products, setProducts] = useState<Product[]>([]);
  const [processItems, setProcessItems] = useState<ProcessItem[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [recent, setRecent] = useState<Combo[]>(() => loadRecent());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const init = useMemo(initialGraph, []);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(init.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(init.edges);
  const seq = useRef(100);

  useEffect(() => {
    Promise.all([productsApi.list(), processItemsApi.list(), companiesApi.list()])
      .then(([ps, pis, cs]) => {
        setProducts(ps);
        setProcessItems(pis);
        setCompanies(cs);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "載入主檔失敗"));
  }, []);

  const vendors = companies.filter((c) => c.role_type === "vendor" || c.role_type === "both");
  const receivers = companies.filter((c) => c.role_type === "receiver" || c.role_type === "both");

  // 即時還原成 單頭 + 多排
  const recon = useMemo(() => reconstruct(nodes, edges), [nodes, edges]);
  // 視覺建單欄位不含單價,改用「合計數量」當匯總指標(單價/金額在請款階段才補)
  const totalQty = useMemo(
    () => recon.rows.reduce((s, r) => s + (Number(r.quantity) || 0), 0),
    [recon.rows],
  );

  const updateNode = useCallback(
    (id: string, patch: Record<string, unknown>) =>
      setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n))),
    [setNodes],
  );
  const removeNode = useCallback(
    (id: string) => {
      setNodes((ns) => ns.filter((n) => n.id !== id));
      setEdges((es) => es.filter((e) => e.source !== id && e.target !== id));
    },
    [setNodes, setEdges],
  );
  const onConnect = useCallback((c: Connection) => setEdges((es) => addEdge(c, es)), [setEdges]);

  // 在指定位置依 payload 建立節點(+ 連線)
  const spawn = useCallback(
    (payload: DragPayload, pos: { x: number; y: number }) => {
      const newNodes: Node[] = [];
      const newEdges: Edge[] = [];
      const nid = () => `n-${++seq.current}`;

      if (payload.kind === "company") {
        newNodes.push({ id: nid(), type: "company", position: pos, data: { role: payload.role, companyId: "" } });
      } else if (payload.kind === "field") {
        newNodes.push({ id: nid(), type: "field", position: pos, data: { field: payload.field, value: "" } });
      } else if (payload.kind === "row" || payload.kind === "combo") {
        // 建一整排(空白或填好),串好並把尾端連到訂單
        const combo = payload.kind === "combo" ? payload.combo : null;
        const valueOf = (f: FieldKind): string => {
          if (!combo) return "";
          if (f === "品名") return combo.product_name;
          if (f === "規格") return combo.spec;
          if (f === "加工") return combo.process_item;
          if (f === "數量") return combo.quantity;
          return combo.unit;
        };
        let prev: string | null = null;
        FIELD_KINDS.forEach((field, i) => {
          const id = nid();
          newNodes.push({
            id, type: "field",
            position: { x: pos.x + i * 150, y: pos.y },
            data: { field, value: valueOf(field) },
          });
          if (prev) newEdges.push({ id: `e-${prev}-${id}`, source: prev, target: id });
          prev = id;
        });
        if (prev) newEdges.push({ id: `e-${prev}-order`, source: prev, target: ORDER_ID });
      }

      setNodes((ns) => [...ns, ...newNodes]);
      if (newEdges.length) setEdges((es) => [...es, ...newEdges]);
    },
    [setNodes, setEdges],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const raw = e.dataTransfer.getData("application/vo");
      if (!raw) return;
      const payload = JSON.parse(raw) as DragPayload;
      const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      spawn(payload, pos);
    },
    [screenToFlowPosition, spawn],
  );
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const submit = useCallback(async () => {
    setError(null);
    if (recon.rows.length === 0) {
      setError("沒有偵測到任何「有品名且連到訂單」的排");
      return;
    }
    const body = {
      vendor_id: recon.vendorId ? Number(recon.vendorId) : null,
      receiver_id: recon.receiverId ? Number(recon.receiverId) : null,
      order_date: today(),
      items: recon.rows.map((r) => ({
        product_name: r.product_name,
        spec: r.spec || null,
        process_item: r.process_item || null,
        quantity: r.quantity ? Number(r.quantity) : 0,
        unit: r.unit || null,
      })),
    };
    setBusy(true);
    try {
      await ordersApi.create(body);
      // 把這次的排存進「最近使用」
      setRecent(pushRecent(recon.rows.map((r) => ({
        product_name: r.product_name, spec: r.spec,
        process_item: r.process_item, quantity: r.quantity, unit: r.unit,
      }))));
      navigate("/orders");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "建立失敗");
    } finally {
      setBusy(false);
    }
  }, [recon, navigate]);

  const ctx: VisualOrderCtx = {
    products, processItems, vendors, receivers,
    rows: recon.rows, totalQty, updateNode, removeNode, submit, busy,
  };

  // 側欄可拖曳項目
  const startDrag = (payload: DragPayload) => (e: React.DragEvent) => {
    e.dataTransfer.setData("application/vo", JSON.stringify(payload));
    e.dataTransfer.effectAllowed = "copy";
  };
  const paletteBtn =
    "cursor-grab select-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium shadow-sm hover:border-brand active:cursor-grabbing";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold sm:text-2xl">視覺化建單</h1>
        <Link to="/orders/new">
          <Button variant="secondary">切換到表單模式</Button>
        </Link>
      </div>
      <ErrorBar message={error} />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[200px_1fr]">
        {/* 側欄:拖曳元件庫 */}
        <Card className="space-y-3">
          <div>
            <p className="mb-1 text-xs font-semibold text-slate-400">單頭</p>
            <div className="flex flex-wrap gap-2">
              <div className={paletteBtn} draggable onDragStart={startDrag({ kind: "company", role: "vendor" })}>廠商</div>
              <div className={paletteBtn} draggable onDragStart={startDrag({ kind: "company", role: "receiver" })}>接收</div>
            </div>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold text-slate-400">整排 / 欄位</p>
            <div className="flex flex-wrap gap-2">
              <div className={`${paletteBtn} bg-brand/5`} draggable onDragStart={startDrag({ kind: "row" })}>＋ 空白排</div>
              {FIELD_KINDS.map((f) => (
                <div key={f} className={paletteBtn} draggable onDragStart={startDrag({ kind: "field", field: f })}>{f}</div>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold text-slate-400">最近使用組合</p>
            {recent.length === 0 ? (
              <p className="text-xs text-slate-400">建單後會記住常用組合</p>
            ) : (
              <div className="space-y-1.5">
                {recent.map((c, i) => (
                  <div
                    key={i}
                    className={`${paletteBtn} block w-full !text-left`}
                    draggable
                    onDragStart={startDrag({ kind: "combo", combo: c })}
                    title="拖到畫布加入這組品項"
                  >
                    {c.product_name}{c.spec ? ` · ${c.spec}` : ""}{c.process_item ? ` · ${c.process_item}` : ""}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* 畫布 + 預覽 */}
        <div className="space-y-3">
          <VisualOrderProvider value={ctx}>
            <div className="h-[62vh] w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-50" onDrop={onDrop} onDragOver={onDragOver}>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                nodeTypes={nodeTypes}
                fitView
              >
                <Background />
                <Controls />
              </ReactFlow>
            </div>
          </VisualOrderProvider>

          {/* 即時預覽:看得到畫布會變成什麼單 */}
          <Card>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-bold">即時預覽(會送出的內容)</h2>
              <span className="text-sm text-slate-500">共 {recon.rows.length} 排 · 合計數量 {totalQty}</span>
            </div>
            <p className="mb-2 text-sm text-slate-500">
              廠商:{vendors.find((v) => String(v.id) === recon.vendorId)?.name ?? "—"}
              接收:{receivers.find((r) => String(r.id) === recon.receiverId)?.name ?? "—"}
            </p>
            {recon.rows.length === 0 ? (
              <p className="py-4 text-center text-slate-400">尚未偵測到完整的排(每排至少要有品名,且連到訂單節點)</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {recon.rows.map((r, i) => (
                  <li key={i} className="flex flex-wrap gap-x-3 py-2">
                    <span className="font-medium">{i + 1}.</span>
                    <span>{r.product_name}</span>
                    {r.spec && <span className="text-slate-500">規格 {r.spec}</span>}
                    {r.process_item && <span className="text-slate-500">加工 {r.process_item}</span>}
                    {r.quantity && <span className="text-slate-500">× {r.quantity}{r.unit}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {/* 品名自動完成清單(整頁共用) */}
      <datalist id="vo-product-options">
        {products.map((p) => (
          <option key={p.id} value={p.name} />
        ))}
      </datalist>
    </div>
  );
}

export default function VisualOrderPage() {
  const isDesktop = useIsDesktop();
  if (!isDesktop) {
    return (
      <div className="mx-auto max-w-md space-y-4">
        <h1 className="text-xl font-bold">視覺化建單</h1>
        <Card className="space-y-4 text-center">
          <p className="text-slate-600">視覺化畫布需要較大螢幕拖拉操作,手機請改用一般表單(功能完全相同)。</p>
          <Link to="/orders/new"><Button className="w-full">改用表單建單</Button></Link>
        </Card>
      </div>
    );
  }
  // ReactFlowProvider 提供 screenToFlowPosition 等 hook
  return (
    <ReactFlowProvider>
      <VisualOrderInner />
    </ReactFlowProvider>
  );
}
