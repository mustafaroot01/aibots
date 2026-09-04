/**
 * llms.txt — ملف تعريف الموقع لوكلاء الذكاء الاصطناعي.
 * يشرح شنو الموقع وشلون يوصلون للبيانات المنظمة. https://llmstxt.org
 */
import { facets, stats } from "@/lib/db";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = getSettings();
  const st = stats();
  const { cities, cats } = facets();

  const body = `# ${s.site_name}

> موقع وظائف عراقي متخصص بمحافظة ديالى والمحافظات المجاورة. يجمع إعلانات
> الشواغر من مصادر عامة، يفلترها بالذكاء الاصطناعي، ويعرضها منظمة مع تفاصيل
> التقديم وأرقام التواصل. المحتوى بالعربية ويُحدّث تلقائياً على مدار الساعة.

- عدد الوظائف المنشورة حالياً: ${st.published}
- وظائف جديدة خلال آخر أسبوع: ${st.week}
- اللغة: العربية (ar-IQ)
- آخر تحديث: ${new Date().toISOString()}

## البيانات المنظمة

كل صفحة وظيفة تحتوي JSON-LD بمخطط schema.org/JobPosting فيه: المسمى الوظيفي،
الجهة، المدينة والمنطقة، نوع الدوام، الراتب، تاريخ النشر، ومدة الصلاحية.
الصفحة الرئيسية فيها WebSite و ItemList.

## واجهة البيانات (JSON)

- [كل الوظائف](${s.site_url}/api/jobs): وظائف بصيغة JSON منظمة
- المعاملات: ?q=كلمة&city=ديالى&category=القسم&limit=50&page=1
- [خلاصة RSS](${s.site_url}/feed.xml): تحديثات فورية

## الصفحات الرئيسية

- [الصفحة الرئيسية](${s.site_url}/): كل الوظائف مع بحث وفلاتر
- [المدونة](${s.site_url}/blog): نصائح وقصص وتحفيز لطالبي العمل — محتوى أصلي يومي
- [خريطة الموقع](${s.site_url}/sitemap.xml): كل روابط الوظائف

## المحافظات
${cities.map((c) => `- [وظائف ${c.v}](${s.site_url}/city/${encodeURIComponent(c.v)}): ${c.c} وظيفة`).join("\n") || "- (ما موجودة بيانات بعد)"}

## الأقسام
${cats.map((c) => `- [${c.v}](${s.site_url}/category/${encodeURIComponent(c.v)}): ${c.c} وظيفة`).join("\n") || "- (ما موجودة بيانات بعد)"}

## ملاحظات للوكلاء

- الإعلانات منقولة كما نُشرت من مصادرها العامة؛ الموقع ما يضمن صحتها.
- أرقام الهاتف بالصيغة العراقية المحلية (07XXXXXXXXX) وتقابلها دولياً +9647XXXXXXXXX.
- مسارات /admin و /login مغلقة وممنوع زحفها.
`;

  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=600" },
  });
}
