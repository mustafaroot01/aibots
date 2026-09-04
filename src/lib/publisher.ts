/**
 * ناشر تلجرام — ينشر الوظائف المقبولة بقناتك الخاصة عن طريق بوت.
 * ما يذكر القناة المصدر أبداً؛ المحتوى يطلع باسم قناتك.
 */
import { markTelegram } from "./db";
import { prettyPhone } from "./phone";
import { cleanBody, cutWords } from "./text";

export { cleanBody };
import type { JobRow } from "./types";
import type { Settings } from "./settings";

const CAPTION_LIMIT = 1024;   // حد تلجرام لتعليق الصورة
const MESSAGE_LIMIT = 4096;   // حد الرسالة النصية

const API = (token: string, method: string) => `https://api.telegram.org/bot${token}/${method}`;

async function call<T = any>(token: string, method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(API(token, method), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!data?.ok) {
    const retry = data?.parameters?.retry_after;
    throw new Error(
      `تلجرام رفض الطلب (${data?.error_code ?? res.status}): ${data?.description ?? "خطأ غير معروف"}` +
      (retry ? ` — أعد المحاولة بعد ${retry} ثانية` : "")
    );
  }
  return data.result as T;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** يفحص البوت والقناة — يرجع اسم البوت واسم القناة */
export async function testConnection(s: Settings): Promise<{ bot: string; chat: string }> {
  if (!s.publish_bot_token) throw new Error("ما موجود توكن البوت");
  if (!s.publish_channel) throw new Error("ما موجودة قناة النشر");
  const me = await call<{ username: string; first_name: string }>(s.publish_bot_token, "getMe", {});
  const chat = await call<{ title?: string; username?: string; type: string }>(
    s.publish_bot_token, "getChat", { chat_id: normalizeChat(s.publish_channel) }
  );
  return {
    bot: `@${me.username}`,
    chat: chat.title || (chat.username ? `@${chat.username}` : chat.type),
  };
}

export async function sendTestMessage(s: Settings): Promise<number> {
  const r = await call<{ message_id: number }>(s.publish_bot_token, "sendMessage", {
    chat_id: normalizeChat(s.publish_channel),
    text: "✅ تم ربط البوت بنجاح — هذي رسالة تجريبية من لوحة تحكم موقع الوظائف.",
    parse_mode: "HTML",
  });
  return r.message_id;
}

function normalizeChat(v: string): string {
  const t = v.trim();
  if (/^-?\d+$/.test(t)) return t;
  return t.startsWith("@") ? t : `@${t}`;
}


function buildVars(job: JobRow, s: Settings): Record<string, string> {
  const link = s.publish_include_link && s.site_url ? `${s.site_url}/job/${job.id}` : "";
  const phones = s.publish_include_phones ? job.phones.join(" · ") : "";

  return {
    title: job.title || "إعلان وظيفة",
    company: job.company || "",
    city: [job.city, job.area].filter(Boolean).join(" — "),
    area: job.area || "",
    category: job.category || "",
    type: job.employment_type || "",
    gender: job.gender && job.gender !== "الجنسين" ? job.gender : "",
    salary: job.salary || "",
    experience: job.experience || "",
    vacancies: job.vacancies ? String(job.vacancies) : "",
    summary: job.summary || "",
    text: cleanBody(job.raw_text),
    phones,
    phones_pretty: s.publish_include_phones ? job.phones.map(prettyPhone).join(" · ") : "",
    apply: applyLine(job),
    link,
    footer: s.publish_footer || "",
    channel: s.brand_channel ? `@${s.brand_channel}` : "",
  };
}

/** يعبّي القالب ويحذف أي سطر كل متغيراته فارغة */
/** يشيل سطر التقديم إذا كان مجرد تكرار لرقم الهاتف المعروض فوكه */
function applyLine(job: JobRow): string {
  const a = (job.apply_method || "").trim();
  if (!a) return "";
  const digits = a.replace(/\D/g, "");
  const onlyPhone = job.phones.some((p) => digits === p.replace(/\D/g, ""));
  return onlyPhone && a.length < 40 ? "" : a;
}

function fill(template: string, vars: Record<string, string>): string {
  const lines = template.split("\n").filter((line) => {
    const keys = [...line.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    if (!keys.length) return true;
    return keys.some((k) => (vars[k] ?? "").trim().length > 0);
  });

  return lines
    .join("\n")
    .replace(/\{(\w+)\}/g, (_, k) => escapeHtml(vars[k] ?? ""))
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * يبني نص الرسالة ضمن الحد المسموح.
 * إذا طلع أطول، نقصّ نص الإعلان أول شي — حتى يبقى العنوان والأرقام والرابط كاملين.
 */
export function renderMessage(job: JobRow, s: Settings, limit = MESSAGE_LIMIT): string {
  const vars = buildVars(job, s);
  let out = fill(s.publish_template, vars);
  if (out.length <= limit) return out;

  for (const key of ["text", "summary"]) {
    if (!vars[key]) continue;
    const over = out.length - limit;
    vars[key] = cutWords(vars[key], Math.max(60, vars[key].length - over - 4));
    out = fill(s.publish_template, vars);
    if (out.length <= limit) return out;
  }
  return cutWords(out, limit - 1);
}

export interface SendResult { ok: boolean; messageId?: number; error?: string; skipped?: boolean }

/** يرسل منشور حر (نص + صورة اختيارية) — يُستعمل للمنشور الدوري */
export async function sendPost(
  s: Settings, text: string, photo?: string
): Promise<SendResult> {
  if (!s.publish_bot_token || !s.publish_channel) {
    return { ok: false, skipped: true, error: "إعدادات البوت أو القناة ناقصة" };
  }
  const chat_id = normalizeChat(s.publish_channel);

  try {
    let messageId: number;
    if (photo && text.length <= CAPTION_LIMIT) {
      const r = await call<{ message_id: number }>(s.publish_bot_token, "sendPhoto", {
        chat_id, photo, caption: text, parse_mode: "HTML",
      });
      messageId = r.message_id;
    } else {
      const r = await call<{ message_id: number }>(s.publish_bot_token, "sendMessage", {
        chat_id, text: cutWords(text, MESSAGE_LIMIT), parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      });
      messageId = r.message_id;
    }
    return { ok: true, messageId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** ينشر وظيفة وحدة بالقناة ويحدّث حالتها بقاعدة البيانات */
export async function publishJob(job: JobRow, s: Settings): Promise<SendResult> {
  if (!s.publish_enabled) return { ok: false, skipped: true, error: "النشر بالقناة مطفي" };
  if (!s.publish_bot_token || !s.publish_channel) {
    return { ok: false, skipped: true, error: "إعدادات البوت أو القناة ناقصة" };
  }

  const chat_id = normalizeChat(s.publish_channel);
  const photo = s.publish_include_photo ? job.photos[0] : undefined;
  // مع الصورة نلتزم بحد التعليق، وبدونها نستغل حد الرسالة الكامل
  const text = renderMessage(job, s, photo ? CAPTION_LIMIT : MESSAGE_LIMIT);

  try {
    let messageId: number;
    if (photo) {
      const r = await call<{ message_id: number }>(s.publish_bot_token, "sendPhoto", {
        chat_id, photo, caption: text, parse_mode: "HTML",
      });
      messageId = r.message_id;
    } else {
      const r = await call<{ message_id: number }>(s.publish_bot_token, "sendMessage", {
        chat_id, text, parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      });
      messageId = r.message_id;
    }
    markTelegram(job.id, true, { messageId });
    return { ok: true, messageId };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    markTelegram(job.id, false, { error });
    return { ok: false, error };
  }
}
