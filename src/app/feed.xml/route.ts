/** خلاصة RSS — للمتابعين والوكلاء ومجمّعات الأخبار */
import { searchJobs } from "@/lib/db";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

const esc = (s: string) =>
  (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
           .replace(/"/g, "&quot;").replace(/'/g, "&apos;");

export async function GET() {
  const s = getSettings();
  const { rows } = searchJobs({ perPage: 50, page: 1 });

  const items = rows.map((j) => {
    const details = [
      j.company && `الجهة: ${j.company}`,
      (j.city || j.area) && `المكان: ${[j.city, j.area].filter(Boolean).join(" — ")}`,
      j.employment_type && `الدوام: ${j.employment_type}`,
      j.salary && `الراتب: ${j.salary}`,
      !s.hide_phones && j.phones.length && `التواصل: ${j.phones.join(" · ")}`,
    ].filter(Boolean).join(" | ");

    return `    <item>
      <title>${esc(j.title || "إعلان وظيفة")}</title>
      <link>${s.site_url}/job/${j.id}</link>
      <guid isPermaLink="true">${s.site_url}/job/${j.id}</guid>
      <pubDate>${new Date(j.posted_at || Date.now()).toUTCString()}</pubDate>
      ${j.category ? `<category>${esc(j.category)}</category>` : ""}
      <description>${esc(`${details}\n\n${j.summary || ""}`)}</description>
    </item>`;
  }).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(s.site_name)}</title>
    <link>${s.site_url}</link>
    <description>أحدث الشواغر والتعيينات في ديالى والعراق</description>
    <language>ar-iq</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${s.site_url}/feed.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: { "content-type": "application/rss+xml; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}
