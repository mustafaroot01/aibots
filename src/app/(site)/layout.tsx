import { Briefcase, Telegram } from "@/components/icons";
import { InstallButton } from "@/components/pwa";
import { getSettings } from "@/lib/settings";
import { visitStats } from "@/lib/db";
import { recordVisit } from "@/lib/visit";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  await recordVisit();
  const s = getSettings();
  const v = s.show_visitor_count ? visitStats() : null;
  const channel = s.brand_channel;
  const year = new Date().getFullYear();

  return (
    <>
      <header className="topbar">
        <div className="wrap topbar-inner">
          <a href="/" className="brand">
            <span className="brand-mark"><Briefcase /></span>
            <span style={{ minWidth: 0 }}>
              <span className="brand-name">{s.site_name}</span>
              <span className="brand-sub">شواغر محدّثة على مدار الساعة</span>
            </span>
          </a>
          <a href="/blog" className="nav-link">المدونة</a>
          <span className="spacer" />
          <InstallButton />
          {channel && (
            <a className="tg-link" href={`https://t.me/${channel}`} target="_blank" rel="noopener">
              <Telegram /> تابعنا
            </a>
          )}
        </div>
      </header>

      <main className="wrap">{children}</main>

      <footer className="site-footer">
        <div className="footer-grid">
          <div>
            <div className="footer-brand">
              <span className="brand-mark"><Briefcase /></span>
              <b>{s.site_name}</b>
            </div>
            <p className="footer-note" style={{ marginTop: 8, marginBottom: 0 }}>
              أحدث الشواغر والتعيينات في ديالى والعراق — تُجمع وتُفلتر وتُنشر تلقائياً على مدار الساعة.
            </p>
          </div>

          {channel && (
            <div>
              <a className="footer-tg" href={`https://t.me/${channel}`} target="_blank" rel="noopener">
                <Telegram /> انضم لقناتنا: @{channel}
              </a>
            </div>
          )}

          <nav className="footer-links">
            <a href="/">الرئيسية</a>
            <a href="/blog">المدونة</a>
            <a href="/feed.xml">خلاصة RSS</a>
            <a href="/api/jobs">واجهة البيانات</a>
            <a href="/sitemap.xml">خريطة الموقع</a>
            {channel && <a href={`https://t.me/${channel}`} target="_blank" rel="noopener">تلجرام</a>}
          </nav>

          <p className="footer-note" style={{ margin: 0 }}>
            الإعلانات منقولة كما نُشرت من مصادر عامة ولا نضمن صحتها.
            تأكد من الجهة قبل التقديم ولا تدفع أي مبلغ مقدماً.
          </p>

          {v && (
            <div className="visitors">
              <span><b>{v.today.uniques.toLocaleString("ar-IQ")}</b> زائر اليوم</span>
              <span className="sep">·</span>
              <span><b>{v.week.uniques.toLocaleString("ar-IQ")}</b> هذا الأسبوع</span>
              <span className="sep">·</span>
              <span><b>{v.month.views.toLocaleString("ar-IQ")}</b> مشاهدة بالشهر</span>
            </div>
          )}

          <div className="footer-copy">
            © {year} <b style={{ color: "var(--text-2)" }}>{s.site_name}</b> — جميع الحقوق محفوظة
            {channel && <> · <a href={`https://t.me/${channel}`} target="_blank" rel="noopener" style={{ color: "var(--brand-ink)", fontWeight: 700 }}>@{channel}</a></>}
          </div>
        </div>
      </footer>
    </>
  );
}
