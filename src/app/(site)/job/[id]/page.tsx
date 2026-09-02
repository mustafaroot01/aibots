import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getJob } from "@/lib/db";
import { isAuthed } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { fullDate, isFresh, timeAgo, waLink, prettyPhone } from "@/lib/format";
import { ShareButton } from "@/components/pwa";
import { ChannelCta } from "@/components/channel-cta";
import { JsonLd, breadcrumbLd, jobPostingLd } from "@/lib/seo";
import {
  Alert, ArrowBack, Briefcase, Building, Clock, Phone, Pin, Telegram, Users, Wallet,
} from "@/components/icons";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const job = getJob(Number((await params).id));
  // المدير يشوف أي منشور بأي حالة (معاينة)، والزائر يشوف المنشور فقط
  if (!job || (job.status !== "published" && !(await isAuthed()))) notFound();
  if (job.status !== "published") {
    return { title: `معاينة: ${job.title || "منشور"}`, robots: { index: false, follow: false } };
  }
  const where = [job.city, job.area].filter(Boolean).join(" — ");
  const cfg = getSettings();
  return {
    title: `${job.title || "إعلان وظيفة"}${where ? ` — ${where}` : ""}`,
    description: job.summary || job.raw_text.slice(0, 160),
    alternates: { canonical: `${cfg.site_url}/job/${job.id}` },
    openGraph: {
      type: "article",
      url: `${cfg.site_url}/job/${job.id}`,
      title: job.title || "إعلان وظيفة",
      description: job.summary || job.raw_text.slice(0, 160),
      images: job.photos.length ? [job.photos[0]] : undefined,
    },
  };
}

