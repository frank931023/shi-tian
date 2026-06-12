// 接收單位(receiver)的「加工方式」工具。
// proccessMethod 存在 company.detail 裡(原始碼沿用雙 c 拼法),
// 值可能帶括號註記,如「铣角(筌振)」;分類時取括號前的基底字串。
import type { Company } from "./types";

// 取某接收單位的加工方式基底分類(去掉括號註記後 trim);沒有則回空字串
export function receiverMethod(c: Company): string {
  const raw = c.detail && typeof c.detail.proccessMethod === "string" ? c.detail.proccessMethod : "";
  return raw.replace(/[((].*$/, "").trim();
}

// 從一群接收單位蒐集所有出現過的加工方式基底分類(去重、依繁中排序)
export function receiverMethodOptions(receivers: Company[]): string[] {
  return Array.from(new Set(receivers.map(receiverMethod).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, "zh-Hant"));
}
