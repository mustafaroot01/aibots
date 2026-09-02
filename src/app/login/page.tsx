import { redirect } from "next/navigation";
import { adminConfigured, isAuthed, loginLock, readLoginError } from "@/lib/auth";
import { loginAction } from "../admin/actions";
import { Briefcase } from "@/components/icons";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "تسجيل الدخول",
  robots: { index: false, follow: false, nocache: true },
};

export default async function LoginPage() {
  if (await isAuthed()) redirect("/admin");

  if (!adminConfigured()) {
    return (
      <main className="wrap adm-main">
        <div className="empty">
          <h3>لوحة التحكم مقفلة</h3>
          <p>
            ضبّط <code>ADMIN_TOKEN</code> بملف <code>.env.local</code> (١٢ حرف على الأقل)
            وأعد تشغيل السيرفر.
          </p>
        </div>
      </main>
    );
  }

  const lock = await loginLock();
  const error = await readLoginError();

  return (
    <main className="wrap adm-main" style={{ maxWidth: 420 }}>
      <div className="adm-card login-card">
        <span className="brand-mark" style={{ margin: "0 auto 14px" }}><Briefcase /></span>
        <h2 style={{ justifyContent: "center" }}>لوحة التحكم</h2>
        <p className="hint" style={{ textAlign: "center" }}>
          سجّل دخول حتى تدير المنشورات والإعدادات.
        </p>

        {error && !lock.locked && <div className="toast bad">{error}</div>}

        {lock.locked ? (
          <div className="toast bad" style={{ justifyContent: "center" }}>
            🔒 انقفل الدخول مؤقتاً بسبب محاولات كثيرة — جرّب بعد {lock.waitMinutes} دقيقة
          </div>
        ) : (
          <form action={loginAction}>
            <div className="field">
              <input type="password" name="token" placeholder="توكن الإدارة"
                autoFocus autoComplete="current-password" required minLength={6} />
              {lock.fails > 0 && !error && (
                <div className="desc" style={{ color: "var(--danger)" }}>
                  محاولات فاشلة: {lock.fails} من 5
                </div>
              )}
            </div>
            <button className="btn primary" type="submit" style={{ width: "100%", marginTop: 12 }}>
              دخول
            </button>
          </form>
        )}

        <p className="hint" style={{ textAlign: "center", marginTop: 16, marginBottom: 0, fontSize: 11.5 }}>
          الجلسة تنتهي بعد ٧ أيام · الدخول ينقفل ١٥ دقيقة بعد ٥ محاولات فاشلة
        </p>
      </div>
    </main>
  );
}