const STATUS_LABEL: Record<string, string> = {
  pending: "قيد الفلترة", pending_review: "بانتظار مراجعتك",
  rejected: "مرفوض — ما يظهر للزوار", hidden: "مخفي — ما يظهر للزوار",
};

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const job = getJob(Number((await params).id));
  const admin = await isAuthed();
  if (!job || (job.status !== "published" && !admin)) notFound();
  const isPreview = job.status !== "published";

  const cfg = getSettings();
  const phones = cfg.hide_phones ? [] : job.phones;
  const initial = (job.company || job.title || "و").trim().charAt(0);

  const facts: [string, string | null, boolean][] = [
    ["المحافظة", job.city, false],
    ["المنطقة", job.area, false],
    ["القسم", job.category, false],
    ["نوع الدوام", job.employment_type, false],
    ["الجنس المطلوب", job.gender, false],
    ["الراتب", job.salary, true],
    ["الخبرة", job.experience, false],
    ["عدد الشواغر", job.vacancies ? String(job.vacancies) : null, false],
  ];
  const shown = facts.filter(([, v]) => v);

  return (
    <div className={phones.length ? "has-dock" : undefined}>
      {!isPreview && (
        <JsonLd data={[
          jobPostingLd(job, cfg),
          breadcrumbLd([
            { name: "الرئيسية", url: cfg.site_url },
            ...(job.city ? [{ name: `وظائف ${job.city}`, url: `${cfg.site_url}/city/${encodeURIComponent(job.city)}` }] : []),
            { name: job.title || "إعلان وظيفة", url: `${cfg.site_url}/job/${job.id}` },
          ]),
        ]} />
      )}
      {isPreview && (
        <div className="preview-banner">
          <Alert />
          <span>
            <b>معاينة إدارية</b> — حالة المنشور: {STATUS_LABEL[job.status] ?? job.status}.
            هذي الصفحة ما يشوفها الزوار.
            {job.reason && <span style={{ display: "block", opacity: .85 }}>سبب القرار: {job.reason}</span>}
          </span>
          <a href="/admin/posts" className="mini" style={{ marginInlineStart: "auto", whiteSpace: "nowrap" }}>
            لوحة المنشورات
          </a>
        </div>
      )}

      <a className="back-link" href={isPreview ? "/admin/posts" : "/"}>
        <ArrowBack /> {isPreview ? "رجوع للوحة المنشورات" : "رجوع لكل الوظائف"}
      </a>

      <article className="detail">
        <div className="detail-head">
          <span className="job-avatar" aria-hidden>{initial || <Briefcase />}</span>
          <div style={{ minWidth: 0 }}>
            <h1>{job.title || "إعلان وظيفة"}</h1>
            <div className="pill-row" style={{ marginTop: 8 }}>
              {isFresh(job.posted_ts) && <span className="pill new">جديد</span>}
              {job.company && <span className="pill"><Building /> {job.company}</span>}
              {job.city && <span className="pill city"><Pin /> {job.area ? `${job.city} — ${job.area}` : job.city}</span>}
            </div>
          </div>
        </div>

        <div className="pill-row" style={{ marginTop: 12, color: "var(--muted)", fontSize: 12.5 }}>
          <Clock className="i-xs" />
          <span>نُشر {timeAgo(job.posted_ts)}</span>
          <span style={{ opacity: .55 }}>· {fullDate(job.posted_ts)}</span>
        </div>

        {shown.length > 0 && (
          <div className="facts">
            {shown.map(([k, v, hl]) => (
              <div className={`fact ${hl ? "hl" : ""}`} key={k}>
                <b>{k}</b>
                <span>{v}</span>
              </div>
            ))}
          </div>
        )}

        {job.apply_method && (
          <>
            <div className="section-label">طريقة التقديم</div>
            <div className="apply-box">{job.apply_method}</div>
          </>
        )}

        {(phones.length > 0 || job.contacts.length > 0) && (
          <>
            <div className="section-label">التواصل</div>
            <div className="btn-row">
              {phones.map((p) => (
                <a key={p} className="btn primary" href={`tel:${p}`} dir="ltr"><Phone /> {prettyPhone(p)}</a>
              ))}
              {phones.map((p) => (
                <a key={`w${p}`} className="btn wa" href={waLink(p)} target="_blank" rel="noopener">
                  واتساب
                </a>
              ))}
              {job.contacts
                .filter((c) => c.startsWith("@"))
                .map((c) => (
                  <a key={c} className="btn" href={`https://t.me/${c.slice(1)}`} target="_blank" rel="noopener">
                    <Telegram /> {c}
                  </a>
                ))}
            </div>
          </>
        )}

        <div className="section-label">تفاصيل الإعلان</div>
        <pre className="raw">{job.raw_text}</pre>

        {job.photos.length > 0 && (
          <>
            <div className="section-label">صور الإعلان</div>
            <div className="gallery">
              {job.photos.map((src) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={src} src={src} alt={job.title || "صورة الإعلان"} loading="lazy" />
              ))}
            </div>
          </>
        )}

        <div className="btn-row" style={{ marginTop: 18 }}>
          <ShareButton title={job.title || "إعلان وظيفة"} url={`/job/${job.id}`} />
          {cfg.show_source_link && (
            <a className="btn" href={job.url} target="_blank" rel="noopener">المنشور الأصلي</a>
          )}
        </div>

        <ChannelCta channel={cfg.brand_channel} siteName={cfg.site_name} variant="slim" />

        <div className="warn-note">
          <Alert />
          <span>
            هذا الإعلان منقول كما نُشر، وما نضمن صحته. لا تدفع أي مبلغ مقدماً، ولا ترسل وثائقك الشخصية
            قبل ما تتأكد من الجهة.
          </span>
        </div>
      </article>

      <ChannelCta channel={cfg.brand_channel} siteName={cfg.site_name} />

      {phones.length > 0 && (
        <div className="action-dock">
          <a className="btn primary" href={`tel:${phones[0]}`}><Phone /> اتصال</a>
          <a className="btn wa" href={waLink(phones[0])} target="_blank" rel="noopener">واتساب</a>
        </div>
      )}
    </div>
  );
}
