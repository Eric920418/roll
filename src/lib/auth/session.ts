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
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ["HS256"],
    });
    // 僅接受 admin token，避免 user token 被當成後台 session
    if (payload.role !== "admin" || typeof payload.email !== "string" || !payload.email || !validTimes(payload)) return null;
    return payload as AdminSession;
  } catch {
    return null;
  }
}

// ============================================
// 公開平台用戶 session（與後台 admin 完全隔離：獨立 cookie + role 檢查，共用 AUTH_SECRET）
// ============================================

export const USER_SESSION_COOKIE = "user_session";

export type UserSession = JWTPayload & {
  uid: string;
  email: string;
  role: "user";
  sessionVersion?: number;
};

/** 簽發用戶 session token（payload 帶 User.id，免再以 email 查庫） */
export async function createUserSession(
  uid: string,
  email: string,
  sessionVersion: number,
): Promise<string> {
  return new SignJWT({ uid, email, role: "user", sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
}

/** 驗證用戶 token；無效、過期、或非 user 角色一律回 null */
export async function verifyUserSession(
  token?: string,
): Promise<UserSession | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ["HS256"],
    });
    if (payload.role !== "user" || typeof payload.uid !== "string" || !payload.uid || typeof payload.email !== "string" || !payload.email || !validTimes(payload)) return null;
    if (payload.sessionVersion !== undefined && (!Number.isSafeInteger(payload.sessionVersion) || (payload.sessionVersion as number) < 0)) return null;
    return payload as UserSession;
  } catch {
    return null;
  }
}

function validTimes(payload: JWTPayload): boolean {
  return typeof payload.iat === "number" && typeof payload.exp === "number" &&
    payload.exp > payload.iat && payload.exp - payload.iat <= SESSION_MAX_AGE && payload.iat <= Math.floor(Date.now() / 1000);
}

/** Fixed UTC cutoff, never relative to process start. Missing/invalid configuration rejects legacy tokens. */
export function acceptsSessionVersion(session: UserSession, version: number, now = Date.now()): boolean {
  if (session.sessionVersion !== undefined) return session.sessionVersion === version;
  const value = process.env.AUTH_LEGACY_SESSION_ACCEPT_UNTIL;
  const cutoff = value && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value) ? Date.parse(value) : NaN;
  // Valid signed tokens minted by the old deployment during rollout also remain valid.
  // jwtVerify still enforces their original expiry; this fixed cutoff never extends it.
  return version === 0 && Number.isFinite(cutoff) && now < cutoff;
}
