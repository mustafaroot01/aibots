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
    return "ما عندك صلاحية النشر — غالباً التوكن توكن مستخدم مو توكن صفحة. "
      + "شغّل: npm run setup-fb (يبدّله تلقائياً)";
  }
  if (code === 100) return `طلب غير صالح: ${msg}`;
  if (code === 368) return "فيسبوك حظر النشر مؤقتاً بسبب كثرة المنشورات — قلّل المعدل";
  if (code === 4 || code === 17 || code === 613) return "تجاوزنا حد الطلبات — ننتظر شوي";
  if (code === 803) return "معرّف الصفحة غير موجود";
  return `${msg || "خطأ غير معروف"} (code ${code})`;
}

// ————— تمييز نوع التوكن —————
//
// غلطة شائعة: المستخدم ينسخ توكن المستخدم (User) من Graph API Explorer
// بدل توكن الصفحة (Page). الاثنين يقدرون يقرون الصفحة، بس بس توكن
// الصفحة يقدر ينشر بيها — فالفحص ينجح والنشر يفشل بـ code 200.
// الحل: نميّز النوع، وإذا كان توكن مستخدم نبدّله بتوكن الصفحة تلقائياً.

async function get<T = any>(path: string): Promise<T> {
  const res = await fetch(`${API}/${path}`, { signal: AbortSignal.timeout(20_000) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) throw new Error(readError(data?.error, res.status));
  return data as T;
}

/** يرجع نوع التوكن: "PAGE" أو "USER" أو "" إذا ما عرفناه */
export async function tokenType(token: string): Promise<string> {
  try {
    const t = encodeURIComponent(token);
    const d = await get<{ data?: { type?: string } }>(`debug_token?input_token=${t}&access_token=${t}`);
    return String(d.data?.type ?? "").toUpperCase();
  } catch {
    return "";
  }
}

/**
 * يضمن إن التوكن توكن صفحة. إذا انلصق توكن مستخدم، يجيب توكن
 * الصفحة المقابل من /me/accounts — وهذا بعد يطلع توكن بلا انتهاء
 * إذا كان توكن المستخدم طويل الأمد.
 */
export async function resolvePageToken(
  pageId: string, token: string
): Promise<{ token: string; swapped: boolean }> {
  if ((await tokenType(token)) !== "USER") return { token, swapped: false };

  const d = await get<{ data?: { id: string; name: string; access_token: string }[] }>(
    `me/accounts?fields=id,name,access_token&limit=100&access_token=${encodeURIComponent(token)}`
  );
  const page = (d.data ?? []).find((p) => p.id === pageId);
  if (!page?.access_token) {
    const names = (d.data ?? []).map((p) => `${p.name} (${p.id})`).join("، ");
    throw new Error(
      names
        ? `هذا توكن مستخدم، وما لكينا الصفحة ${pageId} بصفحاتك. صفحاتك: ${names}`
        : "هذا توكن مستخدم وما عندك صفحات — تأكد إنك أدمن بالصفحة وإن pages_show_list مضافة"
    );
  }
  return { token: page.access_token, swapped: true };
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
// لتوكن الصفحة موعدين انتهاء، مو واحد:
//
//   expires_at              انتهاء التوكن نفسه. توكن الصفحة المشتق من
//                           توكن مستخدم طويل الأمد يرجع ٠ = ما ينتهي أبداً.
//   data_access_expires_at  انتهاء الوصول للبيانات. ميتا تحدده ٩٠ يوم من
//                           وقت الموافقة، وما يتمدد بالاستخدام ولا بتبديل
//                           التوكن — يتجدد بس لما تعيد الموافقة بفيسبوك.
//
// فالتوكن «الدائمي» يضل صالح شكلاً، بس الوصول يموت بعد ٩٠ يوم إذا ما
// جددت الموافقة. لهذا ننتبه للموعدين، ونفرّق بينهن: الأول نقدر نجدده
// تلقائياً، والثاني يحتاج تدخّلك.

const KEY_EXP = "fb_token_expires_at";
const KEY_DATA = "fb_data_expires_at";

export interface ExpiryInfo {
  /** يوم باقي على انتهاء التوكن نفسه — null يعني ما ينتهي */
  tokenDays: number | null;
  /** يوم باقي على انتهاء الوصول للبيانات — null يعني ما ينتهي */
  dataDays: number | null;
  /** الأقرب من الاثنين — null يعني ما بيه موعد أبداً */
  days: number | null;
  /** شنو اللي راح ينتهي أول: "token" أو "data" */
  first: "token" | "data" | null;
}

const toDays = (ts: number) => Math.floor((ts * 1000 - Date.now()) / 86_400_000);

/** يقرأ موعدي الانتهاء من فيسبوك ويخزنهن */
export async function checkTokenExpiry(s: Settings): Promise<ExpiryInfo> {
  if (!s.fb_page_token) return { tokenDays: null, dataDays: null, days: null, first: null };

  const t = encodeURIComponent(s.fb_page_token);
  const res = await fetch(`${API}/debug_token?input_token=${t}&access_token=${t}`,
    { signal: AbortSignal.timeout(20_000) });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || d?.error) throw new Error(readError(d?.error, res.status));

  setMeta(KEY_EXP, String(Number(d?.data?.expires_at ?? 0)));
  setMeta(KEY_DATA, String(Number(d?.data?.data_access_expires_at ?? 0)));
  return expiryInfo();
}

/** موعدي الانتهاء من آخر فحص */
export function expiryInfo(): ExpiryInfo {
  const exp = Number(getMeta(KEY_EXP) || 0);
  const dat = Number(getMeta(KEY_DATA) || 0);
  const tokenDays = exp ? toDays(exp) : null;
  const dataDays = dat ? toDays(dat) : null;

  if (tokenDays === null && dataDays === null) {
    return { tokenDays, dataDays, days: null, first: null };
  }
  const first: "token" | "data" =
    dataDays === null ? "token"
      : tokenDays === null ? "data"
        : tokenDays <= dataDays ? "token" : "data";
  return { tokenDays, dataDays, days: first === "token" ? tokenDays : dataDays, first };
}

/** كم يوم باقي على أقرب انتهاء (من آخر فحص) */
export function daysUntilExpiry(): number | null {
  return expiryInfo().days;
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
    return { ok: true, token: d.access_token, days: exp.tokenDays ?? 0 };
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

/** يمسح منشوراً من الصفحة — نستعمله لتنظيف منشور الاختبار */
export async function deletePost(s: Settings, postId: string): Promise<boolean> {
  if (!s.fb_page_token) return false;
  try {
    const res = await fetch(
      `${API}/${encodeURIComponent(postId)}?access_token=${encodeURIComponent(s.fb_page_token)}`,
      { method: "DELETE", signal: AbortSignal.timeout(20_000) }
    );
    return res.ok;
  } catch {
    return false;
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
