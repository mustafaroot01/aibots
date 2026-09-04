/**
 * منشور دوري للقناة — اقتباس تشجيعي لطالبي العمل + وظيفة مختارة،
 * مع إفصاح واضح إن الناشر بوت مو إنسان.
 */
import { db, getMeta, searchJobs, setMeta } from "./db";
import { escapeHtml } from "./publisher";
import type { JobRow } from "./types";
import type { Settings } from "./settings";

/** اقتباسات افتراضية — تتعدل كلها من لوحة التحكم */
export const DEFAULT_QUOTES = [
  "الوظيفة اللي تدور عليها ممكن تكون بمنشور اليوم — لا تفوّت المتابعة.",
  "كل رفض يقرّبك خطوة للقبول الصح. استمر بالتقديم.",
  "ما موجود شغل صغير — موجود بداية صغيرة تكبر بيدك.",
  "جهّز سيرتك الذاتية اليوم، لأن الفرصة ما تنتظر لما تجهز.",
  "اللي يقدّم على عشر وظائف أحسن حظاً من اللي ينتظر وحدة تجيه.",
  "الخبرة تبدي من أول يوم دوام، مو من أول شهادة.",
  "لا تستصغر أي فرصة — أغلب المدراء بدوا من أسفل السلم.",
  "الرزق ما ينقص بالسعي، بس ينقص بالانتظار.",
  "قدّم حتى لو الشروط ما تنطبق عليك كلها — القرار مو قرارك.",
  "الوظيفة المناسبة موجودة، بس تحتاج تشوفها قبل غيرك.",
  "حدّث رقم هاتفك بسيرتك — أكثر فرصة تضيع بسبب رقم قديم.",
  "الالتزام بالموعد بأول مقابلة يحكي عنك أكثر من شهادتك.",
  "دوّر بمنطقتك أول — أغلب أصحاب العمل يفضّلون القريب.",
  "إذا ما لكيت شغل بمجالك، ابدأ بأي شغل — الشبكة تنبني بالعمل.",
  "اسأل عن الراتب بأدب قبل ما تباشر، هذا حقك مو عيب.",
];

const KEY_LAST = "promo_last_at";
const KEY_USED = "promo_used_quotes";

/** هل حان وقت المنشور الدوري؟ */
export function isPromoDue(s: Settings): boolean {
  if (!s.promo_enabled || !s.publish_enabled) return false;
  const last = getMeta(KEY_LAST);
  if (!last) return true;
  const hours = (Date.now() - new Date(last).getTime()) / 3_600_000;
  return hours >= s.promo_interval_hours;
}

/** يختار اقتباس ما انستعمل مؤخراً */
function pickQuote(quotes: string[]): string {
  if (!quotes.length) return DEFAULT_QUOTES[0];
  let used: string[] = [];
  try { used = JSON.parse(getMeta(KEY_USED) || "[]"); } catch { used = []; }

  const fresh = quotes.filter((q) => !used.includes(q));
  const pool = fresh.length ? fresh : quotes;      // دارت الدورة، نبدي من جديد
  const chosen = pool[Math.floor(Math.random() * pool.length)];

  const nextUsed = [...(fresh.length ? used : []), chosen].slice(-Math.max(1, quotes.length - 1));
  setMeta(KEY_USED, JSON.stringify(nextUsed));
  return chosen;
}

/** يختار وظيفة حديثة للإرفاق — يفضّل اللي ما انرسلت بمنشور دوري قبل */
function pickJob(): JobRow | null {
  const { rows } = searchJobs({ perPage: 12, page: 1 });
  if (!rows.length) return null;
  const withPhone = rows.filter((j) => j.phones.length);
  const pool = withPhone.length ? withPhone : rows;
  return pool[Math.floor(Math.random() * Math.min(pool.length, 6))];
}

export interface PromoContent { text: string; photo?: string }

/** يبني نص المنشور الدوري */
export function buildPromo(s: Settings): PromoContent | null {
  const quotes = s.promo_quotes.length ? s.promo_quotes : DEFAULT_QUOTES;
  const quote = pickQuote(quotes);
  const job = s.promo_include_job ? pickJob() : null;

  const lines: string[] = [];
  lines.push("💡 <b>كلمة اليوم</b>");
  lines.push("");
  lines.push(`«${escapeHtml(quote)}»`);

  if (job) {
    lines.push("");
    lines.push("━━━━━━━━━━━━━━━");
    lines.push("");
    lines.push("💼 <b>وظيفة من موقعنا</b>");
    lines.push("");
    lines.push(`<b>${escapeHtml(job.title || "إعلان وظيفة")}</b>`);

    const bits = [
      job.company && `🏢 ${job.company}`,
      (job.city || job.area) && `📍 ${[job.city, job.area].filter(Boolean).join(" — ")}`,
      job.salary && `💰 ${job.salary}`,
    ].filter(Boolean) as string[];
    for (const b of bits) lines.push(escapeHtml(b));

    if (s.publish_include_phones && job.phones.length) {
      lines.push(`📞 ${escapeHtml(job.phones.join(" · "))}`);
    }
    if (s.site_url) lines.push(`\n🔗 ${s.site_url}/job/${job.id}`);
  }

  if (s.site_url) {
    lines.push("");
    lines.push(`🔎 كل وظائف ديالى: ${s.site_url}`);
  }
  if (s.promo_footer.trim()) {
    lines.push(escapeHtml(s.promo_footer.trim()));
  }

  // الإفصاح — إلزامي وما ينشال
  lines.push("");
  lines.push(`<i>${escapeHtml(s.bot_disclosure || DEFAULT_DISCLOSURE)}</i>`);

  const text = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { text, photo: job && s.promo_include_photo ? job.photos[0] : undefined };
}

export const DEFAULT_DISCLOSURE =
  "🤖 هذا منشور آلي — ينشره بوت وليس إنسان. الإعلانات منقولة كما نُشرت ولا نضمن صحتها.";

export function markPromoSent() {
  setMeta(KEY_LAST, new Date().toISOString());
}

export function lastPromoAt(): string | null {
  return getMeta(KEY_LAST);
}

/** كم باقي على المنشور الجاي (بالساعات) */
export function hoursUntilPromo(s: Settings): number {
  const last = getMeta(KEY_LAST);
  if (!last) return 0;
  const passed = (Date.now() - new Date(last).getTime()) / 3_600_000;
  return Math.max(0, s.promo_interval_hours - passed);
}
