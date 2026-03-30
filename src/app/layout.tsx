import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ROLL ON.",
  description: "From Visions to Big Impacts.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
