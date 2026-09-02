/**
 * حماية لوحة التحكم:
 * — جلسات عشوائية مخزّنة بقاعدة البيانات (تنلغي وتنتهي)، مو هاش ثابت للتوكن
 * — تحديد محاولات الدخول الفاشلة لكل جهاز
 * — مقارنة التوكن بوقت ثابت (ما تنكشف بالتوقيت)
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";

const COOKIE = "dj_sess";
const SESSION_DAYS = 7;
const MAX_FAILS = 5;
const LOCK_MINUTES = 15;

function token(): string {
  return process.env.ADMIN_TOKEN || "";
}

export function adminConfigured(): boolean {
  return token().length >= 6;
}

/** هل التوكن ضعيف؟ (يُعرض تنبيه بلوحة التحكم) */
export function tokenStrength(): { ok: boolean; note: string } {
  const t = token();
  if (!t) return { ok: false, note: "ما موجود توكن" };
  if (t.length < 12) return { ok: false, note: "قصير — خليه ١٢ حرف على الأقل" };
  if (/^(admin|123|password|test|توكن)/i.test(t)) return { ok: false, note: "سهل التخمين — غيّره" };
  const variety = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(t)).length;
  if (variety < 3) return { ok: false, note: "خليه يجمع حروف كبيرة وصغيرة وأرقام ورموز" };
  return { ok: true, note: "قوي" };
}

export function tokenMatches(input: string): boolean {
  const t = token();
  if (!t || !input) return false;
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(t).digest();
  return timingSafeEqual(a, b);
}

/**
 * هل الاتصال الحالي HTTPS فعلاً؟
 * نعتمد على البروتوكول الحقيقي مو على NODE_ENV — هيج الكوكي تشتغل
 * على http محلي وباللان، وتبقى Secure على الدومين الحقيقي.
 */
async function isHttps(): Promise<boolean> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") || "";
  return proto.split(",")[0].trim() === "https";
}

/** بصمة الجهاز — للتحديد وربط الجلسة */
async function fingerprint(): Promise<string> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") || "").split(",")[0].trim() || h.get("x-real-ip") || "local";
  const ua = h.get("user-agent") || "";
  return createHash("sha256").update(`${ip}::${ua}`).digest("hex").slice(0, 32);
}

// ————— تحديد محاولات الدخول —————

export async function loginLock(): Promise<{ locked: boolean; waitMinutes: number; fails: number }> {
  const fp = await fingerprint();
  const row = db().prepare(
    `SELECT fails, locked_until FROM login_attempts WHERE fingerprint = ?`
  ).get(fp) as { fails: number; locked_until: number } | undefined;

  if (!row) return { locked: false, waitMinutes: 0, fails: 0 };
  const left = row.locked_until - Math.floor(Date.now() / 1000);
  return { locked: left > 0, waitMinutes: Math.ceil(left / 60), fails: row.fails };
}

async function recordFail() {
  const fp = await fingerprint();
  const now = Math.floor(Date.now() / 1000);
  const row = db().prepare(`SELECT fails FROM login_attempts WHERE fingerprint = ?`).get(fp) as
    { fails: number } | undefined;
  const fails = (row?.fails ?? 0) + 1;
  const lockedUntil = fails >= MAX_FAILS ? now + LOCK_MINUTES * 60 : 0;

  db().prepare(`
    INSERT INTO login_attempts (fingerprint, fails, locked_until, last_try)
    VALUES (@fp, @fails, @locked, @now)
    ON CONFLICT(fingerprint) DO UPDATE SET fails=@fails, locked_until=@locked, last_try=@now
  `).run({ fp, fails, locked: lockedUntil, now });
}

async function clearFails() {
  db().prepare(`DELETE FROM login_attempts WHERE fingerprint = ?`).run(await fingerprint());
}

// ————— الجلسات —————

