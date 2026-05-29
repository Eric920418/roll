import { SignJWT, jwtVerify, type JWTPayload } from "jose";

// jose 在 Edge runtime（middleware）與 Node runtime 皆可用，無框架相依
function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET 環境變數未設定");
  return new TextEncoder().encode(secret);
}

export const SESSION_COOKIE = "admin_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 天

export type AdminSession = JWTPayload & { email: string; role: "admin" };

/** 簽發後台 session token */
export async function createSession(email: string): Promise<string> {
  return new SignJWT({ email, role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
}

/** 驗證 token，無效或過期回 null */
export async function verifySession(
  token?: string,
): Promise<AdminSession | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as AdminSession;
  } catch {
    return null;
  }
}
