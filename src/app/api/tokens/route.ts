import { memberAccess, memberError, privateOk } from "@/lib/member-http";
import { tokenSnapshot } from "@/lib/tokens/service";
import { expireTokens } from "@/lib/tokens/expiry";
export async function GET(req: Request) {
  try {
    const userId = await memberAccess(); if (typeof userId !== "string") return userId;
    await expireTokens(userId);
    return privateOk(await tokenSnapshot(userId, new URL(req.url).searchParams.get("cursor") || undefined));
  } catch (error) { return memberError(error); }
}
