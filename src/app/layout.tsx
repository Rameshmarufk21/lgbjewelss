import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, DM_Sans } from "next/font/google";
import "./globals.css";
import "@/styles/lgb.css";
import { AppNav } from "@/components/AppNav";
import { RegisterSw } from "@/components/RegisterSw";

const lgbSerif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-lgb-serif",
  display: "swap",
});

const lgbSans = DM_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-lgb-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "LabGrownBox — Orders",
  description: "Lab grown diamonds — casting through setting, catalog, invoices, statements",
  applicationName: "LabGrownBox",
  appleWebApp: { capable: true, title: "LabGrownBox" },
  icons: { icon: "/icon" },
};

export const viewport: Viewport = {
  themeColor: "#0d2b6e",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${lgbSerif.variable} ${lgbSans.variable} h-full antialiased`}>
      <body className="min-h-full [text-size-adjust:100%]">
        <div className={`lgb-shell ${lgbSans.className}`}>
          <RegisterSw />
          <div className="lgb-watermark" aria-hidden />
          <AppNav />
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
