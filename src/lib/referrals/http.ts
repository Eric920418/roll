import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { failFromError } from "@/lib/api";
import { ReferralError } from "./policy";
export function referralFailure(error: unknown) {
  let message: string, status: number, code: string;
  if (error instanceof ReferralError) { message = error.message; status = error.status; code = error.code; }
  else if (error instanceof z.ZodError || error instanceof SyntaxError) { message = error instanceof z.ZodError ? error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("\n") : "無效 JSON / Invalid JSON"; status = 400; code = "invalid_input"; }
  else { const response = failFromError(error); response.headers.set("Cache-Control", "private, no-store"); return response; }
  return NextResponse.json({ error: message, code, requestId: randomUUID() }, { status, headers: { "Cache-Control": "private, no-store" } });
}
export function referralOk<T>(data: T, status = 200) { return NextResponse.json({ data }, { status, headers: { "Cache-Control": "private, no-store" } }); }
