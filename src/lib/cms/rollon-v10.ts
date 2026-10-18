/** Fixed PDF image slots. Settings only replace assets, never change the page structure. */
export const rollonPages = {
  home: { label: "首頁 Home", path: "/", namespace: "HomeV10" },
  approach: { label: "合作方式 Approach", path: "/approach", namespace: "ApproachV10" },
  cases: { label: "案例 Case studies", path: "/cases", namespace: "CasesV10" },
  taiwan: { label: "台灣 Taiwan", path: "/taiwan", namespace: "TaiwanV10" },
  about: { label: "關於 About", path: "/about", namespace: "AboutV10" },
} as const;
export type RollonCmsPage = keyof typeof rollonPages;
export type RollonAsset = { name: string; label: string; src: string };
const asset = (src: string, label: string): RollonAsset => ({ name: src.split("/").pop()!.replace(/\.[^.]+$/, ""), label, src });
const photo = (name: string, label: string) => asset(`/rollon-v10/${name}.jpg`, label);
export const rollonAssets: Record<RollonCmsPage, RollonAsset[]> = {
  home: [asset("/home-v10/taipei-101.jpg", "首屏：台北 101"), asset("/Medix.png", "客戶 Logo：Medix"), asset("/Max.png", "客戶 Logo：HBO Max"), asset("/inspo.png", "客戶 Logo：INSPO"), asset("/Teotihuacan.png", "客戶 Logo：Teotihuacan"), asset("/IMG_0418.JPG", "Medix 案例照片")],
  approach: [asset("/rollon-v10/day1-logo.png", "day1 Logo"), asset("/rollon-v10/project-ark-logo.png", "Project Ark Logo"), asset("/nova/logo-metal.png", "NOVA Logo")],
  cases: [
    asset("/IMG_0418.JPG", "Medix 01：展會"),
    ...["medix-florida-trip", "medix-taipei-booth", "medix-taipei-visitors", "medix-vietnam-market", "medix-vietnam-pharmacy", "medix-vietnam-hospital", "medix-hong-kong-fair", "medix-cambodia", "medix-turkey", "medix-taiwan-spca", "medix-straykind"].map((name, i) => photo(name, `Medix ${String(i + 2).padStart(2, "0")}：${["佛羅里達", "台北攤位", "台北訪客", "越南市場", "越南藥局", "越南醫院", "香港展會", "柬埔寨", "土耳其", "Taiwan SPCA", "StrayKind"][i]}`)),
    ...[1, 2].map(i => photo(`enspyre-partnership-${i}`, `Enspyre 合作 ${i}`)),
    ...[1, 2].map(i => photo(`startup-terrace-${i}`, `林口新創園 ${i}`)),
    ...[1, 2, 3].map(i => photo(`ieat-medical-${i}`, `IEAT 醫療論壇 ${i}`)),
    ...[1, 2, 3, 4].map(i => photo(`taiwan-digital-festival-${i}`, `台灣數位祭 ${i}`)),
    photo("shark-tank-taiwan", "Shark Tank Taiwan"), photo("prochile-visit", "ProChile 參訪"),
    ...["enspyre", "deloitte", "ma", "geber", "prochile"].map(name => asset(`/rollon-v10/${name}-logo.png`, `合作夥伴 Logo：${name}`)),
  ],
  taiwan: [photo("asia-founders-club", "Asia Founders Club"), photo("golden-ticket", "Golden Ticket")],
  about: [photo("vivian-lee", "團隊：Vivian Lee"), photo("vincent", "團隊：Vincent"), photo("iris", "團隊：Iris")],
};
export const rollonSettingKey = (page: RollonCmsPage) => `rollonV10.${page}`;
export function isRollonPage(value: unknown): value is RollonCmsPage {
  return typeof value === "string" && Object.hasOwn(rollonPages, value);
}
export function validRollonAsset(value: unknown, fallback: string): value is string {
  if (typeof value !== "string") return false;
  if (value === "" || value === fallback) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/i.test(url.hostname) && !url.username && !url.password && !url.port;
  } catch { return false; }
}
export function validateRollonAssets(page: RollonCmsPage, value: Record<string, unknown>): string[] {
  return Object.entries(value).flatMap(([name, src]) => {
    const slot = rollonAssets[page].find(item => item.name === name);
    if (!slot) return [`未知圖片欄位：${name}`];
    return validRollonAsset(src, slot.src) ? [] : [`${slot.label}：請使用原始素材或上傳至 Vercel Blob 的圖片網址`];
  });
}
export function resolveRollonAsset(page: RollonCmsPage, values: Record<string, unknown>, src: string): string {
  const slot = rollonAssets[page].find(item => item.src === src);
  const value = slot ? values[slot.name] : undefined;
  return typeof value === "string" && value && validRollonAsset(value, src) ? value : src;
}
