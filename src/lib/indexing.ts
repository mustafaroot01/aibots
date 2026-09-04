/**
 * فهرسة فورية — تخبر محركات البحث بكل وظيفة جديدة لحظة نشرها
 * بدل ما تنتظر الزحف الدوري (أسابيع أحياناً).
 *
 *  • Google Indexing API — مخصص رسمياً لصفحات JobPosting
 *  • IndexNow — يغطي Bing و Yandex (و ChatGPT Search يعتمد على فهرس Bing)
 */
import { createSign, randomBytes } from "node:crypto";
import { getMeta, setMeta } from "./db";
import type { Settings } from "./settings";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_INDEXING_URL = "https://indexing.googleapis.com/v3/urlNotifications:publish";
const INDEXNOW_URL = "https://api.indexnow.org/indexnow";

export interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id?: string;
}

/** يقرأ حساب الخدمة من الإعدادات ويتحقق من شكله */
export function parseServiceAccount(raw: string): ServiceAccount | null {
  if (!raw?.trim()) return null;
  try {
    const j = JSON.parse(raw);
    if (!j.client_email || !j.private_key) return null;
    return { client_email: j.client_email, private_key: j.private_key, project_id: j.project_id };
  } catch {
    return null;
  }
}

const b64url = (b: Buffer | string) =>
  Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/**
 * يوقّع JWT ويبدله بتوكن وصول من جوجل.
 * ما نحتاج مكتبة خارجية — node:crypto يوقّع RS256.
 */
async function googleAccessToken(sa: ServiceAccount): Promise<string> {
  const cached = getMeta("google_token");
  if (cached) {
    try {
      const { token, exp } = JSON.parse(cached);
      if (exp > Date.now() / 1000 + 60) return token;
    } catch { /* نتجاهل الكاش التالف */ }
  }

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/indexing",
    aud: GOOGLE_TOKEN_URL,
    exp: now + 3600,
    iat: now,
  }));

  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claim}`);
  const signature = b64url(signer.sign(sa.private_key.replace(/\\n/g, "\n")));
  const assertion = `${header}.${claim}.${signature}`;

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    signal: AbortSignal.timeout(20_000),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(`فشل توكن جوجل: ${data.error_description || data.error || res.status}`);
  }

  setMeta("google_token", JSON.stringify({ token: data.access_token, exp: now + 3500 }));
  return data.access_token as string;
}

/** يخبر جوجل بصفحة وظيفة جديدة أو محدّثة */
export async function pingGoogle(url: string, sa: ServiceAccount, deleted = false): Promise<void> {
  const token = await googleAccessToken(sa);
  const res = await fetch(GOOGLE_INDEXING_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ url, type: deleted ? "URL_DELETED" : "URL_UPDATED" }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    const d: any = await res.json().catch(() => ({}));
    const msg = d?.error?.message || `HTTP ${res.status}`;
    throw new Error(
      res.status === 403
        ? `جوجل رفض: ${msg} — تأكد إن حساب الخدمة مضاف كمالك بـ Search Console`
        : `فشل إبلاغ جوجل: ${msg}`
    );
  }
}

/** يخبر Bing و Yandex — بدون حساب ولا موافقة، بس مفتاح بملف نصي */
export async function pingIndexNow(urls: string[], key: string, host: string): Promise<void> {
  if (!key || !urls.length) return;

  const res = await fetch(INDEXNOW_URL, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      host,
      key,
      keyLocation: `https://${host}/${key}.txt`,
      urlList: urls.slice(0, 10_000),
    }),
    signal: AbortSignal.timeout(20_000),
  });

  // ٢٠٠ و ٢٠٢ نجاح · ٤٢٢ يعني المفتاح ما تطابق مع الملف
  if (![200, 202].includes(res.status)) {
    const body = await res.text().catch(() => "");
    throw new Error(
      res.status === 422
        ? "IndexNow رفض المفتاح — تأكد إن ملف المفتاح ينفتح على موقعك"
        : `IndexNow رد ${res.status} ${body.slice(0, 80)}`
    );
  }
}

/** يولّد مفتاح IndexNow (٣٢ خانة سداسية) */
export function newIndexNowKey(): string {
  return randomBytes(16).toString("hex");
}

export interface PingResult { google: string; indexnow: string }

/** يبلّغ المحركين معاً — ما نخلي فشل واحد يوقف الثاني */
export async function announce(urls: string[], s: Settings): Promise<PingResult> {
  const out: PingResult = { google: "مطفي", indexnow: "مطفي" };
  if (!urls.length) return out;

  const host = new URL(s.site_url).host;

  if (s.indexing_google) {
    const sa = parseServiceAccount(s.google_service_account);
    if (!sa) out.google = "إعدادات ناقصة";
    else {
      try {
        // حصة جوجل الافتراضية ٢٠٠ طلب باليوم — ننشر أحدث الروابط
        for (const u of urls.slice(0, 50)) await pingGoogle(u, sa);
        out.google = `أُبلغ ${Math.min(urls.length, 50)}`;
      } catch (e) {
        out.google = `فشل: ${e instanceof Error ? e.message : e}`;
      }
    }
  }

  if (s.indexing_indexnow) {
    if (!s.indexnow_key) out.indexnow = "ما موجود مفتاح";
    else {
      try {
        await pingIndexNow(urls, s.indexnow_key, host);
        out.indexnow = `أُبلغ ${urls.length}`;
      } catch (e) {
        out.indexnow = `فشل: ${e instanceof Error ? e.message : e}`;
      }
    }
  }

  return out;
}
