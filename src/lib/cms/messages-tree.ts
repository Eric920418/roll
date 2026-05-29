type Json = Record<string, unknown>;

/** 將巢狀 messages 攤平成 { "Namespace.key.sub": "葉節點字串" } */
export function flatten(obj: Json, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(obj ?? {})) {
    const value = obj[key];
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(out, flatten(value as Json, path));
    } else if (typeof value === "string") {
      out[path] = value;
    }
  }
  return out;
}

// 防原型污染：拒絕危險鍵（呼叫端已驗證，這裡為縱深防禦）
const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** 在巢狀物件依 dot-path 寫入值（path 不存在時建立） */
export function setIn(obj: Json, path: string, value: string): void {
  const keys = path.split(".");
  if (keys.some((k) => DANGEROUS_KEYS.has(k))) return;
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (!Object.prototype.hasOwnProperty.call(cur, k) || typeof cur[k] !== "object" || Array.isArray(cur[k])) {
      cur[k] = {};
    }
    cur = cur[k] as Json;
  }
  cur[keys[keys.length - 1]] = value;
}
