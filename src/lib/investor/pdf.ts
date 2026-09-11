export const MAX_INVESTOR_PDF_BYTES = 10 * 1024 * 1024;

export function validateInvestorPdf(input: {
  name: string;
  type: string;
  size: number;
  header: string;
}): string | null {
  if (input.size <= 0 || input.size > MAX_INVESTOR_PDF_BYTES) {
    return "PDF 必須小於或等於 10 MB。";
  }
  if (input.type !== "application/pdf" || !input.name.toLowerCase().endsWith(".pdf")) {
    return "只接受副檔名為 .pdf 且 MIME 為 application/pdf 的檔案。";
  }
  return input.header === "%PDF-" ? null : "檔案內容不是有效的 PDF。";
}
