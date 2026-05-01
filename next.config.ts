import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import bundleAnalyzer from "@next/bundle-analyzer";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 days
    // 對齊實際使用裝置（行動 + 桌面），減少 Next 產出多餘尺寸
    deviceSizes: [360, 640, 828, 1080, 1280, 1920],
    imageSizes: [64, 128, 256, 384],
  },
};

export default withBundleAnalyzer(withNextIntl(nextConfig));
