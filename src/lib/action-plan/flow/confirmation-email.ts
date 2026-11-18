import "server-only";
import { createHash, createHmac } from "node:crypto";
import { pathForLocale } from "@/lib/routes";
import { PlanWriteError } from "../service";

export type MailAttempt = {
  id: string;
  leadId: string;
  version: string;
  recipientHash: string;
  createdAt: string;
  status: "pending" | "accepted" | "failed";
  locale: "zh-tw" | "en";
};

export const mailHash = (value: string) => createHash("sha256").update(value).digest("hex");
export const mailToken = (actionId: string, mail: MailAttempt) => createHmac("sha256", process.env.AUTH_SECRET!).update(actionId + ":" + mail.id).digest("base64url");
const day = 86_400_000;

export function prepareMail(existing: MailAttempt | undefined, mail: MailAttempt, reminder: boolean) {
  if (!existing) return mail;
  const age = Date.parse(mail.createdAt) - Date.parse(existing.createdAt);
  if (existing.status === "accepted") {
    if (!reminder || age < day) {
      if (existing.recipientHash !== mail.recipientHash) throw new PlanWriteError("本輪已寄到其他地址，請核對原地址或稍後使用再次提醒 / An email was already sent to another address. Check the original address or use Remind again later.", 409);
      return existing;
    }
  } else if (existing.status === "pending") {
    if (age >= day - 3_600_000) throw new PlanWriteError("上次寄送狀態未確認，請核對後再聯絡受訪者 / Previous delivery is unconfirmed. Check before contacting the participant again.", 409);
    if (existing.recipientHash !== mail.recipientHash) throw new PlanWriteError("上次寄送尚未確認，請用原收件地址重試 / Retry the unconfirmed send using the same address.", 409);
    return existing;
  }
  return mail;
}

export function assertConfirmationEmailConfigured() {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL || !process.env.AUTH_SECRET)
    throw new PlanWriteError("確認信寄送尚未設定 / Confirmation email is not configured", 503);
}

export async function sendConfirmationEmail(input: { actionId: string; mail: MailAttempt; to: string; statement: string }) {
  const { mail, actionId } = input;
  const zh = mail.locale === "zh-tw";
  const href = new URL(pathForLocale("/task-confirm/" + actionId, mail.locale), process.env.NEXT_PUBLIC_APP_URL || "https://rollon.com.tw");
  href.searchParams.set("token", mailToken(actionId, mail));
  try {
    const result = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + process.env.RESEND_API_KEY, "Content-Type": "application/json", "Idempotency-Key": "nova-positioning/" + mail.id },
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL,
        to: [input.to],
        subject: zh ? "NOVA｜這句話符合您的情況嗎？" : "NOVA | Does this describe your situation?",
        text: (zh ? "您好，邀請您確認以下描述是否符合您在訪談中提到的情況。" : "Please tell us whether this statement describes the situation you discussed in your interview.") + "\n\n" + input.statement + "\n\n" + href.href,
      }),
    });
    if (result.ok) return { status: "accepted" as const, error: "" };
    const knownRejection = [400, 401, 403, 404, 422, 429].includes(result.status);
    return { status: knownRejection ? "failed" as const : "pending" as const, error: zh ? "寄送服務回應 HTTP " + result.status : "Email service returned HTTP " + result.status };
  } catch {
    return { status: "pending" as const, error: zh ? "等待寄送服務逾時或連線失敗，請用原地址重試" : "Email service timed out or was unavailable. Retry with the same address." };
  }
}
