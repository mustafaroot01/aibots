/**
 * الفلترة والتحليل — يدعم أكثر من مزوّد ذكاء اصطناعي.
 * المزوّد يتحدد من لوحة التحكم، وإذا ما موجود مفتاح ينزل تلقائياً للفلترة بالكلمات المفتاحية.
 */
import { CATEGORIES, EMPLOYMENT_TYPES, GENDERS, type Extraction, type RawPost } from "./types";
import { getSettings, type Settings } from "./settings";
import { extractPhones, mergePhones } from "./phone";
import { cleanBody, cleanTitle, shorten } from "./text";
import type { ExtractionItem } from "./ai/schema";
import * as claude from "./ai/claude";
import * as gemini from "./ai/gemini";
import { QuotaExhausted } from "./ai/gemini";

export { cleanTitle };

export type Provider = "claude" | "gemini" | "rules";

const PROVIDERS = { claude, gemini } as const;

/** شنو المزوّد اللي راح يشتغل فعلياً؟ (يراعي وجود المفتاح) */
export function activeProvider(cfg: Settings = getSettings()): Provider {
  if (cfg.ai_provider === "rules") return "rules";
  const wanted = cfg.ai_provider === "gemini" ? "gemini" : "claude";
  if (PROVIDERS[wanted].hasKey()) return wanted;

  // إذا مفتاح المزوّد المختار ناقص، نجرب الثاني قبل ما ننزل للقواعد
  const other = wanted === "claude" ? "gemini" : "claude";
  if (PROVIDERS[other].hasKey()) return other;
  return "rules";
}

/** هل الفلترة الذكية شغالة؟ */
export function hasApiKey(): boolean {
  return activeProvider() !== "rules";
}

export function providerStatus() {
  const cfg = getSettings();
  return {
    selected: cfg.ai_provider,
    active: activeProvider(cfg),
    claudeKey: claude.hasKey(),
    geminiKey: gemini.hasKey(),
    model: cfg.ai_provider === "gemini" ? cfg.gemini_model : cfg.claude_model,
  };
}

/** يصنّف مجموعة منشورات. يرجع Map من post_id الى النتيجة + اسم المُصنِّف المستخدم */
export async function classify(
  posts: RawPost[]
): Promise<{ results: Map<number, Extraction>; classifier: string; quotaExhausted?: boolean }> {
  if (!posts.length) return { results: new Map(), classifier: "none" };

  const cfg = getSettings();
  const provider = activeProvider(cfg);
  if (provider === "rules") {
    return { results: rulesBatch(posts), classifier: "rules" };
  }

  const results = new Map<number, Extraction>();
  let usedFallback = false;
  const batchSize = cfg.claude_batch_size;
  for (let i = 0; i < posts.length; i += batchSize) {
    const chunk = posts.slice(i, i + batchSize);
    try {
      const items = await PROVIDERS[provider].run(chunk, cfg);
      const byId = new Map(chunk.map((c) => [c.id, c]));
      for (const item of items) {
        const src = byId.get(item.post_id);
        if (!src) continue;
        const { post_id, ...rest } = item;
        results.set(post_id, normalize(rest as Extraction, src.text));
      }
    } catch (err) {
      // الحصة اليومية خلصت: نوقف ونخلي الباقي بالانتظار حتى ينصنّفون صح بكرة
      // (أحسن من ما ننشرهم بفلترة ضعيفة ونعلق بيها)
      if (err instanceof QuotaExhausted) {
        console.error(`[classify] ${err.message} — نوقف ونخلي ${posts.length - results.size} منشور بالانتظار`);
        return {
          results,
          classifier: results.size ? (usedFallback ? `${provider}+rules` : provider) : "none",
          quotaExhausted: true,
        };
      }

      console.error(
        `[classify] فشل التصنيف بـ ${provider}، رجعنا للقواعد:`,
        err instanceof Error ? err.message : err
      );
      usedFallback = true;
      for (const [id, e] of rulesBatch(chunk)) results.set(id, e);
    }
  }

  // أي منشور ما رجع له نتيجة — نكمّله بالقواعد
  for (const p of posts) {
    if (!results.has(p.id)) {
      usedFallback = true;
      results.set(p.id, rules(p));
    }
  }

  return { results, classifier: usedFallback ? `${provider}+rules` : provider };
}

/** يثبّت القيم على القوائم المعتمدة حتى ما تنفلت التصنيفات */
function snap<T extends string>(v: string | null, allowed: readonly T[], fallback: T | null = null): T | null {
  if (!v) return null;
  const t = v.trim();
  const hit = allowed.find((a) => a === t) ?? allowed.find((a) => t.includes(a) || a.includes(t));
  return (hit as T) ?? fallback;
}

