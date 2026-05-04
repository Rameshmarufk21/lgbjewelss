import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, DM_Sans } from "next/font/google";
import "./globals.css";
import "@/styles/lgb.css";
import { AppNav } from "@/components/AppNav";
import { AppFooter } from "@/components/AppFooter";
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
  title: {
    default: "LabGrownBox — Orders",
    template: "%s · LabGrownBox",
  },
  description:
    "Internal jewelry-operations app for LabGrownBox: order intake, AI invoice extraction, stone memos, and a live dashboard.",
  applicationName: "LabGrownBox",
  appleWebApp: { capable: true, title: "LabGrownBox" },
  icons: { icon: "/icon" },
  authors: [{ name: "LabGrownBox, Inc.", url: "https://labgrownbox.com" }],
  creator: "LabGrownBox, Inc.",
  publisher: "LabGrownBox, Inc.",
  // Internal app — not for public discovery.
  robots: { index: false, follow: false, nocache: true },
  // Useful for the browser tab + PWA install screen.
  formatDetection: { telephone: false, date: false, email: false, address: false },
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
          <AppFooter />
        </div>
      </body>
    </html>
  );
}
