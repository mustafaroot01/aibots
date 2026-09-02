import { guardPage } from "@/lib/auth";
import { adminSearch } from "@/lib/db";
import { adminQs, timeAgo } from "@/lib/format";
import { Toast } from "@/components/toast";
import { changeStatusAction, publishOneAction, requeueAction } from "../actions";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

const STATUS_LABEL: Record<string, string> = {
  published: "منشور", rejected: "مرفوض", pending: "بالانتظار",
  pending_review: "بانتظار مراجعة", hidden: "مخفي",
};
const TG_LABEL: Record<string, string> = {
  idle: "—", queued: "بالطابور", sent: "أُرسل", failed: "فشل", skipped: "متخطى",
};

export default async function AdminPosts({ searchParams }: { searchParams: Promise<SP> }) {
  await guardPage();
  const sp = await searchParams;
  const q = one(sp.q), status = one(sp.status) ?? "all", tg = one(sp.tg) ?? "all";
  const page = Math.max(1, Number(one(sp.page) || 1));
  const perPage = 25;

  const { rows, total } = adminSearch({ q, status, tg, page, perPage });
  const pages = Math.max(1, Math.ceil(total / perPage));
  const base = { q, status: status === "all" ? undefined : status, tg: tg === "all" ? undefined : tg };
  const back = adminQs("/admin/posts", base, { page: page > 1 ? String(page) : undefined });

  return (
    <>
      <Toast msg={one(sp.msg)} />

      <form className="filters-row" action="/admin/posts" method="get">
        <input type="search" name="q" placeholder="بحث بالنص أو العنوان أو الرقم…" defaultValue={q ?? ""} />
        <select name="status" defaultValue={status}>
          <option value="all">كل الحالات</option>
          {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select name="tg" defaultValue={tg}>
          <option value="all">القناة: الكل</option>
          {Object.entries(TG_LABEL).map(([v, l]) => <option key={v} value={v}>{v === "idle" ? "ما بالطابور" : l}</option>)}
        </select>
        <button type="submit">تصفية</button>
      </form>

      <p className="hint" style={{ marginTop: 0 }}>
        <b>{total}</b> منشور · صفحة {page} من {pages}
      </p>

      <div style={{ display: "grid", gap: 8 }}>
        {rows.length === 0 && (
          <div className="empty"><h3>ما موجود شي</h3><p>غيّر الفلاتر أو كلمة البحث.</p></div>
        )}

        {rows.map((j) => (
          <div className="p-item" key={j.id}>
            <div className="head">
              <span className={`badge ${j.status}`}>{STATUS_LABEL[j.status]}</span>
              {j.tg_status !== "idle" && (
                <span className="badge" title={j.tg_error ?? undefined}>قناتك: {TG_LABEL[j.tg_status]}</span>
              )}
              <span className="t">{j.title || j.raw_text.slice(0, 60) || "(بدون نص)"}</span>
              {j.confidence != null && (
                <span className="conf" title="درجة ثقة التصنيف">
                  <span className="bar"><i style={{ width: `${Math.round(j.confidence * 100)}%` }} /></span>
                  {j.confidence.toFixed(2)}
                </span>
              )}
            </div>

            {j.summary && <div className="snippet">{j.summary}</div>}

            <div className="m">
              <span>#{j.id}</span>
              <span>{timeAgo(j.posted_ts)}</span>
              {j.city && <span>{j.city}{j.area ? ` — ${j.area}` : ""}</span>}
              {j.category && <span>{j.category}</span>}
              {j.phones.length > 0 && <span dir="ltr">{j.phones.join(" / ")}</span>}
              {j.classifier && <span>المصنّف: {j.classifier}</span>}
              {j.reason && <span>السبب: {j.reason}</span>}
              {j.tg_error && <span style={{ color: "var(--danger)" }}>{j.tg_error}</span>}
            </div>

            <div className="acts">
              {j.status === "published" ? (
                <StatusBtn id={j.id} status="hidden" back={back} label="إخفاء" />
              ) : (
                <StatusBtn id={j.id} status="published" back={back} label="نشر بالموقع" />
              )}
              <StatusBtn id={j.id} status="pending" back={back} label="إعادة فلترة" />
              {j.status !== "rejected" && <StatusBtn id={j.id} status="rejected" back={back} label="رفض" />}

              <form action={publishOneAction}>
                <input type="hidden" name="id" value={j.id} />
                <input type="hidden" name="back" value={back} />
                <button className="mini" type="submit">
                  {j.tg_status === "sent" ? "إعادة النشر بقناتك" : "نشر بقناتك"}
                </button>
              </form>

              {(j.tg_status === "failed" || j.tg_status === "skipped") && (
                <form action={requeueAction}>
                  <input type="hidden" name="id" value={j.id} />
                  <input type="hidden" name="back" value={back} />
                  <button className="mini" type="submit">رجّعه للطابور</button>
                </form>
              )}

              <a className="mini" href={`/job/${j.id}`} target="_blank" rel="noopener"
                 title={j.status === "published" ? "الصفحة كما يشوفها الزائر" : "معاينة إدارية — المنشور ما يظهر للزوار"}
                 style={{ display: "inline-grid", placeItems: "center" }}>
                {j.status === "published" ? "فتح الصفحة" : "معاينة"}
              </a>
            </div>
          </div>
        ))}
      </div>

      {pages > 1 && (
        <nav className="pager">
          {page > 1
            ? <a href={adminQs("/admin/posts", base, { page: page - 1 === 1 ? undefined : String(page - 1) })}>السابق</a>
            : <span className="disabled">السابق</span>}
          <span className="now">{page} / {pages}</span>
          {page < pages
            ? <a href={adminQs("/admin/posts", base, { page: String(page + 1) })}>التالي</a>
            : <span className="disabled">التالي</span>}
        </nav>
      )}
    </>
  );
}

function StatusBtn({ id, status, back, label }: { id: number; status: string; back: string; label: string }) {
  return (
    <form action={changeStatusAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="back" value={back} />
      <button className="mini" type="submit">{label}</button>
    </form>
  );
}
