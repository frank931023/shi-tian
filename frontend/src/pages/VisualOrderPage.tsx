// 視覺化建單頁:用 React Flow 畫布「拉元件組單」。
// - 作為「新增的建單模式」,與一般表單並存,送出時呼叫同一支 POST /api/orders。
// - 手機自動退回一般表單(觸控拉線不可行)。
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  addEdge,
  Background,
  Controls,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { ApiError } from "../api/client";
import { companiesApi, ordersApi, processItemsApi, productsApi } from "../api/resources";
import { Button, Card, ErrorBar } from "../components/ui";
import { lineAmount, today } from "../lib/format";
import type { Company, ProcessItem, Product } from "../lib/types";
import ItemNode from "../features/visual-order/ItemNode";
import OrderNode from "../features/visual-order/OrderNode";
import {
  emptyItemData,
  VisualOrderProvider,
  type ItemNodeData,
  type VisualOrderCtx,
} from "../features/visual-order/context";

const nodeTypes = { item: ItemNode, order: OrderNode };
const ORDER_ID = "order";

// 是否為桌機寬度(畫布只在桌機提供)
function useIsDesktop() {
  const [desktop, setDesktop] = useState(() => window.matchMedia("(min-width: 1024px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const handler = (e: MediaQueryListEvent) => setDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return desktop;
}

export default function VisualOrderPage() {
  const isDesktop = useIsDesktop();
  const navigate = useNavigate();

  // 主檔
  const [products, setProducts] = useState<Product[]>([]);
  const [processItems, setProcessItems] = useState<ProcessItem[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);

  // 單頭
  const [vendorId, setVendorId] = useState("");
  const [receiverId, setReceiverId] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 畫布:初始放一個訂單節點 + 一個品項節點(已連線)
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([
    { id: ORDER_ID, type: "order", position: { x: 420, y: 120 }, data: {}, deletable: false },
    { id: "item-1", type: "item", position: { x: 60, y: 60 }, data: emptyItemData() },
  ]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([
    { id: "e-1", source: "item-1", target: ORDER_ID },
  ]);
  const itemSeq = useRef(1);

  // 載入主檔
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

  // 哪些品項節點有連到訂單節點
  const connectedItemIds = useMemo(
    () => new Set(edges.filter((e) => e.target === ORDER_ID).map((e) => e.source)),
    [edges],
  );
  const connectedItems = useMemo(
    () => nodes.filter((n) => n.type === "item" && connectedItemIds.has(n.id)),
    [nodes, connectedItemIds],
  );
  const total = useMemo(
    () =>
      connectedItems.reduce((sum, n) => {
        const d = n.data as ItemNodeData;
        return sum + lineAmount(Number(d.quantity), Number(d.unit_price));
      }, 0),
    [connectedItems],
  );

  const updateItem = useCallback(
    (id: string, patch: Partial<ItemNodeData>) => {
      setNodes((ns) =>
        ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)),
      );
    },
    [setNodes],
  );

  const removeItem = useCallback(
    (id: string) => {
      setNodes((ns) => ns.filter((n) => n.id !== id));
      setEdges((es) => es.filter((e) => e.source !== id && e.target !== id));
    },
    [setNodes, setEdges],
  );

  const addItem = useCallback(() => {
    itemSeq.current += 1;
    const id = `item-${itemSeq.current}`;
    const y = 40 + ((itemSeq.current - 1) % 5) * 120;
    setNodes((ns) => [
      ...ns,
      { id, type: "item", position: { x: 60, y }, data: emptyItemData() },
    ]);
    // 新品項預設自動連到訂單(可手動拔線重接)
    setEdges((es) => [...es, { id: `e-${id}`, source: id, target: ORDER_ID }]);
  }, [setNodes, setEdges]);

  const onConnect = useCallback(
    (c: Connection) => setEdges((es) => addEdge(c, es)),
    [setEdges],
  );

  const submit = useCallback(async () => {
    setError(null);
    const validItems = connectedItems
      .map((n) => n.data as ItemNodeData)
      .filter((d) => d.product_name.trim());
    if (validItems.length === 0) {
      setError("請至少連結一個有填品名的品項到訂單節點");
      return;
    }
    const body = {
      vendor_id: vendorId ? Number(vendorId) : null,
      receiver_id: receiverId ? Number(receiverId) : null,
      order_date: today(),
      items: validItems.map((d) => ({
        product_name: d.product_name.trim(),
        spec: d.spec || null,
        process_item: d.process_item || null,
        quantity: d.quantity ? Number(d.quantity) : 0,
        unit: d.unit || null,
        unit_price: d.unit_price ? Number(d.unit_price) : null,
      })),
    };
    setBusy(true);
    try {
      await ordersApi.create(body);
      navigate("/orders");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "建立失敗");
    } finally {
      setBusy(false);
    }
  }, [connectedItems, vendorId, receiverId, navigate]);

  // 手機:退回一般表單
  if (!isDesktop) {
    return (
      <div className="mx-auto max-w-md space-y-4">
        <h1 className="text-xl font-bold">視覺化建單</h1>
        <Card className="space-y-4 text-center">
          <p className="text-slate-600">
            視覺化畫布需要較大螢幕拖拉操作,手機請改用一般表單建單(功能完全相同)。
          </p>
          <Link to="/orders/new">
            <Button className="w-full">改用表單建單</Button>
          </Link>
        </Card>
      </div>
    );
  }

  const ctx: VisualOrderCtx = {
    products,
    processItems,
    vendors,
    receivers,
    vendorId,
    receiverId,
    setVendorId,
    setReceiverId,
    total,
    connectedCount: connectedItems.length,
    updateItem,
    removeItem,
    submit,
    busy,
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold sm:text-2xl">視覺化建單</h1>
        <div className="flex gap-2">
          <Link to="/orders/new">
            <Button variant="secondary">切換到表單模式</Button>
          </Link>
          <Button onClick={addItem}>+ 新增品項節點</Button>
        </div>
      </div>

      <ErrorBar message={error} />

      <p className="text-sm text-slate-500">
        操作:把「品項」節點的右側圓點拉線連到中央「訂單」節點 → 該品項計入訂單;在節點上直接填欄位;完成後按「產生訂單」。
      </p>

      <VisualOrderProvider value={ctx}>
        <div className="h-[70vh] w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
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

      {/* 品名自動完成清單(整頁共用一份) */}
      <datalist id="vo-product-options">
        {products.map((p) => (
          <option key={p.id} value={p.name} />
        ))}
      </datalist>
    </div>
  );
}
