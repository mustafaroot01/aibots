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
  const category = decodeURIComponent((await params).name);
  const s = getSettings();
  const { total } = searchJobs({ category, perPage: 1, page: 1 });
  return {
    title: `وظائف ${category} — ${total} شاغر`,
    description: `أحدث ${total} وظيفة في مجال ${category} بديالى والعراق، مع تفاصيل التقديم وأرقام التواصل.`,
    alternates: { canonical: `${s.site_url}/category/${encodeURIComponent(category)}` },
  };
}

export default async function CategoryPage({
  params, searchParams,
}: { params: Promise<{ name: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const category = decodeURIComponent((await params).name);
  const sp = await searchParams;
  const page = Math.max(1, Number((Array.isArray(sp.page) ? sp.page[0] : sp.page) || 1));
  const cfg = getSettings();

  const { cats } = facets();
  if (!cats.some((c) => c.v === category)) notFound();

  const { rows, total } = searchJobs({ category, page, perPage: cfg.per_page });

  return (
    <>
      <JsonLd data={[
        itemListLd(rows, cfg),
        breadcrumbLd([
          { name: "الرئيسية", url: cfg.site_url },
          { name: category, url: `${cfg.site_url}/category/${encodeURIComponent(category)}` },
        ]),
      ]} />

      <a className="back-link" href="/"><ArrowBack /> كل الوظائف</a>

      <section className="hero" style={{ paddingTop: 6 }}>
        <h1>وظائف {category}</h1>
        <p>{total} شاغر متاح بمجال {category} — محدّثة تلقائياً.</p>
      </section>

      <JobList rows={rows} total={total} page={page} perPage={cfg.per_page}
        hidePhones={cfg.hide_phones} basePath={`/category/${encodeURIComponent(category)}`} />

      <ChannelCta channel={cfg.brand_channel} siteName={cfg.site_name} />
    </>
  );
}