export async function isAuthed(): Promise<boolean> {
  if (!adminConfigured()) return false;
  const id = (await cookies()).get(COOKIE)?.value;
  if (!id || id.length !== 64) return false;

  const now = Math.floor(Date.now() / 1000);
  const row = db().prepare(
    `SELECT expires_at FROM sessions WHERE id = ?`
  ).get(id) as { expires_at: number } | undefined;

  if (!row || row.expires_at < now) {
    if (row) db().prepare(`DELETE FROM sessions WHERE id = ?`).run(id);
    return false;
  }

  // تجديد زاحف — كل استخدام يمدد الجلسة
  db().prepare(`UPDATE sessions SET last_seen = ?, expires_at = ? WHERE id = ?`)
    .run(now, now + SESSION_DAYS * 86400, id);
  return true;
}

/** يحاول تسجيل الدخول. يرجع سبب الفشل إذا فشل */
export async function attemptLogin(input: string): Promise<{ ok: boolean; error?: string }> {
  if (!adminConfigured()) return { ok: false, error: "ADMIN_TOKEN غير مضبوط بالسيرفر" };

  const lock = await loginLock();
  if (lock.locked) {
    return { ok: false, error: `محاولات كثيرة فاشلة — انتظر ${lock.waitMinutes} دقيقة` };
  }

  if (!tokenMatches(input)) {
    await recordFail();
    const after = await loginLock();
    return {
      ok: false,
      error: after.locked
        ? `التوكن غير صحيح — انقفل الدخول ${LOCK_MINUTES} دقيقة`
        : `التوكن غير صحيح (${MAX_FAILS - after.fails} محاولات باقية)`,
    };
  }

  await clearFails();
  const id = randomBytes(32).toString("hex");
  const now = Math.floor(Date.now() / 1000);
  db().prepare(`
    INSERT INTO sessions (id, created_at, last_seen, expires_at, device)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, now, now, now + SESSION_DAYS * 86400, await fingerprint());

  (await cookies()).set(COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",     // lax حتى تشتغل مع التنقل الطبيعي بين الصفحات
    secure: await isHttps(),
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
  return { ok: true };
}

/** رسالة خطأ الدخول تنمرر بكوكي قصير العمر (اللايوت ما يستلم باراميترات الرابط) */
export async function setLoginError(msg: string) {
  (await cookies()).set("dj_login_err", msg, {
    httpOnly: true, sameSite: "lax", path: "/", maxAge: 15,
    secure: await isHttps(),
  });
}

export async function readLoginError(): Promise<string | null> {
  return (await cookies()).get("dj_login_err")?.value ?? null;
}

export async function signOut() {
  const jar = await cookies();
  const id = jar.get(COOKIE)?.value;
  if (id) db().prepare(`DELETE FROM sessions WHERE id = ?`).run(id);
  jar.delete(COOKIE);
}

/** يلغي كل الجلسات على كل الأجهزة */
export async function signOutEverywhere() {
  db().exec(`DELETE FROM sessions`);
  (await cookies()).delete(COOKIE);
}

export function activeSessions(): { id: string; created_at: number; last_seen: number }[] {
  const now = Math.floor(Date.now() / 1000);
  db().prepare(`DELETE FROM sessions WHERE expires_at < ?`).run(now);
  return db().prepare(
    `SELECT id, created_at, last_seen FROM sessions ORDER BY last_seen DESC`
  ).all() as never;
}

/**
 * حارس صفحات لوحة التحكم — يُستدعى بأول سطر بكل صفحة.
 * إذا الجلسة مو صالحة يوقف البناء فوراً ويحوّل لصفحة الدخول،
 * فما تنبني ولا بايت من محتوى اللوحة.
 */
export async function guardPage() {
  if (!(await isAuthed())) redirect("/login");
}

/** يرمي خطأ إذا الجلسة مو صالحة — يُستدعى ببداية كل server action */
export async function requireAdmin() {
  if (!(await isAuthed())) throw new Error("غير مصرّح — سجّل دخول للوحة التحكم");
}

/** يمنع إعادة التوجيه لموقع خارجي */
export function safeBack(v: string, fallback = "/admin/posts"): string {
  return /^\/(admin|job)(\/|\?|$)/.test(v) ? v : fallback;
}
