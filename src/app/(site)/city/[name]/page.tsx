import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { facets, searchJobs } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { JsonLd, breadcrumbLd, itemListLd } from "@/lib/seo";
import { JobList } from "@/components/job-list";
import { ChannelCta } from "@/components/channel-cta";
import { ArrowBack } from "@/components/icons";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ name: string }> }): Promise<Metadata> {
  const city = decodeURIComponent((await params).name);
  const s = getSettings();
  const { total } = searchJobs({ city, perPage: 1, page: 1 });
  return {
    title: `وظائف ${city} — ${total} شاغر متاح`,
    description: `أحدث ${total} وظيفة وشاغر في ${city}. تعيينات محدّثة يومياً مع تفاصيل التقديم وأرقام التواصل.`,
    alternates: { canonical: `${s.site_url}/city/${encodeURIComponent(city)}` },
  };
}

export default async function CityPage({
  params, searchParams,
}: { params: Promise<{ name: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const city = decodeURIComponent((await params).name);
  const sp = await searchParams;
  const page = Math.max(1, Number((Array.isArray(sp.page) ? sp.page[0] : sp.page) || 1));
  const cfg = getSettings();

  const { cities } = facets();
  if (!cities.some((c) => c.v === city)) notFound();

  const { rows, total } = searchJobs({ city, page, perPage: cfg.per_page });

  return (
    <>
      <JsonLd data={[
        itemListLd(rows, cfg),
        breadcrumbLd([
          { name: "الرئيسية", url: cfg.site_url },
          { name: `وظائف ${city}`, url: `${cfg.site_url}/city/${encodeURIComponent(city)}` },
        ]),
      ]} />

      <a className="back-link" href="/"><ArrowBack /> كل الوظائف</a>

      <section className="hero" style={{ paddingTop: 6 }}>
        <h1>وظائف {city}</h1>
        <p>{total} شاغر متاح في {city} — محدّثة تلقائياً على مدار الساعة.</p>
      </section>

      <JobList rows={rows} total={total} page={page} perPage={cfg.per_page}
        hidePhones={cfg.hide_phones} basePath={`/city/${encodeURIComponent(city)}`} />

      <ChannelCta channel={cfg.brand_channel} siteName={cfg.site_name} />
    </>
  );
}
