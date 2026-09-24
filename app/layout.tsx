import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const noto = localFont({
  src: [
    { path: "./fontes/NotoSans-Light.woff2", weight: "300" },
    { path: "./fontes/NotoSans-Regular.woff2", weight: "400" },
    { path: "./fontes/NotoSans-SemiBold.woff2", weight: "600" },
    { path: "./fontes/NotoSans-Bold.woff2", weight: "700" },
    { path: "./fontes/NotoSans-ExtraBold.woff2", weight: "800" },
  ],
  variable: "--fonte",
  display: "swap",
});

export const metadata: Metadata = { title: "CRM Veilig", robots: { index: false, follow: false } };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={noto.variable}>
      <body>{children}</body>
    </html>
  );
}
