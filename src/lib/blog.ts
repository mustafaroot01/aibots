/**
 * مولّد محتوى المدونة — ينتج محتوى تحفيزي أصلي لطالبي العمل،
 * بأشكال متنوعة حتى ما يمل المتابع، وينشر بالموقع وبالقناة.
 */
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { addBlogPost, getMeta, recentBlogTitles, setMeta, type BlogPost } from "./db";
import { apiKey, hasKey } from "./ai/gemini";
import { acquire } from "./ai/rate";
import { cleanTitle } from "./text";
import type { Settings } from "./settings";

/** أشكال المحتوى — نلف عليهن حتى يكون كل منشور مختلف */
export const FORMATS = [
  { id: "quote",     label: "اقتباس قصير",        brief: "اقتباس قصير قوي (سطر أو سطرين) عن السعي للعمل، بصياغة أصلية مو منقولة من مشاهير." },
  { id: "story",     label: "قصة قصيرة",          brief: "قصة قصيرة واقعية (٤-٦ أسطر) عن شخص عراقي لكى شغل بعد محاولات، بدون أسماء حقيقية، تنتهي بعبرة." },
  { id: "tip",       label: "نصيحة عملية",        brief: "نصيحة عملية قابلة للتطبيق اليوم عن البحث عن عمل أو المقابلة، بخطوات مرقمة قصيرة." },
  { id: "mistake",   label: "خطأ شائع",           brief: "خطأ شائع يسويه طالبو العمل بالعراق وشلون يتجنبونه، بصياغة مباشرة." },
  { id: "cv",        label: "سيرة ذاتية",         brief: "نصيحة محددة عن كتابة السيرة الذاتية تناسب سوق العمل العراقي." },
  { id: "interview", label: "مقابلة عمل",         brief: "شنو يسأل صاحب العمل بالمقابلة وشلون ترد، مثال عملي واحد." },
  { id: "question",  label: "سؤال للتفكير",       brief: "سؤال يخلي القارئ يراجع طريقته بالبحث عن شغل، مع شرح قصير ليش مهم." },
  { id: "skill",     label: "مهارة مطلوبة",       brief: "مهارة مطلوبة بسوق العمل بديالى والعراق وشلون يتعلمها مجاناً." },
  { id: "motivation",label: "تحفيز",              brief: "رسالة تحفيزية صادقة لشخص تعب من الرفض، بدون مبالغة ولا وعود كاذبة." },
  { id: "rights",    label: "حقوق الموظف",        brief: "معلومة عن حقوق العامل بالعراق (عقد، راتب، ساعات دوام) بلغة بسيطة." },
] as const;

const Schema = z.object({
  title: z.string().describe("عنوان جذاب قصير، ٣-٨ كلمات، بدون علامات تنصيص"),
  body: z.string().describe("النص الكامل، ٤٠-١٢٠ كلمة، عربي واضح بلمسة عراقية، بدون هاشتاغات ولا روابط"),
});

const SYSTEM = `أنت كاتب محتوى لموقع وظائف عراقي بمحافظة ديالى، جمهوره شباب وبنات يدورون على شغل.

قواعد الكتابة:
- عربي واضح بلمسة عراقية خفيفة، مو فصحى ثقيلة ولا عامية مبالغ بيها.
- صادق وواقعي — بدون وعود كاذبة ولا كلام إنشائي فارغ.
- محتوى **أصلي** من عندك، مو اقتباسات مشاهير منقولة.
- ما تذكر أي رابط ولا هاشتاغ ولا اسم موقع — النظام يضيفهن لحاله.
- ما تستخدم إيموجي داخل النص.
- خلي النص يفيد شخص عراقي يدور على شغل اليوم، بمعلومة أو زاوية جديدة.
- تجنب تكرار المواضيع اللي انكتبت قبل.`;

let client: GoogleGenAI | null = null;

