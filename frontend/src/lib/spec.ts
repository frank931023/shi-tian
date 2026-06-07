// 規格的「兩欄輸入 ↔ 單一儲存」轉換。
// 輸入端(表單/拖曳)分成「規格1」「規格2」兩欄方便填寫;
// 儲存、列表顯示、PDF 都只用單一 spec 字串,格式為「規格1 x 規格2」。

const SEP = " x ";

// 兩欄 → 單一字串。只有一欄時就回那一欄;兩欄皆空回空字串。
export function combineSpec(spec1?: string | null, spec2?: string | null): string {
  const a = (spec1 ?? "").trim();
  const b = (spec2 ?? "").trim();
  if (a && b) return `${a}${SEP}${b}`;
  return a || b || "";
}

// 單一字串 → 兩欄(編輯既有單時用)。以第一個 " x " 切開;沒有就整段當規格1。
export function splitSpec(spec?: string | null): [string, string] {
  const s = (spec ?? "").trim();
  if (!s) return ["", ""];
  const i = s.indexOf(SEP);
  if (i === -1) return [s, ""];
  return [s.slice(0, i).trim(), s.slice(i + SEP.length).trim()];
}

// ---- 規格排序(公制在前、英制在後;各自由小到大)與規格1→規格2 連動 ----
import type { Spec } from "./types";

// 解析尺寸:是否英制(含 ")、以及數值大小(分數換算成小數)
function sizeRank(raw: string): { imperial: boolean; val: number } {
  const imperial = raw.includes('"');
  const frac = raw.match(/(\d+)\s*\/\s*(\d+)/);
  let val: number;
  if (frac) val = Number(frac[1]) / Number(frac[2]);
  else {
    const d = raw.match(/(\d+(?:\.\d+)?)/);
    val = d ? Number(d[1]) : Number.POSITIVE_INFINITY; // 無數字的排最後
  }
  return { imperial, val };
}

// 比較兩個規格名稱:公制(無 ")在前、英制(有 ")在後;同類由小到大
export function compareSpecName(a: string, b: string): number {
  const ra = sizeRank(a);
  const rb = sizeRank(b);
  if (ra.imperial !== rb.imperial) return ra.imperial ? 1 : -1;
  if (ra.val !== rb.val) return ra.val - rb.val;
  return a.localeCompare(b);
}

export function sortSpecNames(names: string[]): string[] {
  return [...new Set(names)].sort(compareSpecName);
}

// 規格1 的所有選項(去重、排序);無 kind 的舊資料也歸到規格1
export function spec1Options(specs: Spec[]): string[] {
  return sortSpecNames(specs.filter((s) => s.kind !== "規格2").map((s) => s.name));
}

// 給定規格1,回傳「可搭配」的規格2(同 group);未選規格1 → 回全部規格2
export function spec2Options(specs: Spec[], spec1: string): string[] {
  let pool = specs.filter((s) => s.kind === "規格2");
  const v = (spec1 ?? "").trim();
  if (v) {
    const groups = new Set(
      specs
        .filter((s) => s.kind === "規格1" && s.name === v && s.group_index != null)
        .map((s) => s.group_index),
    );
    if (groups.size) pool = pool.filter((s) => s.group_index != null && groups.has(s.group_index));
  }
  return sortSpecNames(pool.map((s) => s.name));
}
