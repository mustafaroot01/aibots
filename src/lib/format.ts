/** صياغة الوقت والروابط بالعربي */

const TZ = "Asia/Baghdad";

function toDate(v: string | number | null): Date | null {
  if (v == null || v === "" || v === 0) return null;
  const d = typeof v === "number" ? new Date(v * 1000) : new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
}

/** جمع عربي صحيح: دقيقة / دقيقتين / دقائق */
function arCount(n: number, one: string, two: string, few: string, many: string): string {
  if (n === 1) return one;
  if (n === 2) return two;
  if (n >= 3 && n <= 10) return `${n} ${few}`;
  return `${n} ${many}`;
}

/** وقت نسبي: "قبل 3 ساعات"، "قبل يومين"... */
export function timeAgo(v: string | number | null): string {
  const d = toDate(v);
  if (!d) return "";
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);

  if (secs < 0) return "الآن";
  if (secs < 60) return "قبل لحظات";

  const mins = Math.floor(secs / 60);
  if (mins < 60) return `قبل ${arCount(mins, "دقيقة", "دقيقتين", "دقائق", "دقيقة")}`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `قبل ${arCount(hours, "ساعة", "ساعتين", "ساعات", "ساعة")}`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `قبل ${arCount(days, "يوم", "يومين", "أيام", "يوماً")}`;

  const months = Math.floor(days / 30);
  if (months < 12) return `قبل ${arCount(months, "شهر", "شهرين", "أشهر", "شهراً")}`;

  const years = Math.floor(months / 12);
  return `قبل ${arCount(years, "سنة", "سنتين", "سنوات", "سنة")}`;
}

/** تاريخ كامل بتوقيت بغداد: "٢ أيلول ٢٠٢٦، ١٢:٣٣ م" */
export function fullDate(v: string | number | null): string {
  const d = toDate(v);
  if (!d) return "";
  return new Intl.DateTimeFormat("ar-IQ", {
    timeZone: TZ,
    dateStyle: "long",
    timeStyle: "short",
  }).format(d);
}

/** منشور خلال آخر 24 ساعة؟ */
export function isFresh(v: string | number | null, hours = 24): boolean {
  const d = toDate(v);
  return !!d && Date.now() - d.getTime() < hours * 3_600_000;
}

export { waLink, prettyPhone } from "./phone";

export function qs(base: Record<string, string | undefined>, patch: Record<string, string | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...base, ...patch })) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `/?${s}` : "/";
}

export function adminQs(path: string, base: Record<string, string | undefined>, patch: Record<string, string | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...base, ...patch })) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `${path}?${s}` : path;
}
