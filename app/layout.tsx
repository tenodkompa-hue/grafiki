import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chatelier Schedule Analyzer",
  description: "Analiza obsady godzinowej na podstawie zdjęć grafiku.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl">
      <body>{children}</body>
    </html>
  );
}
