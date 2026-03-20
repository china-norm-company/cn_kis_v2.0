type CsvPrimitive = string | number | boolean | null | undefined;

function toCsvCell(value: CsvPrimitive): string {
  const s = value == null ? "" : String(value);
  // 需要转义：包含逗号/换行/双引号
  if (/[,"\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function downloadCsv(params: { filename: string; headers: string[]; rows: CsvPrimitive[][] }) {
  const { filename, headers, rows } = params;
  const lines: string[] = [];
  lines.push(headers.map(toCsvCell).join(","));
  for (const row of rows) {
    lines.push(row.map(toCsvCell).join(","));
  }
  // 加 BOM，避免 Excel 打开中文乱码
  const content = "\uFEFF" + lines.join("\r\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}


