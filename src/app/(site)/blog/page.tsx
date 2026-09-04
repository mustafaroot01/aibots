import type { Metadata } from "next";
import { listBlog } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { FORMATS } from "@/lib/blog";
import { timeAgo } from "@/lib/format";
import { JsonLd, breadcrumbLd } from "@/lib/seo";
import { ChannelCta } from "@/components/channel-cta";
import { ArrowBack } from "@/components/icons";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const s = getSettings();
  return {
    title: "مدونة الوظائف — نصائح وتحفيز لطالبي العمل",
    description: `نصائح عملية وقصص وتحفيز لكل من يدور على شغل في ديالى والعراق — ${s.site_name}.`,
    alternates: { canonical: `${s.site_url}/blog` },
  };
}

type SP = Record<string, string | string[] | undefined>;

export default async function BlogIndex({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number((Array.isArray(sp.page) ? sp.page[0] : sp.page) || 1));
  const cfg = getSettings();
  const { rows, total } = listBlog(12, page);
  const pages = Math.max(1, Math.ceil(total / 12));

  return (
    <>
      <JsonLd data={[
        breadcrumbLd([
          { name: "الرئيسية", url: cfg.site_url },
          { name: "المدونة", url: `${cfg.site_url}/blog` },
        ]),
        {
          "@context": "https://schema.org",
          "@type": "Blog",
          name: `مدونة ${cfg.site_name}`,
          url: `${cfg.site_url}/blog`,
          inLanguage: "ar-IQ",
          blogPost: rows.slice(0, 10).map((p) => ({
            "@type": "BlogPosting",
            headline: p.title,
            url: `${cfg.site_url}/blog/${p.slug}`,
            datePublished: new Date(p.created_ts * 1000).toISOString(),
          })),
        },
      ]} />

      <a className="back-link" href="/"><ArrowBack /> الوظائف</a>

      <section className="hero" style={{ paddingTop: 6 }}>
        <h1>مدونة الوظائف</h1>
        <p>نصائح وقصص وتحفيز لكل من يدور على شغل — محدّثة يومياً.</p>
      </section>

      {rows.length === 0 ? (
        <div className="empty">
          <h3>ما موجود منشورات بعد</h3>
          <p>راجعنا قريباً.</p>
        </div>
      ) : (
        <div className="cards">
          {rows.map((p, i) => {
            const label = FORMATS.find((f) => f.id === p.kind)?.label;
            return (
              <a key={p.id} className="job-card" href={`/blog/${p.slug}`}
                 style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}>
                <div className="pill-row" style={{ marginTop: 0, marginBottom: 8 }}>
                  {label && <span className="pill city">{label}</span>}
                  <span className="time">{timeAgo(p.created_ts)}</span>
                </div>
                <span className="job-title" style={{ fontSize: 17 }}>{p.title}</span>
                <p className="job-summary">{p.body}</p>
              </a>
            );
          })}
        </div>
      )}

      {pages > 1 && (
        <nav className="pager">
          {page > 1 ? <a href={page - 1 === 1 ? "/blog" : `/blog?page=${page - 1}`}>السابق</a>
                    : <span className="disabled">السابق</span>}
          <span className="now">{page} / {pages}</span>
          {page < pages ? <a href={`/blog?page=${page + 1}`}>التالي</a>
                        : <span className="disabled">التالي</span>}
        </nav>
      )}

      <ChannelCta channel={cfg.brand_channel} siteName={cfg.site_name} />
    </>
  );
}
