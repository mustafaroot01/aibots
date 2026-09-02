import { facets, searchJobs, stats } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { isFresh, qs, timeAgo } from "@/lib/format";
import type { JobRow } from "@/lib/types";
import { ArrowBack, Filter, Search } from "@/components/icons";
import { JsonLd, itemListLd, websiteLd } from "@/lib/seo";
import { ChannelCta } from "@/components/channel-cta";
import { JobCard } from "@/components/job-list";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

export default async function Home({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const cfg = getSettings();

  const q = one(sp.q), city = one(sp.city), category = one(sp.cat);
  const type = one(sp.type), gender = one(sp.gender);
  const page = Math.max(1, Number(one(sp.page) || 1));

  const { rows, total } = searchJobs({ q, city, category, type, gender, page, perPage: cfg.per_page });
  const { cities, cats } = facets();
  const s = stats();
  const base = { q, city, cat: category, type, gender };
  const pages = Math.max(1, Math.ceil(total / cfg.per_page));
  const activeFilters = [city, type, gender].filter(Boolean).length;

  return (
    <>
      <JsonLd data={[websiteLd(cfg), itemListLd(rows, cfg)]} />

      <section className="hero">
        <h1>وظائف وشواغر اليوم</h1>
        <p>كل الفرص المتاحة بمكان واحد، محدّثة أول بأول ومفلترة قبل ما توصلك.</p>
        <div className="hero-stats">
          <span><span className="dot-live" /><b>{s.published}</b> وظيفة منشورة</span>
          <span><b>{s.week}</b> خلال آخر أسبوع</span>
        </div>
      </section>

      <form className="searchbar" action="/" method="get">
        <div className="search-field">
          <Search />
          <input
            type="search"
            name="q"
            placeholder="دور على وظيفة… كاشير، محاسب، سواق"
            defaultValue={q ?? ""}
            enterKeyHint="search"
            autoComplete="off"
          />
        </div>
        {category && <input type="hidden" name="cat" value={category} />}
        <button className="search-go" type="submit">بحث</button>
      </form>

      <details className="filters" open={activeFilters > 0}>
        <summary>
          <Filter />
          فلاتر متقدمة
          {activeFilters > 0 && <span className="count-badge">{activeFilters}</span>}
        </summary>
        <form className="filter-panel" action="/" method="get">
          {q && <input type="hidden" name="q" value={q} />}
          {category && <input type="hidden" name="cat" value={category} />}
          <div>
            <label htmlFor="f-city">المحافظة</label>
            <select id="f-city" name="city" defaultValue={city ?? ""}>
              <option value="">كل المحافظات</option>
              {cities.map((c) => <option key={c.v} value={c.v}>{c.v} ({c.c})</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="f-type">نوع الدوام</label>
            <select id="f-type" name="type" defaultValue={type ?? ""}>
              <option value="">الكل</option>
              {["دوام كامل", "دوام جزئي", "عقد", "تدريب", "عمل حر"].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="f-gender">الجنس المطلوب</label>
            <select id="f-gender" name="gender" defaultValue={gender ?? ""}>
              <option value="">الكل</option>
              <option value="ذكور">ذكور</option>
              <option value="إناث">إناث</option>
            </select>
          </div>
          <div className="filter-actions">
            <button className="apply" type="submit">طبّق الفلاتر</button>
            <a href={qs({}, { q, cat: category })}>مسح</a>
          </div>
        </form>
      </details>

      {cats.length > 0 && (
        <div className="chip-row">
          <a className={`chip ${!category ? "on" : ""}`} href={qs(base, { cat: undefined, page: undefined })}>
            كل الأقسام
          </a>
          {cats.map((c) => (
            <a
              key={c.v}
              className={`chip ${category === c.v ? "on" : ""}`}
              href={qs(base, { cat: c.v, page: undefined })}
            >
              {c.v} <span className="n">{c.c}</span>
            </a>
          ))}
        </div>
      )}

      <div className="result-bar">
        {total > 0 ? (
          <span><b>{total}</b> {total === 1 ? "وظيفة" : "وظيفة"} {q || activeFilters || category ? "مطابقة لبحثك" : "متاحة"}</span>
        ) : (
          <span>ما لكينا نتائج</span>
        )}
        {(q || activeFilters > 0 || category) && <a className="clear-link" href="/">مسح الكل</a>}
      </div>

      {rows.length === 0 ? (
        <div className="empty">
          <div className="ico"><Search /></div>
          <h3>ما موجودة وظائف مطابقة</h3>
          <p>جرّب كلمة بحث ثانية أو شيل بعض الفلاتر.</p>
          <a className="btn primary" href="/" style={{ display: "inline-flex" }}>عرض كل الوظائف</a>
        </div>
      ) : (
        <>
          <div className="cards">
            {rows.slice(0, 4).map((j, i) => (
              <JobCard key={j.id} job={j} index={i} hidePhones={cfg.hide_phones} />
            ))}
          </div>

          <ChannelCta channel={cfg.brand_channel} siteName={cfg.site_name} />

          {rows.length > 4 && (
            <div className="cards">
              {rows.slice(4).map((j, i) => (
                <JobCard key={j.id} job={j} index={i + 4} hidePhones={cfg.hide_phones} />
              ))}
            </div>
          )}
        </>
      )}

      {pages > 1 && (
        <nav className="pager" aria-label="تنقل بين الصفحات">
          {page > 1
            ? <a href={qs(base, { page: page - 1 === 1 ? undefined : String(page - 1) })}><ArrowBack /> السابق</a>
            : <span className="disabled"><ArrowBack /> السابق</span>}
          <span className="now">{page} / {pages}</span>
          {page < pages
            ? <a href={qs(base, { page: String(page + 1) })}>التالي <ArrowBack className="flip" /></a>
            : <span className="disabled">التالي</span>}
        </nav>
      )}
    </>
  );
}
