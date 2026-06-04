// 視覺化建單(欄位節點版,v4):
// - 側欄分類可展開 + 可整體收合;即時預覽可收合。
// - 畫布右上角「移動 / 選取」模式切換;選取(可多選)後可複製/刪除。
// - 右鍵節點選單(複製/刪除);union-find 即時還原成「單頭 + 多排」並預覽。
// - 送出走同一支 POST /api/orders;手機自動退回一般表單。
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  addEdge,
  Background,
  Controls,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type OnSelectionChangeParams,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { ApiError } from "../api/client";
import { companiesApi, ordersApi, processItemsApi, productsApi, specsApi } from "../api/resources";
import { Button, Card, ErrorBar } from "../components/ui";
import { today } from "../lib/format";
import type { Company, ProcessItem, Product, Spec } from "../lib/types";
import CompanyNode from "../features/visual-order/CompanyNode";
import FieldNode from "../features/visual-order/FieldNode";
import OrderNode from "../features/visual-order/OrderNode";
import Palette from "../features/visual-order/Palette";
import NodeContextMenu from "../features/visual-order/NodeContextMenu";
import {
  FIELD_KINDS,
  VisualOrderProvider,
  type DragPayload,
  type FieldKind,
  type VisualOrderCtx,
} from "../features/visual-order/context";
import { ORDER_ID, reconstruct } from "../features/visual-order/reconstruct";
import { loadRecent, pushRecent, type Combo } from "../features/visual-order/recentCombos";

const nodeTypes = { company: CompanyNode, field: FieldNode, order: OrderNode };
const ROW_GAP = 200; // 一排內欄位節點的水平間距(避免重疊,排版整齊)

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

// 佈局:訂單在中間;廠商/接收在「訂單左側」;品項排在「訂單右側」往右展開。
function initialGraph(): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [
    { id: ORDER_ID, type: "order", position: { x: 380, y: 120 }, data: {}, deletable: false },
    { id: "vendor-1", type: "company", position: { x: 20, y: 30 }, data: { role: "vendor", companyId: "" } },
    { id: "receiver-1", type: "company", position: { x: 20, y: 190 }, data: { role: "receiver", companyId: "" } },
  ];
  const edges: Edge[] = [
    { id: "ev", source: "vendor-1", target: ORDER_ID, targetHandle: "header" },
    { id: "er", source: "receiver-1", target: ORDER_ID, targetHandle: "header" },
  ];
  FIELD_KINDS.forEach((field, i) => {
    const id = `field-init-${i}`;
    nodes.push({ id, type: "field", position: { x: 680 + i * ROW_GAP, y: 110 }, data: { field, value: "" } });
    if (i > 0) edges.push({ id: `ef-init-${i}`, source: `field-init-${i - 1}`, target: id });
  });
  edges.push({ id: "ef-init-order", source: ORDER_ID, sourceHandle: "items", target: "field-init-0" });
  return { nodes, edges };
}

interface MenuState { x: number; y: number; id: string; }
type Mode = "pan" | "select";

