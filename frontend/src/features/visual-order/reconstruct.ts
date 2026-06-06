// 把「節點圖」還原成結構化的訂單(單頭 + 多排品項)。
//
// 規則(容錯、與接線拓樸無關):
// 1. 用 union-find 把「互相連線的非訂單節點」併成同一群(=一排 / 一個單頭群)。
//    —— 計算時忽略所有連到「訂單」節點的邊,否則所有排會透過訂單被併成一大群。
// 2. 某一群只要有「任一節點」直接連到訂單,就算「有效」(會被計入)。
// 3. 有效群裡:有欄位節點 → 還原成一排(同欄位多個取第一個);
//    有廠商/接收節點 → 取其選的公司當單頭。
import type { Edge, Node } from "@xyflow/react";
import { combineSpec } from "../../lib/spec";
import type { CompanyNodeData, FieldNodeData, ReconstructedRow } from "./context";

export const ORDER_ID = "order";

export interface Reconstructed {
  vendorId: string;
  receiverId: string;
  rows: ReconstructedRow[];
}

class UnionFind {
  parent = new Map<string, string>();
  find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x);
    let root = x;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    // 路徑壓縮
    let cur = x;
    while (this.parent.get(cur) !== root) {
      const next = this.parent.get(cur)!;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }
  union(a: string, b: string) {
    this.parent.set(this.find(a), this.find(b));
  }
}

export function reconstruct(nodes: Node[], edges: Edge[]): Reconstructed {
  const uf = new UnionFind();
  // 先讓每個非訂單節點存在於 UF
  for (const n of nodes) if (n.id !== ORDER_ID) uf.find(n.id);

  // 哪些節點直接連到訂單
  const connectedToOrder = new Set<string>();
  for (const e of edges) {
    if (e.source === ORDER_ID) connectedToOrder.add(e.target);
    else if (e.target === ORDER_ID) connectedToOrder.add(e.source);
    else uf.union(e.source, e.target); // 非訂單邊才併群
  }

  // 標記哪些「群根」是有效的(群內有節點連到訂單)
  const activeRoots = new Set<string>();
  for (const id of connectedToOrder) activeRoots.add(uf.find(id));

  // 依群分組節點
  const groups = new Map<string, Node[]>();
  for (const n of nodes) {
    if (n.id === ORDER_ID) continue;
    const root = uf.find(n.id);
    if (!activeRoots.has(root)) continue;
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(n);
  }

  let vendorId = "";
  let receiverId = "";
  const rows: ReconstructedRow[] = [];

  for (const members of groups.values()) {
    // 單頭:取群內廠商/接收節點選的公司
    for (const n of members) {
      if (n.type === "company") {
        const d = n.data as CompanyNodeData;
        if (d.role === "vendor" && d.companyId) vendorId = d.companyId;
        if (d.role === "receiver" && d.companyId) receiverId = d.companyId;
      }
    }
    // 排:群內若有欄位節點,組成一排
    const fieldNodes = members.filter((n) => n.type === "field");
    if (fieldNodes.length === 0) continue;
    const row: ReconstructedRow = {
      product_name: "",
      spec: "",
      process_item: "",
      quantity: "",
      unit: "",
      remark: "",
    };
    let spec1 = "";
    let spec2 = "";
    for (const n of fieldNodes) {
      const d = n.data as FieldNodeData;
      const v = (d.value ?? "").trim();
      if (!v) continue;
      if (d.field === "品名" && !row.product_name) row.product_name = v;
      else if (d.field === "規格1" && !spec1) spec1 = v;
      else if (d.field === "規格2" && !spec2) spec2 = v;
      else if (d.field === "加工" && !row.process_item) row.process_item = v;
      else if (d.field === "數量" && !row.quantity) row.quantity = v;
      else if (d.field === "單位" && !row.unit) row.unit = v;
      else if (d.field === "備註" && !row.remark) row.remark = v;
    }
    // 規格1/規格2 合併成單一規格(「規格1 x 規格2」)
    row.spec = combineSpec(spec1, spec2);
    // 一排至少要有品名才算數
    if (row.product_name) rows.push(row);
  }

  return { vendorId, receiverId, rows };
}
