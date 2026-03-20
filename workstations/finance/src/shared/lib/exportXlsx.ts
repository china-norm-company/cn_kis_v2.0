import * as XLSX from "xlsx";

export type XlsxCell = string | number | boolean | Date | null | undefined;

/** 将任意值转为 XlsxCell，数组用 "、" 连接，对象转字符串 */
export function toCell(v: unknown): XlsxCell {
  if (v == null) return undefined;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean" || v instanceof Date) return v;
  if (Array.isArray(v)) return v.map(String).join("、");
  return String(v);
}

/** 将单元格值规范为 xlsx 可安全序列化的类型（社区版对复杂对象/样式支持有限） */
function sanitizeCell(v: XlsxCell): string | number | boolean {
  if (v == null || v === "") return "";
  if (typeof v === "number" || typeof v === "boolean") return v;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

export function downloadXlsx(params: { filename: string; sheetName?: string; headers: string[]; rows: XlsxCell[][] }) {
  const { filename, sheetName = "Sheet1", headers, rows } = params;

  // 仅使用基础类型，避免 xlsx 社区版序列化时报错
  const data: (string | number | boolean)[][] = [
    headers.map(sanitizeCell),
    ...rows.map((row) => row.map(sanitizeCell)),
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);

  const wb = XLSX.utils.book_new();
  // 表名不能包含 \ / ? * [ ]，且长度有限
  const safeName = String(sheetName).replace(/[\/*?:\[\]\\]/g, "").slice(0, 31) || "Sheet1";
  XLSX.utils.book_append_sheet(wb, ws, safeName);

  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}


