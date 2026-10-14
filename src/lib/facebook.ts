/**
 * النشر بصفحة فيسبوك — Graph API.
 * يشتغل لصفحة انت تملكها أو تديرها، بتوكن صفحة (Page Access Token).
 * فيسبوك ما يدعم تنسيق HTML، فالنصوص تنرسل عادية.
 */
import type { JobRow } from "./types";
import type { Settings } from "./settings";
import type { BlogPost } from "./db";
import { cleanBody, cutWords } from "./text";
import { prettyPhone } from "./phone";
import { getMeta, setMeta } from "./db";

const API = "https://graph.facebook.com/v25.0";
const POST_LIMIT = 5000;

async function call<T = any>(
  path: string, token: string, body: Record<string, unknown>
): Promise<T> {
  const res = await fetch(`${API}/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, access_token: token }),
    signal: AbortSignal.timeout(25_000),
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok || data?.error) {
    throw new Error(readError(data?.error, res.status));
  }
  return data as T;
}

/** يترجم أخطاء فيسبوك لجمل عربية مفهومة */
function readError(err: any, status = 0): string {
  if (!err) return `فيسبوك رد بخطأ (${status})`;
  const code = err.code;
  const sub = err.error_subcode;
  const msg = String(err.message || "").slice(0, 160);

  if (code === 190) {
    if (sub === 463) return "توكن الصفحة انتهت صلاحيته — ولّد توكن جديد طويل الأمد";
    if (sub === 467) return "التوكن ملغي — غيّرت كلمة السر أو سحبت الصلاحية";
    return `التوكن غير صالح: ${msg}`;
  }
  if (code === 200 || code === 10) {
    return "ما عندك صلاحية النشر — تأكد من إضافة pages_manage_posts وإنك أدمن بالصفحة";
  }
  if (code === 100) return `طلب غير صالح: ${msg}`;
  if (code === 368) return "فيسبوك حظر النشر مؤقتاً بسبب كثرة المنشورات — قلّل المعدل";
  if (code === 4 || code === 17 || code === 613) return "تجاوزنا حد الطلبات — ننتظر شوي";
  if (code === 803) return "معرّف الصفحة غير موجود";
  return `${msg || "خطأ غير معروف"} (code ${code})`;
}

/** يفحص التوكن والصفحة — يرجع اسم الصفحة */
export async function testConnection(s: Settings): Promise<{ page: string; id: string }> {
  if (!s.fb_page_token) throw new Error("ما موجود توكن الصفحة");
  if (!s.fb_page_id) throw new Error("ما موجود معرّف الصفحة");

  const url = `${API}/${encodeURIComponent(s.fb_page_id)}?fields=id,name,fan_count&access_token=${encodeURIComponent(s.fb_page_token)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  const data = await res.json().catch(() => ({}));

  if (!res.ok || data?.error) throw new Error(readError(data?.error, res.status));
  return { page: data.name ?? "(بدون اسم)", id: data.id };
}

// ————— تجديد التوكن —————
//
// ميتا ألغت التوكن الدائمي: كل توكن صفحة عمره ٦٠ يوم كحد أقصى.
// الحل إننا نبدّله بواحد جديد قبل ما ينتهي — وهذا ممكن بأي وقت
// طالما التوكن الحالي ما انتهى بعد.

const KEY_EXP = "fb_token_expires_at";

/** يقرأ تاريخ انتهاء التوكن من فيسبوك ويخزنه */
export async function checkTokenExpiry(s: Settings): Promise<number> {
  if (!s.fb_page_token) return 0;
  const u = `${API}/debug_token?input_token=${encodeURIComponent(s.fb_page_token)}&access_token=${encodeURIComponent(s.fb_page_token)}`;
  const res = await fetch(u, { signal: AbortSignal.timeout(20_000) });
  const d = await res.json().catch(() => ({}));
  const exp = Number(d?.data?.expires_at ?? 0);
  setMeta(KEY_EXP, String(exp));
  return exp;
}

/** كم يوم باقي على انتهاء التوكن (من آخر فحص) */
export function daysUntilExpiry(): number | null {
  const exp = Number(getMeta(KEY_EXP) || 0);
  if (!exp) return null;
  return Math.floor((exp * 1000 - Date.now()) / 86_400_000);
}

export interface RefreshResult { ok: boolean; token?: string; days?: number; error?: string }

/**
 * يبدّل التوكن الحالي بواحد جديد عمره ٦٠ يوم.
 * يحتاج معرّف التطبيق وسرّه — والتوكن الحالي لازم يكون لسه صالح.
 */
export async function refreshToken(s: Settings): Promise<RefreshResult> {
  if (!s.fb_app_id || !s.fb_app_secret) {
    return { ok: false, error: "محتاجين معرّف التطبيق وسرّه حتى نجدد تلقائياً" };
  }
  if (!s.fb_page_token) return { ok: false, error: "ما موجود توكن حالي" };

  const u = `${API}/oauth/access_token?grant_type=fb_exchange_token`
    + `&client_id=${encodeURIComponent(s.fb_app_id)}`
    + `&client_secret=${encodeURIComponent(s.fb_app_secret)}`
    + `&fb_exchange_token=${encodeURIComponent(s.fb_page_token)}`;

  try {
    const res = await fetch(u, { signal: AbortSignal.timeout(25_000) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || d?.error) return { ok: false, error: readError(d?.error, res.status) };
    if (!d.access_token) return { ok: false, error: "ما رجع توكن جديد" };

    const exp = await checkTokenExpiry({ ...s, fb_page_token: d.access_token });
    const days = exp ? Math.floor((exp * 1000 - Date.now()) / 86_400_000) : 0;
    return { ok: true, token: d.access_token, days };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export interface FbResult { ok: boolean; postId?: string; error?: string; skipped?: boolean }

/** ينشر نصاً (مع صورة اختيارية) بالصفحة */
export async function postToPage(
  s: Settings, message: string, opts: { photo?: string; link?: string } = {}
): Promise<FbResult> {
  if (!s.fb_enabled) return { ok: false, skipped: true, error: "النشر بفيسبوك مطفي" };
  if (!s.fb_page_token || !s.fb_page_id) {
    return { ok: false, skipped: true, error: "إعدادات الصفحة ناقصة" };
  }

  const text = cutWords(message, POST_LIMIT, "…");

  try {
    if (opts.photo) {
      const r = await call<{ post_id?: string; id: string }>(
        `${encodeURIComponent(s.fb_page_id)}/photos`,
        s.fb_page_token,
        { url: opts.photo, caption: text }
      );
      return { ok: true, postId: r.post_id ?? r.id };
    }

    const r = await call<{ id: string }>(
      `${encodeURIComponent(s.fb_page_id)}/feed`,
      s.fb_page_token,
      opts.link ? { message: text, link: opts.link } : { message: text }
    );
    return { ok: true, postId: r.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** نص الوظيفة بصيغة فيسبوك — بدون وسوم HTML */
export function fbJobMessage(job: JobRow, s: Settings): string {
  const link = s.fb_include_link && s.site_url ? `${s.site_url}/job/${job.id}` : "";
  const phones = s.publish_include_phones && !s.hide_phones
    ? job.phones.map(prettyPhone).join(" · ") : "";

  const lines = [
    `💼 ${job.title || "إعلان وظيفة"}`,
    job.company ? `🏢 ${job.company}` : "",
    "",
    [job.city, job.area].filter(Boolean).length ? `📍 ${[job.city, job.area].filter(Boolean).join(" — ")}` : "",
    job.employment_type ? `🕒 ${job.employment_type}` : "",
    job.gender && job.gender !== "الجنسين" ? `👥 ${job.gender}` : "",
    job.salary ? `💰 ${job.salary}` : "",
    job.experience ? `🎓 ${job.experience}` : "",
    "",
    job.summary || cutWords(cleanBody(job.raw_text), 700),
    "",
    phones ? `📞 ${phones}` : "",
    job.apply_method && !phones ? `✅ ${job.apply_method}` : "",
    "",
    link ? `🔗 ${link}` : "",
    s.fb_footer.trim(),
  ];

  return lines.filter((l) => l !== "").join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** نص منشور المدونة بصيغة فيسبوك */
export function fbBlogMessage(post: BlogPost, s: Settings): string {
  const link = `${s.site_url}/blog/${post.slug}`;
  return [
    `✨ ${post.title}`,
    "",
    post.body,
    "",
    `🔗 ${link}`,
    s.fb_footer.trim(),
    "",
    s.bot_disclosure,
  ].filter((l) => l !== "").join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
