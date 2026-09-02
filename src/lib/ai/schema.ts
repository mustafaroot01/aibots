/** عقد الاستخراج المشترك بين كل مزوّدي الذكاء الاصطناعي */
import { z } from "zod";
import { CATEGORIES, EMPLOYMENT_TYPES, GENDERS, type RawPost } from "../types";
import { getSettings } from "../settings";

export const ItemSchema = z.object({
  post_id: z.number().describe("رقم المنشور كما أُعطي لك"),
  is_job: z.boolean().describe("هل المنشور إعلان وظيفة/شاغر حقيقي؟"),
  confidence: z.number().min(0).max(1).describe("ثقتك بالقرار من 0 الى 1"),
  reason: z.string().describe("سبب مختصر جداً للقرار"),
  title: z.string().nullable().describe("المسمى الوظيفي المختصر، مثال: كاشير، مهندس مدني"),
  company: z.string().nullable().describe("اسم الشركة أو المحل أو الجهة"),
  city: z.string().nullable().describe("المحافظة، مثال: ديالى، بغداد"),
  area: z.string().nullable().describe("المنطقة أو القضاء، مثال: بعقوبة، المقدادية"),
  category: z.string().nullable().describe(`واحد من: ${CATEGORIES.join(" / ")}`),
  employment_type: z.string().nullable().describe(`واحد من: ${EMPLOYMENT_TYPES.join(" / ")}`),
  gender: z.string().nullable().describe(`واحد من: ${GENDERS.join(" / ")}`),
  salary: z.string().nullable().describe("الراتب كما ذُكر بالمنشور، فارغ إذا ما مذكور"),
  experience: z.string().nullable().describe("الخبرة المطلوبة"),
  vacancies: z.number().nullable().describe("عدد الشواغر إذا مذكور"),
  phones: z.array(z.string()).describe("أرقام الهاتف بصيغة 07XXXXXXXXX"),
  contacts: z.array(z.string()).describe("وسائل تواصل أخرى: يوزر تلجرام، واتساب، إيميل، رابط"),
  apply_method: z.string().nullable().describe("طريقة التقديم بجملة واحدة"),
  summary: z.string().nullable().describe("ملخص المنشور بجملة أو جملتين بالعربي"),
  tags: z.array(z.string()).describe("من 2 الى 5 كلمات مفتاحية"),
});

export const BatchSchema = z.object({ items: z.array(ItemSchema) });

/** نسخة متساهلة — بعض المزوّدين يحذفون الحقول الفارغة بدل ما يرجعونها null */
export const LenientBatchSchema = z.object({
  items: z.array(
    ItemSchema.partial().extend({
      post_id: z.number(),
      is_job: z.boolean(),
    })
  ),
});

export type ExtractionItem = z.infer<typeof ItemSchema>;

/** مخطط جيمناي (OpenAPI subset) — نفس الحقول بالضبط */
export const GEMINI_SCHEMA = {
  type: "OBJECT",
  properties: {
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          post_id: { type: "NUMBER", description: "رقم المنشور كما أُعطي لك" },
          is_job: { type: "BOOLEAN", description: "هل هو إعلان وظيفة حقيقي؟" },
          confidence: { type: "NUMBER", description: "ثقتك من 0 الى 1" },
          reason: { type: "STRING", description: "سبب مختصر للقرار" },
          title: { type: "STRING", nullable: true, description: "المسمى الوظيفي المختصر" },
          company: { type: "STRING", nullable: true, description: "الشركة أو المحل" },
          city: { type: "STRING", nullable: true, description: "المحافظة" },
          area: { type: "STRING", nullable: true, description: "المنطقة أو القضاء" },
          category: { type: "STRING", nullable: true, enum: [...CATEGORIES] },
          employment_type: { type: "STRING", nullable: true, enum: [...EMPLOYMENT_TYPES] },
          gender: { type: "STRING", nullable: true, enum: [...GENDERS] },
          salary: { type: "STRING", nullable: true },
          experience: { type: "STRING", nullable: true },
          vacancies: { type: "NUMBER", nullable: true },
          phones: { type: "ARRAY", items: { type: "STRING" } },
          contacts: { type: "ARRAY", items: { type: "STRING" } },
          apply_method: { type: "STRING", nullable: true },
          summary: { type: "STRING", nullable: true },
          tags: { type: "ARRAY", items: { type: "STRING" } },
        },
        required: ["post_id", "is_job", "confidence", "reason", "title", "city",
                   "phones", "contacts", "summary", "tags"],
        propertyOrdering: ["post_id", "is_job", "confidence", "reason", "title", "company",
          "city", "area", "category", "employment_type", "gender", "salary", "experience",
          "vacancies", "phones", "contacts", "apply_method", "summary", "tags"],
      },
    },
  },
  required: ["items"],
} as const;

