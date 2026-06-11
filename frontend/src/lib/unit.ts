// 單位:固定選項(1k–10k、1b–10b),可由兩段組成(用 + 連接),例如「2k+3b」。
// 輸入端(表單兩欄 / 視覺化兩個單位節點)分開填,儲存與 PDF 只存單一字串。

export const UNIT_OPTIONS: string[] = [
  ...Array.from({ length: 10 }, (_, i) => `${i + 1}K`),
  ...Array.from({ length: 10 }, (_, i) => `${i + 1}b`),
];

const SEP = "+";

// 兩段 → 單一字串;只有一段就回那一段;兩段皆空回空字串。
export function combineUnit(unit1?: string | null, unit2?: string | null): string {
  const a = (unit1 ?? "").trim();
  const b = (unit2 ?? "").trim();
  if (a && b) return `${a}${SEP}${b}`;
  return a || b || "";
}

// 單一字串 → 兩段(編輯既有單時用)。以第一個 + 切開。
export function splitUnit(unit?: string | null): [string, string] {
  const s = (unit ?? "").trim();
  if (!s) return ["", ""];
  const i = s.indexOf(SEP);
  if (i === -1) return [s, ""];
  return [s.slice(0, i).trim(), s.slice(i + 1).trim()];
}
