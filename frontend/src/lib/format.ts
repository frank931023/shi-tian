// 顯示用格式化工具。

const twd = new Intl.NumberFormat("zh-TW", {
  style: "currency",
  currency: "TWD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function money(n: number | null | undefined): string {
  if (n === null || n === undefined) return "-";
  return twd.format(n);
}

export function today(): string {
  // 本地時區的 YYYY-MM-DD
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

// 千分位:把數字字串加上逗號(保留小數),空字串回空。供輸入框即時顯示用。
export function groupDigits(s: string): string {
  let cleaned = String(s ?? "").replace(/[^\d.]/g, ""); // 只留數字與小數點
  if (cleaned === "") return "";
  const dot = cleaned.indexOf(".");
  if (dot !== -1) cleaned = cleaned.slice(0, dot + 1) + cleaned.slice(dot + 1).replace(/\./g, ""); // 只留一個小數點
  const [intPart, decPart] = cleaned.split(".");
  const grouped = (intPart || "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return decPart !== undefined ? `${grouped}.${decPart}` : grouped;
}

// 去掉千分位逗號(送出轉數字前用)
export function stripGroups(s: string): string {
  return String(s ?? "").replace(/,/g, "");
}

// 前端即時試算單行金額(顯示用;最終以後端重算為準)
export function lineAmount(quantity: number, unitPrice: number | null | undefined): number {
  const q = Number(quantity) || 0;
  const p = Number(unitPrice) || 0;
  return Math.round(q * p * 100) / 100;
}
