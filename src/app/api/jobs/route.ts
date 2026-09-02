/**
 * واجهة عامة للقراءة فقط — وظائف منشورة بصيغة JSON.
 * موجّهة لوكلاء الذكاء والمطوّرين. ما تكشف أي إعداد ولا سر.
 */
import { searchJobs } from "@/lib/db";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const s = getSettings();
  const u = new URL(req.url);
  const limit = Math.min(100, Math.max(1, Number(u.searchParams.get("limit") || 50)));
  const page = Math.max(1, Number(u.searchParams.get("page") || 1));

  const { rows, total } = searchJobs({
    q: u.searchParams.get("q") || undefined,
    city: u.searchParams.get("city") || undefined,
    category: u.searchParams.get("category") || undefined,
    type: u.searchParams.get("type") || undefined,
    perPage: limit,
    page,
  });

  return Response.json({
    site: { name: s.site_name, url: s.site_url, language: "ar-IQ" },
    total,
    page,
    limit,
    updated_at: new Date().toISOString(),
    jobs: rows.map((j) => ({
      id: j.id,
      url: `${s.site_url}/job/${j.id}`,
      title: j.title,
      company: j.company,
      city: j.city,
      area: j.area,
      category: j.category,
      employment_type: j.employment_type,
      gender: j.gender,
      salary: j.salary,
      experience: j.experience,
      vacancies: j.vacancies,
      phones: s.hide_phones ? [] : j.phones,
      apply_method: j.apply_method,
      summary: j.summary,
      tags: j.tags,
      posted_at: j.posted_at,
      description: j.raw_text,
    })),
  }, {
    headers: {
      "cache-control": "public, max-age=300",
      "access-control-allow-origin": "*",
    },
  });
}