function VisualOrderInner() {
  const navigate = useNavigate();
  const { screenToFlowPosition } = useReactFlow();

  const [products, setProducts] = useState<Product[]>([]);
  const [processItems, setProcessItems] = useState<ProcessItem[]>([]);
  const [specs, setSpecs] = useState<Spec[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [recent, setRecent] = useState<Combo[]>(() => loadRecent());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [paletteOpen, setPaletteOpen] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(true);
  const [mode, setMode] = useState<Mode>("pan");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [menu, setMenu] = useState<MenuState | null>(null);

  const init = useMemo(initialGraph, []);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(init.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(init.edges);
  const seq = useRef(100);

  useEffect(() => {
    Promise.all([productsApi.list(), processItemsApi.list(), specsApi.list(), companiesApi.list()])
      .then(([ps, pis, ss, cs]) => {
        setProducts(ps); setProcessItems(pis); setSpecs(ss); setCompanies(cs);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "載入主檔失敗"));
  }, []);

  const vendors = companies.filter((c) => c.role_type === "vendor" || c.role_type === "both");
  const receivers = companies.filter((c) => c.role_type === "receiver" || c.role_type === "both");

  const recon = useMemo(() => reconstruct(nodes, edges), [nodes, edges]);
  const totalQty = useMemo(
    () => recon.rows.reduce((s, r) => s + (Number(r.quantity) || 0), 0),
    [recon.rows],
  );

  const updateNode = useCallback(
    (id: string, patch: Record<string, unknown>) =>
      setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n))),
    [setNodes],
  );
  const removeNodes = useCallback(
    (ids: string[]) => {
      const set = new Set(ids.filter((id) => id !== ORDER_ID));
      if (set.size === 0) return;
      setNodes((ns) => ns.filter((n) => !set.has(n.id)));
      setEdges((es) => es.filter((e) => !set.has(e.source) && !set.has(e.target)));
    },
    [setNodes, setEdges],
  );
  const copyNodes = useCallback(
    (ids: string[]) => {
      setNodes((ns) => {
        const extra: Node[] = [];
        for (const id of ids) {
          if (id === ORDER_ID) continue;
          const n = ns.find((x) => x.id === id);
          if (!n) continue;
          extra.push({ ...n, id: `n-${++seq.current}`, position: { x: n.position.x + 40, y: n.position.y + 40 }, data: { ...n.data }, selected: false });
        }
        return extra.length ? [...ns, ...extra] : ns;
      });
    },
    [setNodes],
  );
  const onConnect = useCallback((c: Connection) => setEdges((es) => addEdge(c, es)), [setEdges]);
  const onSelectionChange = useCallback((p: OnSelectionChangeParams) => {
    setSelectedIds(p.nodes.filter((n) => n.id !== ORDER_ID).map((n) => n.id));
  }, []);

  const spawn = useCallback(
    (payload: DragPayload, pos: { x: number; y: number }) => {
      const newNodes: Node[] = [];
      const newEdges: Edge[] = [];
      const nid = () => `n-${++seq.current}`;

      if (payload.kind === "company") {
        const id = nid();
        newNodes.push({ id, type: "company", position: pos, data: { role: payload.role, companyId: payload.companyId ?? "" } });
        newEdges.push({ id: `e-${id}-header`, source: id, target: ORDER_ID, targetHandle: "header" });
      } else if (payload.kind === "field") {
        newNodes.push({ id: nid(), type: "field", position: pos, data: { field: payload.field, value: payload.value ?? "" } });
      } else if (payload.kind === "row" || payload.kind === "combo") {
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
        let head: string | null = null;
        FIELD_KINDS.forEach((field, i) => {
          const id = nid();
          if (i === 0) head = id;
          newNodes.push({ id, type: "field", position: { x: pos.x + i * ROW_GAP, y: pos.y }, data: { field, value: valueOf(field) } });
          if (prev) newEdges.push({ id: `e-${prev}-${id}`, source: prev, target: id });
          prev = id;
        });
        if (head) newEdges.push({ id: `e-order-${head}`, source: ORDER_ID, sourceHandle: "items", target: head });
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
      spawn(JSON.parse(raw) as DragPayload, screenToFlowPosition({ x: e.clientX, y: e.clientY }));
    },
    [screenToFlowPosition, spawn],
  );
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const onNodeContextMenu = useCallback((e: React.MouseEvent, node: Node) => {
    e.preventDefault();
    if (node.id === ORDER_ID) return;
    setMenu({ x: e.clientX, y: e.clientY, id: node.id });
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
        product_name: r.product_name, spec: r.spec || null, process_item: r.process_item || null,
        quantity: r.quantity ? Number(r.quantity) : 0, unit: r.unit || null,
      })),
    };
    setBusy(true);
    try {
      await ordersApi.create(body);
      setRecent(pushRecent(recon.rows.map((r) => ({
        product_name: r.product_name, spec: r.spec, process_item: r.process_item, quantity: r.quantity, unit: r.unit,
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
    rows: recon.rows, totalQty, updateNode,
    removeNode: (id) => removeNodes([id]),
    submit, busy,
  };

  const startDrag = (payload: DragPayload) => (e: React.DragEvent) => {
    e.dataTransfer.setData("application/vo", JSON.stringify(payload));
    e.dataTransfer.effectAllowed = "copy";
  };

  const modeBtn = (m: Mode) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium ${mode === m ? "bg-brand text-white" : "bg-white text-slate-600 hover:bg-slate-100"}`;

  return (
    <div className="mx-auto max-w-[1400px] space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold sm:text-2xl">視覺化建單</h1>
        <Link to="/orders/new">
          <Button variant="secondary">切換到表單模式</Button>
        </Link>
      </div>
      <ErrorBar message={error} />

      <div className={`grid grid-cols-1 gap-3 ${paletteOpen ? "lg:grid-cols-[220px_1fr]" : "lg:grid-cols-[40px_1fr]"}`}>
        {paletteOpen ? (
          <Card className="h-[60vh] !p-3">
            <Palette
              vendors={vendors} receivers={receivers} products={products}
              processItems={processItems} specs={specs} recent={recent}
              startDrag={startDrag} onCollapse={() => setPaletteOpen(false)}
            />
          </Card>
        ) : (
          <button
            onClick={() => setPaletteOpen(true)}
            title="展開側欄"
            className="hidden h-[60vh] items-start justify-center rounded-2xl border border-slate-200 bg-white pt-3 text-slate-500 hover:bg-slate-50 lg:flex"
          >
            ⟩
          </button>
        )}

        <div className="space-y-3">
          <VisualOrderProvider value={ctx}>
            <div className="h-[60vh] w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-50" onDrop={onDrop} onDragOver={onDragOver}>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onSelectionChange={onSelectionChange}
                onNodeContextMenu={onNodeContextMenu}
                onPaneContextMenu={(e) => { e.preventDefault(); setMenu(null); }}
                onPaneClick={() => setMenu(null)}
                onMoveStart={() => setMenu(null)}
                nodeTypes={nodeTypes}
                fitView
                // 模式:移動(左鍵平移)/ 選取(左鍵框選);兩者皆可滾輪平移
                selectionOnDrag={mode === "select"}
                panOnDrag={mode === "pan" ? true : [1]}
                panOnScroll
                zoomOnScroll={false}
                deleteKeyCode={["Backspace", "Delete"]}
              >
                <Background />
                <Controls />
                {/* 右上角工具列:模式切換 + 選取後的動作 */}
                <Panel position="top-right" className="!m-2 flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow">
                  <button className={modeBtn("pan")} onClick={() => setMode("pan")} title="左鍵拖曳平移畫布">✋ 移動</button>
                  <button className={modeBtn("select")} onClick={() => setMode("select")} title="左鍵拖曳框選節點">⬚ 選取</button>
                  {selectedIds.length > 0 && (
                    <>
                      <span className="mx-1 text-sm text-slate-400">已選 {selectedIds.length}</span>
                      <button className="rounded-lg px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-100" onClick={() => copyNodes(selectedIds)}>複製</button>
                      <button className="rounded-lg px-2.5 py-1.5 text-sm text-red-600 hover:bg-red-50" onClick={() => removeNodes(selectedIds)}>刪除</button>
                    </>
                  )}
                </Panel>
              </ReactFlow>
            </div>
          </VisualOrderProvider>

          {/* 即時預覽(可收合) */}
          <Card>
            <button
              className="flex w-full items-center justify-between"
              onClick={() => setPreviewOpen((o) => !o)}
            >
              <h2 className="font-bold">即時預覽(會送出的內容)</h2>
              <span className="flex items-center gap-2 text-sm text-slate-500">
                共 {recon.rows.length} 排 · 合計數量 {totalQty}
                <span className="text-slate-400">{previewOpen ? "▾" : "▸"}</span>
              </span>
            </button>
            {previewOpen && (
              <div className="mt-2">
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
              </div>
            )}
          </Card>
        </div>
      </div>

      {menu && (
        <NodeContextMenu
          x={menu.x} y={menu.y}
          onCopy={() => copyNodes([menu.id])}
          onDelete={() => removeNodes([menu.id])}
          onClose={() => setMenu(null)}
        />
      )}

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
  return (
    <ReactFlowProvider>
      <VisualOrderInner />
    </ReactFlowProvider>
  );
}
