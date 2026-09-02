/** تسجيل زيارة بدون أي بيانات شخصية — بصمة مجهولة تتغير كل يوم */
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { baghdadDay, trackVisit } from "./db";

export async function recordVisit() {
  try {
    const h = await headers();
    const ua = h.get("user-agent") || "";

    // نتجاهل الزواحف حتى ما تلخبط العداد
    if (/bot|crawler|spider|crawl|slurp|bingpreview|facebookexternalhit|headless|curl|wget|python-|node-fetch|axios/i.test(ua)) {
      return;
    }

    const ip = (h.get("x-forwarded-for") || "").split(",")[0].trim() || h.get("x-real-ip") || "local";
    // الهاش يتضمن اليوم، فالبصمة ما تلاحق أحد بين الأيام
    const fp = createHash("sha256").update(`${ip}|${ua}|${baghdadDay()}`).digest("hex").slice(0, 24);
    trackVisit(fp);
  } catch {
    /* ما نخلي فشل العداد يكسر الصفحة */
  }
}
