import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Threadpick Inventory",
  description: "Vintage clothing inventory and sales management",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
