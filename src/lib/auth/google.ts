// 手寫 Google OAuth 2.0（授權碼流程）。僅用 fetch 打 OIDC 端點，無 googleapis 重依賴。
// 與後台 admin auth 共存：用戶 session 走獨立 cookie（見 session.ts）。

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

/** 讀取並驗證 Google OAuth 環境變數；缺一即丟出可讀錯誤（前端會顯示）。 */
export function googleEnv() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Google 登入未設定：請於環境變數設定 GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI",
    );
  }
  return { clientId, clientSecret, redirectUri };
}

/** 組出 Google 同意頁網址。 */
export function buildAuthUrl(state: string): string {
  const { clientId, redirectUri } = googleEnv();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "offline",
    prompt: "select_account",
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export type GoogleProfile = {
  sub: string;
  email: string;
  emailVerified: boolean;
  firstName: string | null;
  lastName: string | null;
  picture: string | null;
};

/** 用授權碼換 access token，再取 userinfo。任何一步失敗都丟出含 HTTP 細節的錯誤。 */
export async function exchangeCodeForProfile(
  code: string,
): Promise<GoogleProfile> {
  const { clientId, clientSecret, redirectUri } = googleEnv();

  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) {
    throw new Error(
      `Google token 交換失敗（HTTP ${tokenRes.status}）：${await tokenRes.text()}`,
    );
  }
  const token = await tokenRes.json();
  const accessToken = token.access_token as string | undefined;
  if (!accessToken) throw new Error("Google 未回傳 access_token");

  const infoRes = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!infoRes.ok) {
    throw new Error(
      `取得 Google 使用者資訊失敗（HTTP ${infoRes.status}）：${await infoRes.text()}`,
    );
  }
  const info = await infoRes.json();
  if (!info.sub || !info.email) {
    throw new Error("Google 使用者資訊缺少 sub 或 email");
  }

  return {
    sub: String(info.sub),
    email: String(info.email).toLowerCase(),
    emailVerified: Boolean(info.email_verified),
    firstName: info.given_name ? String(info.given_name) : null,
    lastName: info.family_name ? String(info.family_name) : null,
    picture: info.picture ? String(info.picture) : null,
  };
}

/** 從 next 路徑前綴反推 locale 前綴（callback 無語系資訊時用）。 */
export function localePrefixFromNext(next: string): "" | "/zh-tw" {
  return next.startsWith("/zh-tw") ? "/zh-tw" : "";
}
