import type { JobRow } from "@/lib/types";
import { isFresh, timeAgo } from "@/lib/format";
import { ArrowBack, Briefcase, Building, Clock, Pin, Search, Users, Wallet } from "./icons";

export function JobCard({
  job, index = 0, hidePhones = false,
}: { job: JobRow; index?: number; hidePhones?: boolean }) {
  const initial = (job.company || job.title || "و").trim().charAt(0);

  return (
    <a className="job-card" href={`/job/${job.id}`}
       style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}>
      <div className="job-head">
        <span className="job-avatar" aria-hidden>{initial || <Briefcase />}</span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span className="job-title">{job.title || "إعلان وظيفة"}</span>
          {job.company && (
            <span className="job-company"><Building className="i-xs" /> {job.company}</span>
          )}
        </span>
      </div>

      {job.summary && <p className="job-summary">{job.summary}</p>}

      <div className="pill-row">
        {isFresh(job.posted_ts) && <span className="pill new">جديد</span>}
        {job.city && (
          <span className="pill city"><Pin /> {job.area ? `${job.city} — ${job.area}` : job.city}</span>
        )}
        {job.employment_type && <span className="pill"><Clock /> {job.employment_type}</span>}
        {job.gender && job.gender !== "الجنسين" && <span className="pill"><Users /> {job.gender}</span>}
        {job.salary && <span className="pill salary"><Wallet /> {job.salary}</span>}
      </div>

      <div className="job-foot">
        <span>{timeAgo(job.posted_ts)}</span>
        {!hidePhones && job.phones.length > 0 && (
          <span>· {job.phones.length === 1 ? "رقم تواصل متوفر" : `${job.phones.length} أرقام تواصل`}</span>
        )}
        <span className="go">التفاصيل <ArrowBack className="flip" /></span>
      </div>
    </a>
  );
}

/** قائمة وظائف مع ترقيم صفحات — تُستخدم بصفحات المحافظة والقسم */
export function JobList({
  rows, total, page, perPage, hidePhones, basePath,
}: {
  rows: JobRow[]; total: number; page: number; perPage: number;
  hidePhones: boolean; basePath: string;
}) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  const link = (p: number) => (p === 1 ? basePath : `${basePath}?page=${p}`);

  if (!rows.length) {
    return (
      <div className="empty">
        <div className="ico"><Search /></div>
        <h3>ما موجودة وظائف هنا حالياً</h3>
        <p>جرّب تشوف باقي الوظائف بالصفحة الرئيسية.</p>
        <a className="btn primary" href="/" style={{ display: "inline-flex" }}>كل الوظائف</a>
      </div>
    );
  }

  return (
    <>
      <div className="result-bar"><span><b>{total}</b> وظيفة</span></div>

      <div className="cards">
        {rows.map((j, i) => <JobCard key={j.id} job={j} index={i} hidePhones={hidePhones} />)}
      </div>

      {pages > 1 && (
        <nav className="pager" aria-label="تنقل بين الصفحات">
          {page > 1 ? <a href={link(page - 1)}><ArrowBack /> السابق</a>
                    : <span className="disabled"><ArrowBack /> السابق</span>}
          <span className="now">{page} / {pages}</span>
          {page < pages ? <a href={link(page + 1)}>التالي <ArrowBack className="flip" /></a>
                        : <span className="disabled">التالي</span>}
        </nav>
      )}
    </>
  );
}
