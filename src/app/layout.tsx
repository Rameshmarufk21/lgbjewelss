import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import "@/styles/lgb.css";
import { RegisterSw } from "@/components/RegisterSw";
import { LayoutShell } from "@/components/LayoutShell";

// Stitch UI font — used for both body and display (no serif).
const lgbSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
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
  robots: { index: false, follow: false, nocache: true },
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
    <html lang="en" className={`${lgbSans.variable} h-full antialiased`}>
      <body className="min-h-full [text-size-adjust:100%]">
        <div className={`lgb-shell ${lgbSans.className}`}>
          <RegisterSw />
          <LayoutShell>{children}</LayoutShell>
        </div>
      </body>
    </html>
  );
}
