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