function normalize(e: Extraction, rawText: string): Extraction {
  return {
    ...e,
    category: snap(e.category, CATEGORIES, "أخرى"),
    employment_type: snap(e.employment_type, EMPLOYMENT_TYPES),
    gender: snap(e.gender, GENDERS),
    confidence: Math.min(1, Math.max(0, e.confidence ?? 0)),
    // الأرقام تنسحب من النص — أدق من أي موديل وما تنخدع بمديات الرواتب
    phones: mergePhones(e.phones, rawText),
    contacts: [...new Set(e.contacts ?? [])].filter((c) => c.length > 2).slice(0, 6),
    tags: [...new Set(e.tags ?? [])].slice(0, 6),
    title: cleanTitle(e.title) || null,
    summary: e.summary?.trim() || shorten(cleanBody(rawText), 190) || null,
  };
}

// ————— الفلترة الاحتياطية بالقواعد (تشتغل بدون API) —————

const JOB_WORDS = ["مطلوب", "نحتاج", "يحتاج", "تعيين", "تعيينات", "شاغر", "شواغر", "فرصة عمل",
  "فرص عمل", "توظيف", "وظيفة", "وظائف", "كادر", "للعمل", "يرجى التقديم", "التقديم"];
const REJECT_WORDS = ["ادور على عمل", "أدور على عمل", "ابحث عن عمل", "أبحث عن عمل", "خريج وابحث",
  "للايجار", "للإيجار", "للبيع", "دورة", "كورس", "اشترك", "ربح", "ارباح", "أرباح", "استثمار"];
const DIYALA_AREAS = ["بعقوبة", "المقدادية", "خانقين", "بلدروز", "الخالص", "جلولاء", "السعدية",
  "المنصورية", "كنعان", "بهرز", "العبارة", "مندلي", "ديالى"];
const CITIES = ["ديالى", "بغداد", "البصرة", "النجف", "كربلاء", "أربيل", "اربيل", "الموصل", "نينوى",
  "كركوك", "الأنبار", "الانبار", "بابل", "واسط", "ميسان", "ذي قار", "المثنى", "القادسية", "صلاح الدين", "دهوك", "السليمانية"];

function rulesBatch(posts: RawPost[]): Map<number, Extraction> {
  return new Map(posts.map((p) => [p.id, rules(p)]));
}

/** عنوان تقريبي من النص لما ما يكون عدنا موديل — أول جملة تخص الوظيفة */
export function rulesTitle(raw: string): string {
  const body = cleanBody(raw);
  const lines = body.split("\n").map((l) => l.trim()).filter((l) => l.length > 5);
  const line = lines.find((l) => JOB_WORDS.some((w) => l.includes(w))) ?? lines[0] ?? "";
  // نوقف عند أول فاصل منطقي حتى ما ياخذ الإعلان كله
  const stop = line.search(/[.•|]|، ال|\s-\s|رقم |للتواصل|العنوان|الراتب/);
  return cleanTitle(stop > 12 ? line.slice(0, stop) : line, 70);
}

export function rules(p: RawPost): Extraction {
  const t = p.text || "";
  const cfg = getSettings();
  const hasJob = [...JOB_WORDS, ...cfg.extra_job_words].some((w) => t.includes(w));
  const hasReject = [...REJECT_WORDS, ...cfg.extra_reject_words].some((w) => t.includes(w));
  const phones = extractPhones(t);

  const city = CITIES.find((c) => t.includes(c))
    ?? (DIYALA_AREAS.some((a) => t.includes(a)) ? "ديالى" : null);
  const area = DIYALA_AREAS.find((a) => t.includes(a) && a !== "ديالى") ?? null;

  const isJob = hasJob && !hasReject && t.length > 25;

  return {
    is_job: isJob,
    confidence: isJob ? (phones.length ? 0.7 : 0.55) : 0.5,
    reason: hasReject ? "كلمات رفض بالنص" : hasJob ? "كلمات دالة على شاغر" : "ما بيه كلمات وظيفة",
    title: isJob ? (rulesTitle(t) || "إعلان وظيفة") : null,
    company: null,
    city,
    area,
    category: null,
    employment_type: null,
    gender: /إناث|نساء|بنات|فتيات/.test(t) ? "إناث" : /ذكور|شباب|رجال/.test(t) ? "ذكور" : null,
    salary: (t.match(/راتب[^\n]{0,40}/) || [null])[0],
    experience: null,
    vacancies: null,
    phones,
    contacts: [...new Set(t.match(/@[A-Za-z0-9_]{4,}/g) || [])],
    apply_method: phones.length ? `التواصل على ${phones[0]}` : null,
    summary: shorten(cleanBody(t), 190) || null,
    tags: [],
  };
}
