import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { bumpBlogViews, getBlogPost, listBlog, searchJobs } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { FORMATS } from "@/lib/blog";
import { fullDate, timeAgo } from "@/lib/format";
import { JsonLd, breadcrumbLd } from "@/lib/seo";
import { ChannelCta } from "@/components/channel-cta";
import { ShareButton } from "@/components/pwa";
import { ArrowBack, Briefcase } from "@/components/icons";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const post = getBlogPost(decodeURIComponent((await params).slug));
  if (!post) notFound();
  const s = getSettings();
  return {
    title: post.title,
    description: post.body.slice(0, 160),
    alternates: { canonical: `${s.site_url}/blog/${post.slug}` },
    openGraph: {
      type: "article",
      title: post.title,
      description: post.body.slice(0, 160),
      url: `${s.site_url}/blog/${post.slug}`,
      publishedTime: new Date(post.created_ts * 1000).toISOString(),
    },
  };
}

export default async function BlogPost({ params }: { params: Promise<{ slug: string }> }) {
  const post = getBlogPost(decodeURIComponent((await params).slug));
  if (!post) notFound();

  const cfg = getSettings();
  bumpBlogViews(post.id);

  const label = FORMATS.find((f) => f.id === post.kind)?.label;
  const more = listBlog(4, 1).rows.filter((p) => p.id !== post.id).slice(0, 3);
  const jobs = searchJobs({ perPage: 3, page: 1 }).rows;

  return (
    <>
      <JsonLd data={[
        {
          "@context": "https://schema.org",
          "@type": "BlogPosting",
          headline: post.title,
          articleBody: post.body,
          datePublished: new Date(post.created_ts * 1000).toISOString(),
          dateModified: new Date(post.created_ts * 1000).toISOString(),
          inLanguage: "ar-IQ",
          author: { "@type": "Organization", name: cfg.site_name, url: cfg.site_url },
          publisher: {
            "@type": "Organization", name: cfg.site_name,
            logo: { "@type": "ImageObject", url: `${cfg.site_url}/icons/icon-512.png` },
          },
          mainEntityOfPage: `${cfg.site_url}/blog/${post.slug}`,
        },
        breadcrumbLd([
          { name: "الرئيسية", url: cfg.site_url },
          { name: "المدونة", url: `${cfg.site_url}/blog` },
          { name: post.title, url: `${cfg.site_url}/blog/${post.slug}` },
        ]),
      ]} />

      <a className="back-link" href="/blog"><ArrowBack /> المدونة</a>

      <article className="detail">
        <div className="pill-row" style={{ marginTop: 0 }}>
          {label && <span className="pill city">{label}</span>}
          <span className="time">{timeAgo(post.created_ts)}</span>
        </div>

        <h1 style={{ marginTop: 10 }}>{post.title}</h1>

        <div className="blog-body">{post.body}</div>

        <div className="pill-row" style={{ marginTop: 18, color: "var(--muted)", fontSize: 12.5 }}>
          <span>نُشر {fullDate(post.created_ts)}</span>
        </div>

        <div className="btn-row" style={{ marginTop: 14 }}>
          <ShareButton title={post.title} url={`/blog/${post.slug}`} />
          <a className="btn primary" href="/"><Briefcase /> شوف الوظائف المتاحة</a>
        </div>
      </article>

      <ChannelCta channel={cfg.brand_channel} siteName={cfg.site_name} />

      {jobs.length > 0 && (
        <>
          <div className="section-label">وظائف متاحة الآن</div>
          <div className="cards">
            {jobs.map((j) => (
              <a key={j.id} className="job-card" href={`/job/${j.id}`}>
                <span className="job-title">{j.title || "إعلان وظيفة"}</span>
                {j.city && <div className="pill-row"><span className="pill city">{j.city}</span></div>}
              </a>
            ))}
          </div>
        </>
      )}

      {more.length > 0 && (
        <>
          <div className="section-label">اقرأ أيضاً</div>
          <div className="cards">
            {more.map((p) => (
              <a key={p.id} className="job-card" href={`/blog/${p.slug}`}>
                <span className="job-title">{p.title}</span>
                <p className="job-summary">{p.body}</p>
              </a>
            ))}
          </div>
        </>
      )}
    </>
  );
}
