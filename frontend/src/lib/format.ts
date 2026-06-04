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

// 前端即時試算單行金額(顯示用;最終以後端重算為準)
export function lineAmount(quantity: number, unitPrice: number | null | undefined): number {
  const q = Number(quantity) || 0;
  const p = Number(unitPrice) || 0;
  return Math.round(q * p * 100) / 100;
}
