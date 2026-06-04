// 視覺化建單(欄位節點版,v3):
// - 側欄分類 + 可展開 + 可整體收合,拖出「已填好值」的節點。
// - 畫布:左鍵框選多節點、正常拖曳、滾輪/觸控板平移、右鍵選單(複製/刪除)。
// - union-find 即時還原成「單頭 + 多排」並預覽;送出走同一支 POST /api/orders。
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
    { id: "vendor-1", type: "company", position: { x: 20, y: 40 }, data: { role: "vendor", companyId: "" } },
    { id: "receiver-1", type: "company", position: { x: 20, y: 180 }, data: { role: "receiver", companyId: "" } },
  ];
  const edges: Edge[] = [
    // 單頭 → 訂單左側 header
    { id: "ev", source: "vendor-1", target: ORDER_ID, targetHandle: "header" },
    { id: "er", source: "receiver-1", target: ORDER_ID, targetHandle: "header" },
  ];
  // 一排空白:訂單右側 items → 品名(head),再往右串接
  FIELD_KINDS.forEach((field, i) => {
    const id = `field-init-${i}`;
    nodes.push({ id, type: "field", position: { x: 660 + i * 150, y: 120 }, data: { field, value: "" } });
    if (i > 0) edges.push({ id: `ef-init-${i}`, source: `field-init-${i - 1}`, target: id });
  });
  edges.push({ id: "ef-init-order", source: ORDER_ID, sourceHandle: "items", target: "field-init-0" });
  return { nodes, edges };
}

interface MenuState {
  x: number;
  y: number;
  id: string;
}

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
  const [menu, setMenu] = useState<MenuState | null>(null);

  const init = useMemo(initialGraph, []);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(init.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(init.edges);
  const seq = useRef(100);

  useEffect(() => {
    Promise.all([productsApi.list(), processItemsApi.list(), specsApi.list(), companiesApi.list()])
      .then(([ps, pis, ss, cs]) => {
        setProducts(ps);
        setProcessItems(pis);
        setSpecs(ss);
        setCompanies(cs);
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
  const removeNode = useCallback(
    (id: string) => {
      setNodes((ns) => ns.filter((n) => n.id !== id));
      setEdges((es) => es.filter((e) => e.source !== id && e.target !== id));
    },
    [setNodes, setEdges],
  );
  const copyNode = useCallback(
    (id: string) => {
      setNodes((ns) => {
        const n = ns.find((x) => x.id === id);
        if (!n) return ns;
        const nid = `n-${++seq.current}`;
        return [
          ...ns,
          { ...n, id: nid, position: { x: n.position.x + 40, y: n.position.y + 40 }, data: { ...n.data }, selected: false },
        ];
      });
    },
    [setNodes],
  );
  const onConnect = useCallback((c: Connection) => setEdges((es) => addEdge(c, es)), [setEdges]);

  const spawn = useCallback(
    (payload: DragPayload, pos: { x: number; y: number }) => {
      const newNodes: Node[] = [];
      const newEdges: Edge[] = [];
      const nid = () => `n-${++seq.current}`;

      if (payload.kind === "company") {
        const id = nid();
        newNodes.push({
          id, type: "company", position: pos,
          data: { role: payload.role, companyId: payload.companyId ?? "" },
        });
        // 自動接到訂單左側 header
        newEdges.push({ id: `e-${id}-header`, source: id, target: ORDER_ID, targetHandle: "header" });
      } else if (payload.kind === "field") {
        newNodes.push({
          id: nid(), type: "field", position: pos,
          data: { field: payload.field, value: payload.value ?? "" },
        });
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
          newNodes.push({ id, type: "field", position: { x: pos.x + i * 150, y: pos.y }, data: { field, value: valueOf(field) } });
          if (prev) newEdges.push({ id: `e-${prev}-${id}`, source: prev, target: id });
          prev = id;
        });
        // 訂單右側 items → 排的 head(品名)
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
      const payload = JSON.parse(raw) as DragPayload;
      spawn(payload, screenToFlowPosition({ x: e.clientX, y: e.clientY }));
    },
    [screenToFlowPosition, spawn],
  );
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const onNodeContextMenu = useCallback((e: React.MouseEvent, node: Node) => {
    e.preventDefault();
    if (node.id === ORDER_ID) return; // 訂單 hub 不提供刪除/複製
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
    rows: recon.rows, totalQty, updateNode, removeNode, submit, busy,
  };

  const startDrag = (payload: DragPayload) => (e: React.DragEvent) => {
    e.dataTransfer.setData("application/vo", JSON.stringify(payload));
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold sm:text-2xl">視覺化建單</h1>
        <Link to="/orders/new">
          <Button variant="secondary">切換到表單模式</Button>
        </Link>
      </div>
      <ErrorBar message={error} />
      <p className="text-sm text-slate-500">
        從側欄把元件拖到畫布;欄位節點右側圓點拉線串成一排、再連到「訂單」即計入。
        左鍵框選多個節點、右鍵可複製/刪除、滾輪或觸控板平移畫布。
      </p>

      <div className={`grid grid-cols-1 gap-3 ${paletteOpen ? "lg:grid-cols-[220px_1fr]" : "lg:grid-cols-[40px_1fr]"}`}>
        {/* 側欄(可收合) */}
        {paletteOpen ? (
          <Card className="h-[64vh] !p-3">
            <Palette
              vendors={vendors}
              receivers={receivers}
              products={products}
              processItems={processItems}
              specs={specs}
              recent={recent}
              startDrag={startDrag}
              onCollapse={() => setPaletteOpen(false)}
            />
          </Card>
        ) : (
          <button
            onClick={() => setPaletteOpen(true)}
            title="展開側欄"
            className="hidden h-[64vh] items-start justify-center rounded-2xl border border-slate-200 bg-white pt-3 text-slate-500 hover:bg-slate-50 lg:flex"
          >
            ⟩
          </button>
        )}

        {/* 畫布 + 預覽 */}
        <div className="space-y-3">
          <VisualOrderProvider value={ctx}>
            <div className="h-[64vh] w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-50" onDrop={onDrop} onDragOver={onDragOver}>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeContextMenu={onNodeContextMenu}
                onPaneContextMenu={(e) => { e.preventDefault(); setMenu(null); }}
                onPaneClick={() => setMenu(null)}
                onMoveStart={() => setMenu(null)}
                nodeTypes={nodeTypes}
                fitView
                // 滑鼠/觸控板操作:左鍵框選、滾輪平移、中鍵拖曳平移
                selectionOnDrag
                panOnScroll
                zoomOnScroll={false}
                panOnDrag={[1]}
                deleteKeyCode={["Backspace", "Delete"]}
              >
                <Background />
                <Controls />
              </ReactFlow>
            </div>
          </VisualOrderProvider>

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

      {/* 右鍵選單 */}
      {menu && (
        <NodeContextMenu
          x={menu.x}
          y={menu.y}
          onCopy={() => copyNode(menu.id)}
          onDelete={() => removeNode(menu.id)}
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
