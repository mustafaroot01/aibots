import type { MetadataRoute } from "next";

import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default function manifest(): MetadataRoute.Manifest {
  const SITE = getSettings().site_name;
  return {
    name: `${SITE} — فرص عمل`,
    short_name: SITE.slice(0, 12),
    description: "أحدث الشواغر والتعيينات في ديالى والعراق، محدّثة تلقائياً على مدار الساعة.",
    lang: "ar",
    dir: "rtl",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f5f7f8",
    theme_color: "#0b7a5e",
    categories: ["business", "productivity", "news"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "أحدث الوظائف", url: "/" },
      { name: "وظائف بعقوبة", url: "/?q=بعقوبة" },
    ],
  };
}
