import type { Metadata, Viewport } from "next";
import { Cairo } from "next/font/google";
import { PwaRegister } from "@/components/pwa";
import { getSettings } from "@/lib/settings";
import "./globals.css";

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-cairo",
});

export async function generateMetadata(): Promise<Metadata> {
  const s = getSettings();
  const desc = `أحدث الشواغر والتعيينات في ديالى والعراق — ${s.site_name}. وظائف محدّثة على مدار الساعة مع تفاصيل التقديم وأرقام التواصل.`;
  return {
    metadataBase: new URL(s.site_url),
    title: { default: `${s.site_name} — أحدث فرص العمل`, template: `%s | ${s.site_name}` },
    description: desc,
    applicationName: s.site_name,
    manifest: "/manifest.webmanifest",
    appleWebApp: { capable: true, title: s.site_name, statusBarStyle: "default" },
    formatDetection: { telephone: true },
    openGraph: {
      type: "website",
      locale: "ar_IQ",
      siteName: s.site_name,
      title: `${s.site_name} — أحدث فرص العمل`,
      description: desc,
    },
    icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f7f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0e12" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={cairo.variable}>
      <body style={{ fontFamily: "var(--font-cairo), system-ui, sans-serif" }}>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
