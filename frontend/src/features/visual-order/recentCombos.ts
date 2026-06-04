// 「最近使用的品項組合」前端暫存(localStorage)。
// 這台電腦、這個瀏覽器記得你最近用過的 品名+規格+加工+數量+單位 組合,
// 之後可從側欄一次拖出來,加快建單。換電腦/清快取就會消失(之後可改後端歷史)。

export interface Combo {
  product_name: string;
  spec: string;
  process_item: string;
  quantity: string;
  unit: string;
}

const KEY = "shitian.recentCombos";
const MAX = 12;

export function loadRecent(): Combo[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Combo[]) : [];
  } catch {
    return [];
  }
}

function comboKey(c: Combo): string {
  return [c.product_name, c.spec, c.process_item, c.unit].join("");
}

// 存入一筆(去重,最新的排最前面)
export function pushRecent(combos: Combo[]): Combo[] {
  const existing = loadRecent();
  const merged: Combo[] = [];
  const seen = new Set<string>();
  for (const c of [...combos, ...existing]) {
    if (!c.product_name.trim()) continue;
    const k = comboKey(c);
    if (seen.has(k)) continue;
    seen.add(k);
    merged.push(c);
    if (merged.length >= MAX) break;
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(merged));
  } catch {
    /* localStorage 滿了就略過 */
  }
  return merged;
}