export const SYSTEM = `أنت مُصنِّف ومُستخرِج بيانات لموقع وظائف عراقي.
تستلم منشورات من قناة تلجرام عراقية، وشغلك تقرر أي منشور هو إعلان وظيفة حقيقي، وتستخرج منه بيانات منظمة.

اعتبره وظيفة (is_job = true) إذا:
- يعلن عن شاغر أو حاجة لموظف/عامل/كادر — بأي صيغة كانت:
  «مطلوب»، «محتاجين»، «نريد»، «بحاجة الى»، «نبحث عن»، «تعلن عن حاجتها»، «كادر»، «تعيينات»...
  ولا تشترط كلمة معينة — المهم المعنى.
- يذكر مهنة + جهة أو طريقة تواصل للتقديم.
- **مهم**: كثير منشورات تبدي بتحية لصاحب القناة مثل «السلام عليكم صاحب القناة ياريت
  تنشرلي...» — هذي مقدمة عادية، تجاهلها واحكم على المحتوى اللي بعدها. إذا بعدها إعلان
  شاغر، فهو وظيفة.

اعتبره مو وظيفة (is_job = false) إذا:
- طلب عمل من شخص يدور على شغل ("أدور على عمل"، "خريج وأبحث عن وظيفة").
- إعلان تجاري، بيع، إيجار، دورة مدفوعة، تسويق شبكي، ترويج قناة.
- أخبار، تهاني، أدعية، منشور إداري من القناة، أو نص فارغ/صورة بلا نص.
- عمل مشبوه أو نصب (أرباح خيالية، "اشترك وادفع"، عمل أونلاين بأرباح مبالغ بيها) — خلي is_job=false واذكر السبب.

قواعد الاستخراج:
- خلي الحقول بالعربي، ونظّف الكلام من الحشو والإيموجي.
- title: مسمى وظيفي مختصر وواضح. إذا أكثر من شاغر بمنشور واحد، اجمعهم بعنوان واحد مثل "كادر مطعم (ويتر، مساعد شيف، باريستا)".
- phones: حوّل أي رقم عراقي الى صيغة 07XXXXXXXXX. اذا الرقم بصيغة دولية +9647... حوّله الى 07...
- city: القناة أغلبها من محافظة ديالى، فإذا ما مذكورة محافظة بصراحة وذُكرت منطقة من ديالى (بعقوبة، المقدادية، خانقين، بلدروز، الخالص، جلولاء، السعدية، المنصورية، كنعان، بهرز، العبارة، مندلي) خلي city = "ديالى".
- إذا معلومة مو موجودة بالمنشور، خلي قيمتها null — لا تخمّن ولا تخترع.
- confidence: كون صادق. النص الواضح جداً 0.9+، الغامض 0.4-0.6.

رجّع عنصر واحد لكل منشور، بنفس post_id المُعطى، وبنفس عدد المنشورات.`;

/** برومبت النظام مع إضافات لوحة التحكم */
export function buildSystem(): string {
  const s = getSettings();
  let out = SYSTEM;
  if (s.extra_job_words.length) {
    out += `\n\nكلمات إضافية تدل على وظيفة (اعتبرها مؤشر قبول): ${s.extra_job_words.join("، ")}.`;
  }
  if (s.extra_reject_words.length) {
    out += `\nكلمات إضافية تدل على الرفض (اعتبرها مؤشر رفض): ${s.extra_reject_words.join("، ")}.`;
  }
  if (s.prompt_extra.trim()) {
    out += `\n\nتعليمات إضافية من مدير الموقع:\n${s.prompt_extra.trim()}`;
  }
  return out;
}

/** نص المنشورات المُرسل للموديل */
export function buildUserPrompt(chunk: RawPost[]): string {
  const payload = chunk
    .map((p) => {
      const meta = [
        `post_id: ${p.id}`,
        p.postedAt ? `التاريخ: ${p.postedAt}` : null,
        p.photos.length ? `مرفق ${p.photos.length} صورة` : null,
        p.links.length ? `روابط: ${p.links.join(" , ")}` : null,
      ].filter(Boolean).join(" | ");
      return `<منشور>\n${meta}\nالنص:\n${p.text || "(بدون نص)"}\n</منشور>`;
    })
    .join("\n\n");

  return `صنّف واستخرج البيانات من ${chunk.length} منشور:\n\n${payload}`;
}
