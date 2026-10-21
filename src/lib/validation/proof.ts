import "server-only";
import { get } from "@vercel/blob";
import { PlanWriteError } from "@/lib/action-plan/service";
import type { SalesMutation } from "./schema";
export const MAX_PROOF_BYTES = 10 * 1024 * 1024;
export function proofToken() {
  const token = process.env.INVESTOR_BLOB_READ_WRITE_TOKEN;
  if (!token || token === process.env.BLOB_READ_WRITE_TOKEN) throw new PlanWriteError("尚未設定獨立 Private Blob store；證據未儲存，請聯絡管理員 / Private evidence storage is not configured", 503);
  return token;
}
export function proofPrefix(userId: string) { return `commercial-evidence/${userId}/`; }
export function proofPath(userId: string, path: string) { return path.startsWith(proofPrefix(userId)) && /^[-a-zA-Z0-9]+\.(pdf|jpg|jpeg|png)$/.test(path.slice(proofPrefix(userId).length)); }
export function validProofFile(type: string, size: number, bytes: Uint8Array) {
  if (!size || size > MAX_PROOF_BYTES) return false;
  if (type === "application/pdf") return new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
  if (type === "image/jpeg") return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (type === "image/png") return [137,80,78,71,13,10,26,10].every((v, i) => bytes[i] === v);
  return false;
}
export async function verifyProof(userId: string, proof: NonNullable<SalesMutation["proof"]>) {
  if (!proofPath(userId, proof.pathname)) throw new PlanWriteError("證據附件路徑無效 / Invalid evidence attachment", 403);
  const source = await get(proof.pathname, { access: "private", useCache: false, token: proofToken() });
  if (!source || source.statusCode !== 200) throw new PlanWriteError("找不到私密證據 / Private evidence not found", 404);
  const reader = source.stream.getReader();
  const bytes: number[] = [];
  try { while (bytes.length < 8) { const next = await reader.read(); if (next.done) break; bytes.push(...next.value.slice(0, 8 - bytes.length)); } } finally { await reader.cancel(); }
  if (!validProofFile(source.blob.contentType, source.blob.size, new Uint8Array(bytes))) throw new PlanWriteError("附件必須為有效 PDF／JPEG／PNG，且不超過 10 MB / Valid PDF, JPEG or PNG up to 10 MB required", 400);
}
