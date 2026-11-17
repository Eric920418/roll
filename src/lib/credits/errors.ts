const messages = {
  CREDITS_LEGACY_FENCED: "舊餘額已封存，請使用點數相容版本後重試；本次未扣款 / Legacy balances are sealed. Retry with the Credits-compatible release; no charge was made.",
  CREDITS_PENDING_HOLDS: "尚有點數預扣，請先完成或取消再刪除帳號 / Complete or cancel pending Credits holds before deleting the account.",
  CREDITS_UNBALANCED: "點數帳本或來源配置不平，交易已取消，請聯絡支援核對 / Credits ledger or allocations do not balance. Transaction cancelled; contact support.",
  CREDITS_IMMUTABLE: "點數收據不可刪改，交易已取消 / Credits receipts cannot be changed or deleted. Transaction cancelled.",
  CREDITS_TERMS_IMMUTABLE: "原點數來源、到期日與預扣內容不可改寫，交易已取消 / Original Credits sources, expiry and hold terms are immutable. Transaction cancelled.",
} as const;
export function creditFailure(error: unknown): { code: string; message: string } | null {
  const seen = new Set<object>();
  function visit(value: unknown, depth: number): keyof typeof messages | null {
    if (!value || typeof value !== "object" || depth > 6 || seen.has(value)) return null;
    seen.add(value);
    const row = value as Record<string, unknown>;
    for (const key of ["message", "originalMessage"]) if (typeof row[key] === "string") for (const code of Object.keys(messages) as (keyof typeof messages)[]) if ((row[key] as string).includes(code + ":")) return code;
    for (const key of ["cause", "meta", "driverAdapterError"]) { const code = visit(row[key], depth + 1); if (code) return code; }
    return null;
  }
  const code = visit(error, 0);
  return code ? { code: code.toLowerCase(), message: messages[code] } : null;
}
