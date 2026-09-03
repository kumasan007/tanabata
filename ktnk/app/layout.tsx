import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "作業予定入力",
  description: "協力会社・職人向け作業予定入力システム",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
