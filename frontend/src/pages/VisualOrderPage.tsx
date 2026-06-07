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
  reconnectEdge,
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
import { Button, Card, ErrorBar, Modal } from "../components/ui";
import { today } from "../lib/format";
import { splitSpec } from "../lib/spec";
import type { Company, ProcessItem, Product, Spec } from "../lib/types";
import CompanyNode from "../features/visual-order/CompanyNode";
import FieldNode from "../features/visual-order/FieldNode";
import OrderNode from "../features/visual-order/OrderNode";
import Palette from "../features/visual-order/Palette";
import NodeContextMenu from "../features/visual-order/NodeContextMenu";
import BendableEdge from "../features/visual-order/BendableEdge";
import {
  ADDABLE_KINDS,
  FIELD_KINDS,
  VisualOrderProvider,
  type DragPayload,
  type FieldKind,
  type VisualOrderCtx,
} from "../features/visual-order/context";
import { ORDER_ID, reconstruct } from "../features/visual-order/reconstruct";
import { loadRecent, pushRecent, type Combo } from "../features/visual-order/recentCombos";

const nodeTypes = { company: CompanyNode, field: FieldNode, order: OrderNode };
const edgeTypes = { bendable: BendableEdge };
const E = "bendable"; // 所有連線都用可折彎線型
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
    { id: "ev", type: E, source: "vendor-1", target: ORDER_ID, targetHandle: "header" },
    { id: "er", type: E, source: "receiver-1", target: ORDER_ID, targetHandle: "header" },
  ];
  FIELD_KINDS.forEach((field, i) => {
    const id = `field-init-${i}`;
    nodes.push({ id, type: "field", position: { x: 680 + i * ROW_GAP, y: 110 }, data: { field, value: "" } });
    if (i > 0) edges.push({ id: `ef-init-${i}`, type: E, source: `field-init-${i - 1}`, target: id });
  });
  edges.push({ id: "ef-init-order", type: E, source: ORDER_ID, sourceHandle: "items", target: "field-init-0" });
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
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [orderDate, setOrderDate] = useState(today());
  // 「+建議下一個」浮動選單
  const [suggest, setSuggest] = useState<{ id: string; x: number; y: number } | null>(null);

  const init = useMemo(initialGraph, []);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(init.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(init.edges);
  const seq = useRef(100);
  const flowWrapRef = useRef<HTMLDivElement>(null); // 觸控點擊加入時,算畫布中央位置

  useEffect(() => {
    Promise.all([productsApi.list(), processItemsApi.list(), specsApi.list(), companiesApi.list()])
      .then(([ps, pis, ss, cs]) => {
        setProducts(ps); setProcessItems(pis); setSpecs(ss); setCompanies(cs);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "載入主檔失敗"));
  }, []);

  const vendors = companies.filter((c) => c.role_type === "vendor");
  const receivers = companies.filter((c) => c.role_type === "receiver");

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
  // 連線規則:
  // - 欄位節點:每個輸出/輸入點只允許一條線(接新的自動斷舊的,防止分叉)。
  // - 訂單節點:header(廠商+接收)與 items(多排)本來就該「一對多」,不做自動斷線。
  const onConnect = useCallback(
    (c: Connection) =>
      setEdges((es) => {
        const cleaned = es.filter((e) => {
          const sameOut =
            c.source !== ORDER_ID &&
            e.source === c.source &&
            (e.sourceHandle ?? null) === (c.sourceHandle ?? null);
          const sameIn =
            c.target !== ORDER_ID &&
            e.target === c.target &&
            (e.targetHandle ?? null) === (c.targetHandle ?? null);
          return !sameOut && !sameIn;
        });
        return addEdge({ ...c, type: E }, cleaned);
      }),
    [setEdges],
  );
  // 拖曳線的端點重接到別的節點
  const onReconnect = useCallback(
    (oldEdge: Edge, newConn: Connection) => setEdges((es) => reconnectEdge(oldEdge, newConn, es)),
    [setEdges],
  );
  const onSelectionChange = useCallback((p: OnSelectionChangeParams) => {
    setSelectedIds(p.nodes.filter((n) => n.id !== ORDER_ID).map((n) => n.id));
  }, []);

  // 算某欄位節點所在「這一排」已經有哪些欄位種類(沿 欄位↔欄位 連線走訪)
  const fieldKindsInRow = useCallback(
    (nodeId: string): Set<string> => {
      const adj = new Map<string, string[]>();
      const push = (a: string, b: string) => {
        if (!adj.has(a)) adj.set(a, []);
        adj.get(a)!.push(b);
      };
      for (const e of edges) {
        const s = nodes.find((n) => n.id === e.source);
        const t = nodes.find((n) => n.id === e.target);
        if (s?.type === "field" && t?.type === "field") {
          push(e.source, e.target);
          push(e.target, e.source);
        }
      }
      const seen = new Set<string>();
      const stack = [nodeId];
      const kinds = new Set<string>();
      while (stack.length) {
        const id = stack.pop()!;
        if (seen.has(id)) continue;
        seen.add(id);
        const n = nodes.find((x) => x.id === id);
        if (n?.type === "field") kinds.add((n.data as { field: string }).field);
        for (const nb of adj.get(id) ?? []) if (!seen.has(nb)) stack.push(nb);
      }
      return kinds;
    },
    [nodes, edges],
  );

  // 點欄位節點的「+」→ 開建議選單
  const suggestNext = useCallback((id: string, x: number, y: number) => setSuggest({ id, x, y }), []);
  // 從建議選單選一個欄位 → 在右側建立並自動連線(同輸出點只一條線)
  const createNext = useCallback(
    (field: FieldKind) => {
      if (!suggest) return;
      const src = nodes.find((n) => n.id === suggest.id);
      if (!src) { setSuggest(null); return; }
      const newId = `n-${++seq.current}`;
      setNodes((ns) => [...ns, { id: newId, type: "field", position: { x: src.position.x + ROW_GAP, y: src.position.y }, data: { field, value: "" } }]);
      setEdges((es) => {
        const cleaned = es.filter((e) => !(e.source === src.id && (e.sourceHandle ?? null) === null));
        return [...cleaned, { id: `e-${src.id}-${newId}`, type: E, source: src.id, target: newId }];
      });
      setSuggest(null);
    },
    [suggest, nodes, setNodes, setEdges],
  );

  // 連線合理性檢查:拖線當下就擋掉不合理的連法
  const isValidConnection = useCallback(
    (c: Connection | Edge) => {
      if (!c.source || !c.target || c.source === c.target) return false;
      const byId = (id: string) => nodes.find((n) => n.id === id);
      const src = byId(c.source);
      const tgt = byId(c.target);
      if (!src || !tgt) return false;
      // 不可重複同一條邊
      if (edges.some((e) => e.source === c.source && e.target === c.target)) return false;

      // 公司:只能連到訂單;同類(廠商/接收)只能有一個
      if (src.type === "company") {
        if (tgt.id !== ORDER_ID) return false;
        const role = (src.data as { role: string }).role;
        const dup = edges.some((e) => {
          const s = byId(e.source);
          return s?.type === "company" && (s.data as { role: string }).role === role && e.target === ORDER_ID;
        });
        return !dup;
      }
      // 訂單右側 items → 欄位
      if (src.id === ORDER_ID) return tgt.type === "field";
      // 欄位 → 欄位(串接);欄位不可直接連訂單(由訂單連向品名 head)
      if (src.type === "field") return tgt.type === "field";
      return false;
    },
    [nodes, edges],
  );

  const spawn = useCallback(
    (payload: DragPayload, pos: { x: number; y: number }) => {
      const newNodes: Node[] = [];
      const newEdges: Edge[] = [];
      const nid = () => `n-${++seq.current}`;

      if (payload.kind === "company") {
        const id = nid();
        newNodes.push({ id, type: "company", position: pos, data: { role: payload.role, companyId: payload.companyId ?? "" } });
        // 同類(廠商/接收)只能一個:先移除舊的同類→訂單連線(替換語意),再連新的
        setEdges((es) => {
          const filtered = es.filter((e) => {
            const s = nodes.find((n) => n.id === e.source);
            return !(s?.type === "company" && (s.data as { role: string }).role === payload.role && e.target === ORDER_ID);
          });
          return [...filtered, { id: `e-${id}-header`, type: E, source: id, target: ORDER_ID, targetHandle: "header" }];
        });
      } else if (payload.kind === "field") {
        newNodes.push({ id: nid(), type: "field", position: pos, data: { field: payload.field, value: payload.value ?? "", custom: payload.custom } });
      } else if (payload.kind === "row" || payload.kind === "combo") {
        const combo = payload.kind === "combo" ? payload.combo : null;
        const [comboSpec1, comboSpec2] = splitSpec(combo?.spec);
        const valueOf = (f: FieldKind): string => {
          if (!combo) return "";
          if (f === "品名") return combo.product_name;
          if (f === "規格1") return comboSpec1;
          if (f === "規格2") return comboSpec2;
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
          if (prev) newEdges.push({ id: `e-${prev}-${id}`, type: E, source: prev, target: id });
          prev = id;
        });
        if (head) newEdges.push({ id: `e-order-${head}`, type: E, source: ORDER_ID, sourceHandle: "items", target: head });
      }

      setNodes((ns) => [...ns, ...newNodes]);
      if (newEdges.length) setEdges((es) => [...es, ...newEdges]);
    },
    [setNodes, setEdges, nodes],
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

  // 觸控/點擊加入:把節點放到畫布可視區中央(平板無法用 HTML5 拖放)
  const addPayload = useCallback(
    (payload: DragPayload) => {
      const rect = flowWrapRef.current?.getBoundingClientRect();
      const screen = rect
        ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
        : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      spawn(payload, screenToFlowPosition(screen));
    },
    [spawn, screenToFlowPosition],
  );

  const onNodeContextMenu = useCallback((e: React.MouseEvent, node: Node) => {
    e.preventDefault();
    if (node.id === ORDER_ID) return;
    setMenu({ x: e.clientX, y: e.clientY, id: node.id });
  }, []);

  // 按「產生訂單」:先做基本檢查,再開確認 Modal(讓使用者核對)
  const openConfirm = useCallback(() => {
    setError(null);
    if (recon.rows.length === 0) {
      setError("沒有偵測到任何「有品名且連到訂單」的排");
      return;
    }
    setConfirmOpen(true);
  }, [recon.rows.length]);

  // Modal 按「確認送出」才真正建立
  const doSubmit = useCallback(async () => {
    const body = {
      vendor_id: recon.vendorId ? Number(recon.vendorId) : null,
      receiver_id: recon.receiverId ? Number(recon.receiverId) : null,
      order_date: orderDate,
      items: recon.rows.map((r) => ({
        product_name: r.product_name, spec: r.spec || null, process_item: r.process_item || null,
        quantity: r.quantity ? Number(r.quantity) : 0, unit: r.unit || null, remark: r.remark || null,
      })),
    };
    setBusy(true);
    try {
      const saved = await ordersApi.create(body);
      setRecent(pushRecent(recon.rows.map((r) => ({
        product_name: r.product_name, spec: r.spec, process_item: r.process_item, quantity: r.quantity, unit: r.unit,
      }))));
      setConfirmOpen(false);
      setSavedId(saved.id); // 改問是否列印
    } catch (err) {
      setConfirmOpen(false);
      setError(err instanceof ApiError ? err.message : "建立失敗");
    } finally {
      setBusy(false);
    }
  }, [recon, navigate, orderDate]);

  // 防呆:廠商、接收都選了,且至少一排、每排都有品名與數量,才可送出
  const canSubmit =
    !!recon.vendorId && !!recon.receiverId && recon.rows.length > 0 &&
    recon.rows.every((r) => r.product_name.trim() && String(r.quantity).trim());

  const ctx: VisualOrderCtx = {
    products, processItems, specs, vendors, receivers,
    rows: recon.rows, totalQty, orderDate, setOrderDate, updateNode,
    removeNode: (id) => removeNodes([id]),
    suggestNext, submit: openConfirm, canSubmit, busy,
  };

  const vendorName = vendors.find((v) => String(v.id) === recon.vendorId)?.name ?? "—";
  const receiverName = receivers.find((r) => String(r.id) === recon.receiverId)?.name ?? "—";

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
        {/* relative 外框 + absolute 內容:讓側欄高度由右側(畫布+預覽)決定,底部對齊預覽 */}
        <div className="relative min-h-[300px]">
          {paletteOpen ? (
            <div className="lg:absolute lg:inset-0">
              <Card className="flex h-full flex-col !p-3">
                <Palette
                  vendors={vendors} receivers={receivers} products={products}
                  processItems={processItems} specs={specs} recent={recent}
                  startDrag={startDrag} onPick={addPayload} onCollapse={() => setPaletteOpen(false)}
                />
              </Card>
            </div>
          ) : (
            <button
              onClick={() => setPaletteOpen(true)}
              title="展開側欄"
              className="hidden h-full w-full items-start justify-center rounded-2xl border border-slate-200 bg-white pt-3 text-slate-500 hover:bg-slate-50 lg:absolute lg:inset-0 lg:flex"
            >
              ⟩
            </button>
          )}
        </div>

        <div className="space-y-3">
          <VisualOrderProvider value={ctx}>
            <div ref={flowWrapRef} className="h-[60vh] w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-50" onDrop={onDrop} onDragOver={onDragOver}>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onReconnect={onReconnect}
                isValidConnection={isValidConnection}
                connectionRadius={45}
                onSelectionChange={onSelectionChange}
                onNodeContextMenu={onNodeContextMenu}
                onPaneContextMenu={(e) => { e.preventDefault(); setMenu(null); }}
                onPaneClick={() => { setMenu(null); setSuggest(null); }}
                onMoveStart={() => { setMenu(null); setSuggest(null); }}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                defaultEdgeOptions={{ type: E }}
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
                  廠商:{vendorName}　接收:{receiverName}
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
                        {r.remark && <span className="text-slate-400">註 {r.remark}</span>}
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

      {/* 「+」建議下一個欄位的浮動選單(排除這排已有的欄位) */}
      {suggest && (() => {
        const used = fieldKindsInRow(suggest.id);
        // 單位可重複(一排可放兩個單位 → 合併成 2k+3b),故永遠保留在選單
        const avail = ADDABLE_KINDS.filter((f) => f === "單位" || !used.has(f));
        return (
          <div
            className="fixed z-50 rounded-xl border border-slate-200 bg-white p-1 shadow-lg"
            style={{ left: suggest.x, top: suggest.y }}
            onMouseLeave={() => setSuggest(null)}
          >
            <p className="px-3 py-1 text-xs text-slate-400">新增下一個欄位</p>
            {avail.length === 0 ? (
              <p className="px-4 py-1.5 text-sm text-slate-400">這排欄位已齊全</p>
            ) : (
              avail.map((f) => (
                <button
                  key={f}
                  className="block w-full rounded-lg px-4 py-1.5 text-left text-sm hover:bg-slate-100"
                  onClick={() => createNext(f)}
                >
                  {f}
                </button>
              ))
            )}
          </div>
        );
      })()}

      {/* 產生訂單前的確認 Modal:讓使用者核對選的內容 */}
      <Modal
        open={confirmOpen}
        title="確認訂單內容"
        onClose={() => !busy && setConfirmOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)} disabled={busy}>
              返回修改
            </Button>
            <Button onClick={doSubmit} disabled={busy}>
              {busy ? "送出中…" : "確認送出"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-lg bg-slate-50 p-2">
              <span className="text-slate-400">廠商單位</span>
              <p className="font-medium">{vendorName}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-2">
              <span className="text-slate-400">接收單位</span>
              <p className="font-medium">{receiverName}</p>
            </div>
          </div>
          <div>
            <p className="mb-1 text-sm text-slate-500">品項({recon.rows.length} 排,合計數量 {totalQty})</p>
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {recon.rows.map((r, i) => (
                <li key={i} className="flex flex-wrap items-center gap-x-3 px-3 py-2 text-sm">
                  <span className="font-medium text-slate-400">{i + 1}</span>
                  <span className="font-medium">{r.product_name}</span>
                  {r.spec && <span className="text-slate-500">規格 {r.spec}</span>}
                  {r.process_item && <span className="text-slate-500">加工 {r.process_item}</span>}
                  {r.quantity && <span className="text-slate-500">數量 {r.quantity} {r.unit}</span>}
                </li>
              ))}
            </ul>
          </div>
          {(vendorName === "—" || receiverName === "—") && (
            <p className="text-sm text-amber-600">提醒:廠商或接收單位尚未選擇,確認後仍可送出(可日後補)。</p>
          )}
        </div>
      </Modal>

      {/* 建立成功 → 是否列印 */}
      <Modal
        open={savedId !== null}
        title="訂單已建立"
        onClose={() => navigate("/orders")}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => navigate("/orders")}>稍後再印</Button>
            <Button
              type="button"
              onClick={() => {
                if (savedId !== null) window.open(ordersApi.pdfUrl(savedId), "_blank");
                navigate("/orders");
              }}
            >
              產生 PDF 並列印
            </Button>
          </>
        }
      >
        <p className="text-slate-600">訂單已建立,要現在產生三聯單 PDF 列印嗎?</p>
      </Modal>

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
