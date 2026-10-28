import { memberError, privateOk } from "@/lib/member-http";
import { unsubscribe } from "@/lib/network/notifications";
export async function GET() { return Response.json({ error: "請使用確認頁或一鍵退訂 POST / Use the confirmation page or one-click POST", code: "confirmation_required" }, { status: 405 }); }
export async function POST(req: Request) {
  try {
    const token = new URL(req.url).searchParams.get("token") || (req.headers.get("content-type")?.includes("application/json") ? (await req.json()).token : "");
    return privateOk(await unsubscribe(typeof token === "string" ? token : ""));
  } catch (error) { return memberError(error); }
}
