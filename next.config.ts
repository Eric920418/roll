import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import bundleAnalyzer from "@next/bundle-analyzer";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { requireDatabaseUrl } from "./src/lib/database-config";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    ] }];
  },
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 days
    // 對齊實際使用裝置（行動 + 桌面），減少 Next 產出多餘尺寸
    deviceSizes: [360, 640, 828, 1080, 1280, 1920],
    imageSizes: [64, 128, 256, 384],
    // CMS 圖片儲存於 Vercel Blob
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
      },
    ],
  },
};

export default function config(phase: string) {
  // Static CMS pages need the selected deployment's database during the build.
  if (phase === PHASE_PRODUCTION_BUILD) requireDatabaseUrl(process.env.DATABASE_URL);
  return withBundleAnalyzer(withNextIntl(nextConfig));
}
