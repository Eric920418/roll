// 後台寫入白名單：只接受這些欄位，避免亂寫 id/timestamps。
export const FOUNDER_FIELDS = [
  "slug",
  "companySlug",
  "name",
  "role",
  "blurb",
  "traits",
  "foundedYear",
  "statMarketCap",
  "statSecondary",
  "planningDepth",
  "executionStrength",
  "visionClarity",
  "timeline",
  "businessDetails",
  "order",
  "published",
] as const;

export const QUESTION_FIELDS = [
  "order",
  "dimension",
  "prompt",
  "subtitle",
  "optionA",
  "optionB",
  "optionC",
  "optionD",
  "published",
] as const;

export function pickFields(
  body: Record<string, unknown>,
  fields: readonly string[],
): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const k of fields) if (k in body) data[k] = body[k];
  return data;
}
