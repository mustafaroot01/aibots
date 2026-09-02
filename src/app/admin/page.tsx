import { guardPage } from "@/lib/auth";
import { fullStats, getMeta, publishLog, recent, visitStats } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { providerStatus } from "@/lib/classify";
import { timeAgo } from "@/lib/format";
import { Toast } from "@/components/toast";
import { ConfirmButton } from "@/components/confirm";
import { activeSessions, tokenStrength } from "@/lib/auth";
import { maskSecret } from "@/lib/crypto";
import { Alert, Briefcase, Clock, Telegram, Users } from "@/components/icons";
import {
  logoutEverywhereAction, processPendingAction, publishQueueAction, reclassifyAction, runIngestAction,
} from "./actions";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

export default async function Dashboard({ searchParams }: { searchParams: Promise<SP> }) {
  await guardPage();
  const sp = await searchParams;
  const s = fullStats();
  const cfg = getSettings();
  const lastRun = getMeta("last_run");
  const quotaOut = getMeta("quota_exhausted_at");
  const v = visitStats();
  const ps = providerStatus();
  const strength = tokenStrength();
  const sessions = activeSessions();
  const hasSecretKey = Boolean(process.env.SECRET_KEY);
  const log = publishLog(6);
  const latest = recent(5);

  const checks = [
    { ok: !quotaOut, label: "الحصة اليومية",
      good: "متاحة — الفلترة تشتغل طبيعي",
      bad: `انتهت الحصة المجانية (${timeAgo(quotaOut)}) — المنشورات تنتظر لحد ما تتجدد، أو زوّد «منشورات بالطلب الواحد»` },
    { ok: ps.active !== "rules", label: "الفلترة الذكية",
      good: `شغالة بـ ${ps.active === "gemini" ? "Gemini" : "Claude"} (${ps.model})`,
      bad: "ما موجود مفتاح — الفلترة تشتغل بالكلمات المفتاحية بس" },
    { ok: cfg.publish_enabled && !!cfg.publish_bot_token && !!cfg.publish_channel, label: "النشر بقناتك", good: `مفعّل → ${cfg.publish_channel}`, bad: "مطفي — فعّله من الإعدادات" },
    { ok: !!lastRun && Date.now() - new Date(lastRun).getTime() < cfg.poll_seconds * 4000, label: "عامل الخلفية", good: `آخر دورة ${timeAgo(lastRun)}`, bad: lastRun ? `آخر دورة ${timeAgo(lastRun)} — تأكد إن العامل شغال` : "ما اشتغل بعد" },
  ];

  return (
    <>
      <Toast msg={one(sp.msg)} />

      <div className="kpis">
        <div className="kpi ok"><b>منشورة بالموقع</b><span>{s.published}</span></div>
        <div className="kpi"><b>الكل</b><span>{s.total}</span></div>
        <div className="kpi warn"><b>تنتظر مراجعة</b><span>{s.review}</span></div>
        <div className="kpi"><b>قيد الفلترة</b><span>{s.pending}</span></div>
        <div className="kpi"><b>مرفوضة</b><span>{s.rejected}</span></div>
        <div className="kpi ok"><b>أُرسلت لقناتك</b><span>{s.tg_sent}</span></div>
        <div className="kpi warn"><b>بطابور القناة</b><span>{s.tg_queued}</span></div>
        <div className="kpi bad"><b>فشل إرسالها</b><span>{s.tg_failed}</span></div>
        <div className="kpi"><b>تخطيناها (قديمة)</b><span>{s.tg_skipped}</span></div>
      </div>

      <div className="adm-card">
        <h2><Users /> الزوار</h2>
        <p className="hint">إحصاء مجهول بدون كوكيز ولا تتبّع — البصمة تتغير كل يوم والزواحف مستثناة.</p>
        <div className="kpis" style={{ marginBottom: 4 }}>
          <div className="kpi ok"><b>زوار اليوم</b><span>{v.today.uniques}</span></div>
          <div className="kpi"><b>مشاهدات اليوم</b><span>{v.today.views}</span></div>
          <div className="kpi"><b>أمس</b><span>{v.yesterday.uniques}</span></div>
          <div className="kpi"><b>آخر ٧ أيام</b><span>{v.week.uniques}</span></div>
          <div className="kpi"><b>آخر ٣٠ يوم</b><span>{v.month.uniques}</span></div>
        </div>

        {v.daily.length > 1 && (
          <div className="spark">
            {[...v.daily].reverse().map((d) => {
              const max = Math.max(...v.daily.map((x) => x.uniques), 1);
              return (
                <span key={d.day} className="spark-bar" title={`${d.day}: ${d.uniques} زائر · ${d.views} مشاهدة`}>
                  <i style={{ height: `${Math.max(6, (d.uniques / max) * 100)}%` }} />
                </span>
              );
            })}
          </div>
        )}
      </div>

      <div className="adm-card">
        <h2><Alert /> حالة النظام</h2>
        <p className="hint">فحص سريع للأشياء اللي لازم تكون شغالة.</p>
        <div style={{ display: "grid", gap: 8 }}>
          {checks.map((c) => (
            <div key={c.label} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13.5 }}>
              <span style={{ fontSize: 15, lineHeight: 1.5 }}>{c.ok ? "✅" : "⚠️"}</span>
              <span>
                <b>{c.label}</b>
                <span style={{ display: "block", color: "var(--muted)", fontSize: 12.5 }}>
                  {c.ok ? c.good : c.bad}
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="adm-card">
        <h2><Clock /> تشغيل يدوي</h2>
        <p className="hint">
          العامل يشتغل تلقائياً كل {cfg.poll_seconds} ثانية، وهذي الأزرار تخليك تشغّل الخطوات فوراً.
        </p>
        <div className="form-actions" style={{ borderTop: 0, paddingTop: 0, marginTop: 0 }}>
          <form action={runIngestAction} className="grow">
            <button className="btn primary" type="submit" style={{ width: "100%" }}>دورة كاملة الآن</button>
          </form>
          <form action={processPendingAction}>
            <button className="btn" type="submit">فلترة المنتظر</button>
          </form>
          <form action={publishQueueAction}>
            <button className="btn" type="submit"><Telegram /> نشر الطابور</button>
          </form>
        </div>
        <div className="form-actions">
          <form action={reclassifyAction}>
            <input type="hidden" name="scope" value="rejected" />
            <ConfirmButton message={`راح نعيد فلترة ${s.rejected} منشور مرفوض. تكمّل؟`}>
              إعادة فلترة المرفوضات ({s.rejected})
            </ConfirmButton>
          </form>
          <form action={reclassifyAction}>
            <input type="hidden" name="scope" value="all" />
            <ConfirmButton message={`تنبيه: راح ترجع كل الـ${s.total} منشور لطابور الفلترة، والموقع يفضى لحد ما تخلص إعادة التصنيف. متأكد؟`}>
              إعادة فلترة الكل ({s.total})
            </ConfirmButton>
          </form>
        </div>
      </div>

      <div className="adm-card">
        <h2><Briefcase /> آخر المنشورات</h2>
        <p className="hint">آخر ٥ منشورات وصلت من القناة المصدر.</p>
        <div style={{ display: "grid", gap: 8 }}>
          {latest.length === 0 && <p className="hint" style={{ margin: 0 }}>ما وصل شي بعد.</p>}
          {latest.map((j) => (
            <div key={j.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
              <span className={`badge ${j.status}`}>{
                { published: "منشور", rejected: "مرفوض", pending: "بالانتظار", pending_review: "مراجعة", hidden: "مخفي" }[j.status]
              }</span>
              <a href={`/admin/posts?q=${j.id}`} style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {j.title || j.raw_text.slice(0, 50) || "(بدون نص)"}
              </a>
              <span style={{ color: "var(--muted)", fontSize: 11.5, whiteSpace: "nowrap" }}>{timeAgo(j.posted_ts)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="adm-card">
        <h2><Alert /> الأمان</h2>
        <p className="hint">فحص حماية لوحة التحكم والأسرار المخزّنة.</p>

        <div className="sec-row">
          <span className="ico">{strength.ok ? "✅" : "⚠️"}</span>
          <span style={{ flex: 1 }}>
            <b>قوة توكن الدخول</b>
            <small>{strength.note}{!strength.ok && " — غيّره من ملف .env.local بالسيرفر"}</small>
          </span>
        </div>

        <div className="sec-row">
          <span className="ico">{hasSecretKey ? "✅" : "🔸"}</span>
          <span style={{ flex: 1 }}>
            <b>تشفير الأسرار بقاعدة البيانات</b>
            <small>
              {hasSecretKey
                ? "توكن البوت مشفّر بمفتاح SECRET_KEY مستقل"
                : "شغال بمفتاح مشتق من ADMIN_TOKEN — الأفضل تضيف SECRET_KEY منفصل بـ .env.local"}
            </small>
          </span>
        </div>

        <div className="sec-row">
          <span className="ico">{cfg.publish_bot_token ? "🔐" : "—"}</span>
          <span style={{ flex: 1 }}>
            <b>توكن بوت النشر</b>
            <small>{cfg.publish_bot_token ? `محفوظ مشفّر: ${maskSecret(cfg.publish_bot_token)}` : "ما موجود"}</small>
          </span>
        </div>

        <div className="sec-row">
          <span className="ico">🖥️</span>
          <span style={{ flex: 1 }}>
            <b>الجلسات المفتوحة: {sessions.length}</b>
            <small>
              {sessions.length
                ? `آخر نشاط ${timeAgo(new Date(sessions[0].last_seen * 1000).toISOString())} · الجلسة تنتهي بعد ٧ أيام`
                : "ما موجودة جلسات"}
            </small>
          </span>
          {sessions.length > 1 && (
            <form action={logoutEverywhereAction}>
              <ConfirmButton message="راح تنقفل كل الجلسات على كل الأجهزة، بضمنها هذي. تكمّل؟">
                خروج من كل الأجهزة
              </ConfirmButton>
            </form>
          )}
        </div>

        <div className="sec-row">
          <span className="ico">🛡️</span>
          <span style={{ flex: 1 }}>
            <b>حمايات مفعّلة</b>
            <small>
              جلسة عشوائية بكوكي HttpOnly · قفل ١٥ دقيقة بعد ٥ محاولات فاشلة ·
              ترويسات CSP و X-Frame-Options · لوحة التحكم ما تنأرشف ولا تنخزن بالكاش
            </small>
          </span>
        </div>
      </div>

      {log.length > 0 && (
        <div className="adm-card">
          <h2><Telegram /> سجل النشر بقناتك</h2>
          <div style={{ display: "grid", gap: 7 }}>
            {log.map((l) => (
              <div key={l.id} style={{ display: "flex", gap: 8, fontSize: 12.5, alignItems: "flex-start" }}>
                <span>{l.ok ? "✅" : "❌"}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ fontSize: 13 }}>{l.title || `منشور ${l.post_id}`}</b>
                  <span style={{ display: "block", color: "var(--muted)" }}>{l.detail}</span>
                </span>
                <span style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>{timeAgo(l.at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