/** يختار الشكل الجاي بالتناوب حتى تتوزع الأنواع */
function nextFormat(): (typeof FORMATS)[number] {
  const last = getMeta("blog_last_format") || "";
  const i = FORMATS.findIndex((f) => f.id === last);
  const next = FORMATS[(i + 1 + FORMATS.length) % FORMATS.length];
  setMeta("blog_last_format", next.id);
  return next;
}

/** يولّد منشور مدونة جديد */
export async function generatePost(cfg: Settings): Promise<BlogPost> {
  if (!hasKey()) throw new Error("ما موجود مفتاح Gemini — التوليد يحتاجه");

  const fmt = nextFormat();
  const recent = recentBlogTitles(25);

  if (!client) client = new GoogleGenAI({ apiKey: apiKey() });
  await acquire(cfg.ai_rpm);

  const prompt = [
    `اكتب منشوراً من نوع: ${fmt.label}.`,
    fmt.brief,
    recent.length ? `\nعناوين انكتبت قبل — لا تكررها ولا تقاربها:\n${recent.map((t) => "- " + t).join("\n")}` : "",
    cfg.blog_extra.trim() ? `\nتوجيه إضافي من مدير الموقع:\n${cfg.blog_extra.trim()}` : "",
  ].filter(Boolean).join("\n");

  const res = await client.models.generateContent({
    model: cfg.gemini_model,
    contents: prompt,
    config: {
      systemInstruction: SYSTEM,
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING", description: "عنوان قصير جذاب ٣-٨ كلمات" },
          body: { type: "STRING", description: "النص ٤٠-١٢٠ كلمة" },
        },
        required: ["title", "body"],
      } as never,
      temperature: 1.0,          // نرفعها حتى يتنوع
      maxOutputTokens: 2000,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  const text = res.text;
  if (!text) throw new Error("ما رجع نص من الموديل");

  const parsed = Schema.safeParse(JSON.parse(text));
  if (!parsed.success) throw new Error("رد الموديل ما يطابق المخطط");

  const title = cleanTitle(parsed.data.title, 80) || fmt.label;
  const body = parsed.data.body.trim().replace(/\n{3,}/g, "\n\n");
  if (body.length < 40) throw new Error("النص المولّد قصير جداً");

  return addBlogPost({ kind: fmt.id, title, body });
}

/** نص المنشور كما ينرسل للقناة — النص ورابط الموقع فقط */
export function blogMessage(post: BlogPost, cfg: Settings): string {
  const url = `${cfg.site_url}/blog/${post.slug}`;
  const label = FORMATS.find((f) => f.id === post.kind)?.label ?? "";

  return [
    `✨ <b>${escapeHtml(post.title)}</b>`,
    label ? `<i>${escapeHtml(label)}</i>` : "",
    "",
    escapeHtml(post.body),
    "",
    `🔗 ${url}`,
    cfg.blog_footer.trim() ? escapeHtml(cfg.blog_footer.trim()) : "",
    "",
    `<i>${escapeHtml(cfg.bot_disclosure)}</i>`,
  ].filter((l) => l !== undefined).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function escapeHtml(s: string): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ————— الجدولة —————

const KEY_LAST = "blog_last_at";

/** هل حان وقت منشور جديد؟ (نوزع العدد اليومي على ٢٤ ساعة) */
export function isBlogDue(s: Settings): boolean {
  if (!s.blog_enabled) return false;
  const gap = 24 / Math.max(1, s.blog_per_day);
  const last = getMeta(KEY_LAST);
  if (!last) return true;
  return (Date.now() - new Date(last).getTime()) / 3_600_000 >= gap;
}

export function markBlogGenerated() {
  setMeta(KEY_LAST, new Date().toISOString());
}

export function hoursUntilBlog(s: Settings): number {
  const gap = 24 / Math.max(1, s.blog_per_day);
  const last = getMeta(KEY_LAST);
  if (!last) return 0;
  return Math.max(0, gap - (Date.now() - new Date(last).getTime()) / 3_600_000);
}
