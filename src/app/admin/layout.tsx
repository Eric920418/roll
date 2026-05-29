import type { Metadata } from "next";
import "../globals.css";

export const metadata: Metadata = {
  title: "ROLL ON. CMS",
  robots: { index: false, follow: false }, // 後台不應被索引
};

// 後台位於 [locale] 之外，需自備 html/body（root layout 僅回傳 children）
export default function AdminRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-Hant" suppressHydrationWarning>
      <body className="min-h-screen bg-neutral-100 text-neutral-900 antialiased">
        {children}
      </body>
    </html>
  );
}
