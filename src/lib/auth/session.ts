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
    if (payload.role !== "admin") return null;
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
};

/** 簽發用戶 session token（payload 帶 User.id，免再以 email 查庫） */
export async function createUserSession(
  uid: string,
  email: string,
): Promise<string> {
  return new SignJWT({ uid, email, role: "user" })
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
    if (payload.role !== "user") return null;
    return payload as UserSession;
  } catch {
    return null;
  }
}
