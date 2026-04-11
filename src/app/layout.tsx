import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

const dbHeavent = localFont({
  src: [
    { path: "../../public/fonts/db_heavent_li_v3.2-webfont.woff", weight: "300", style: "normal" },
    { path: "../../public/fonts/db_heavent_v3.2-webfont.woff", weight: "400", style: "normal" },
    { path: "../../public/fonts/db_heavent_med_v3.2-webfont.woff", weight: "500", style: "normal" },
    { path: "../../public/fonts/db_heavent_bd_v3.2-webfont.woff", weight: "700", style: "normal" },
  ],
  variable: "--font-db-heavent",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Solar Sales App",
  description: "Sena Solar Energy - Sales Management",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Solar Sales",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#1ed0c7",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" className={`h-full ${dbHeavent.variable}`}>
      <body className="h-full bg-white font-sans">{children}</body>
    </html>
  );
}
