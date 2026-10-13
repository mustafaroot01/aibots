/** أدوات تنظيف النصوص العربية — مشتركة بين الفلترة والنشر */

const PLEA = /(صاحب القناة|الادمن|الأدمن|ادمن القناة|ممكن تنشر|ممكن النشر|ياريت تنشر|رجاء النشر|رجاءً النشر|أرجو النشر|ارجو النشر|للنشر|تنشرلي|تنشرون|تنشرها)/;

/** تحية مباشرة لصاحب القناة: «السلام عليكم اخي…» — مقدمة مو محتوى */
const GREETING = /^\s*(السلام عليكم|سلام عليكم|مساء الخير|صباح الخير|هلو|هلا|مرحبا|مرحباً|تحية)[^\n]{0,40}?(اخي|أخي|اخوي|استاذ|أستاذ|ادمن|أدمن|صاحب|حبيبي|عزيزي)?/;
const JOB_START = /(مطلوب|مطلوبين|محتاج|محتاجين|نحتاج|يحتاج|تحتاج|نريد|بحاجة|بحاجه|تعلن|يعلن|نعلن|فرصة عمل|فرص عمل|شاغر|شواغر|وظيفة|وظائف|نبحث عن|تعيينات|كادر|للعمل)/;

/** يشيل مخاطبة صاحب القناة والفراغات الزايدة من نص الإعلان */
export function cleanBody(raw: string): string {
  let text = (raw || "").trim();

  // مخاطبة أو تحية داخل نفس السطر: نبدي من أول كلمة تخص الوظيفة
  const head = text.slice(0, 160);
  if (PLEA.test(head) || GREETING.test(head)) {
    const m = JOB_START.exec(text.slice(0, 300));
    if (m && m.index > 0) text = text.slice(m.index);
  }

  // مخاطبة بسطر مستقل
  const lines = text.split("\n");
  while (lines.length > 1) {
    const first = lines[0].trim();
    if (!first || (first.length <= 140 && PLEA.test(first) && !JOB_START.test(first))) lines.shift();
    else break;
  }

  return lines
    .join("\n")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** يقصّ نص عند حدود كلمة */
export function cutWords(text: string, max: number, ellipsis = "…"): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const stop = Math.max(cut.lastIndexOf("\n"), cut.lastIndexOf(" "));
  return (stop > max * 0.5 ? cut.slice(0, stop) : cut).trim() + ellipsis;
}

/** ينظّف المسمى الوظيفي: يشيل الإيموجي والزخارف ويقصّه بحدود الكلمة */
export function cleanTitle(raw: string | null | undefined, max = 80): string {
  const t = (raw || "")
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{20E3}]/gu, " ")
    .replace(/[*_~`|]+/g, " ")
    .replace(/^[\s\-—•.:،,]+|[\s\-—•.:،,]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return t.length <= max ? t : cutWords(t, max, "");
}

/** ملخص قصير من نص طويل */
export function shorten(t: string, max: number): string {
  return cutWords((t || "").replace(/\n+/g, " ").trim(), max);
}
