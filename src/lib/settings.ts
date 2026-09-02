/**
 * إعدادات الموقع — تُخزّن بقاعدة البيانات وتُعدّل من لوحة الإدارة،
 * وقيمها الافتراضية تجي من ملف البيئة. العامل يقراها كل دورة،
 * فأي تعديل من اللوحة يشتغل بدون ما تعيد تشغيل السيرفر.
 */
import { getMeta, setMeta } from "./db";
import { decryptSecret, encryptSecret, isEncrypted } from "./crypto";

export interface Settings {
  site_name: string;
  site_url: string;
  tg_channel: string;
  poll_seconds: number;

  ai_provider: "claude" | "gemini" | "rules";
  gemini_model: string;
  gemini_thinking: boolean;
  ai_rpm: number;   // أقصى طلبات بالدقيقة (الباقة المجانية لجيمناي = 5)
  claude_model: string;
  claude_effort: "low" | "medium" | "high" | "xhigh" | "max";
  claude_batch_size: number;
  prompt_extra: string;

  auto_publish: boolean;
  confidence_threshold: number;
  per_page: number;
  hide_phones: boolean;
  show_visitor_count: boolean;
  backfill_pages: number;

  extra_job_words: string[];
  extra_reject_words: string[];

  // الهوية والمصدر
  brand_channel: string;        // قناتك الخاصة (تظهر بالموقع)
  show_source_link: boolean;    // إظهار رابط المنشور الأصلي — مطفي افتراضياً

  // النشر التلقائي بقناتك
  publish_enabled: boolean;
  publish_bot_token: string;
  publish_channel: string;      // @username أو -100...
  publish_template: string;
  publish_footer: string;
  publish_include_photo: boolean;
  publish_include_phones: boolean;
  publish_include_link: boolean;
  publish_delay_seconds: number;
  publish_max_age_hours: number; // ما ينشر منشور أقدم من هذا العمر (يحمي من الأرشفة)
}

export const DEFAULT_TEMPLATE = `💼 <b>{title}</b>
🏢 {company}

📍 {city}
🕒 {type}
👥 {gender}
💰 {salary}
🎓 {experience}

{summary}

📞 {phones}
✅ {apply}

🔗 {link}
{footer}`;

export const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export const PROVIDERS = [
  { id: "claude", label: "Claude (Anthropic)", env: "ANTHROPIC_API_KEY" },
  { id: "gemini", label: "Gemini (Google)", env: "GEMINI_API_KEY" },
  { id: "rules", label: "بدون ذكاء اصطناعي — كلمات مفتاحية", env: "" },
] as const;

export const MODELS = [
  { id: "claude-opus-5", label: "Claude Opus 5 — الأدق (افتراضي)" },
  { id: "claude-sonnet-5", label: "Claude Sonnet 5 — متوازن وأرخص" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5 — الأرخص والأسرع" },
] as const;

export const GEMINI_MODELS = [
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash — متوازن (موصى به)" },
  { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash — الأسرع والأرخص" },
  { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash Lite — اقتصادي" },
  { id: "gemini-flash-latest", label: "Gemini Flash Latest — آخر إصدار دائماً" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro — الأدق والأغلى" },
] as const;

export function defaults(): Settings {
  return {
    site_name: process.env.SITE_NAME || "وظائف ديالى",
    site_url: process.env.SITE_URL || "http://localhost:3000",
    tg_channel: process.env.TG_CHANNEL || "Diyala_jobs",
    poll_seconds: Number(process.env.POLL_SECONDS || 180),

    ai_provider: (process.env.AI_PROVIDER as Settings["ai_provider"]) || "claude",
    gemini_model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    gemini_thinking: false,
    ai_rpm: Number(process.env.AI_RPM || 4),
    claude_model: process.env.CLAUDE_MODEL || "claude-opus-5",
    claude_effort: (process.env.CLAUDE_EFFORT as Settings["claude_effort"]) || "low",
    claude_batch_size: Number(process.env.CLAUDE_BATCH_SIZE || 8),
    prompt_extra: "",

    auto_publish: true,
    confidence_threshold: 0.5,
    per_page: 20,
    hide_phones: false,
    show_visitor_count: true,
    backfill_pages: 5,

    extra_job_words: [],
    extra_reject_words: [],

    brand_channel: process.env.BRAND_CHANNEL || "",
    show_source_link: false,

    publish_enabled: false,
    publish_bot_token: process.env.TG_BOT_TOKEN || "",
    publish_channel: process.env.TG_PUBLISH_CHANNEL || "",
    publish_template: DEFAULT_TEMPLATE,
    publish_footer: "",
    publish_include_photo: true,
    publish_include_phones: true,
    publish_include_link: true,
    publish_delay_seconds: 4,
    publish_max_age_hours: 48,
  };
}

const NUM_RANGE: Record<string, [number, number]> = {
  publish_delay_seconds: [1, 120],
  publish_max_age_hours: [1, 8760],
  poll_seconds: [30, 86_400],
  claude_batch_size: [1, 20],
  ai_rpm: [1, 300],
  confidence_threshold: [0, 1],
  per_page: [5, 60],
  backfill_pages: [1, 100],
};

let cache: { at: number; value: Settings } | null = null;

export function getSettings(): Settings {
  // كاش قصير حتى ما نقرا من القرص بكل استدعاء
  if (cache && Date.now() - cache.at < 3000) return cache.value;
  let stored: Partial<Settings> = {};
  try {
    stored = JSON.parse(getMeta("settings") || "{}");
  } catch {
    stored = {};
  }
  const value = sanitize({ ...defaults(), ...stored });
  // التوكن ينخزن مشفّر — نفكه للاستعمال الداخلي فقط
  value.publish_bot_token = decryptSecret(value.publish_bot_token);
  cache = { at: Date.now(), value };
  return value;
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const next = sanitize({ ...getSettings(), ...patch });
  const onDisk = {
    ...next,
    publish_bot_token: next.publish_bot_token ? encryptSecret(next.publish_bot_token) : "",
  };
  setMeta("settings", JSON.stringify(onDisk));
  cache = null;
  return next;
}

export function resetSettings(): Settings {
  setMeta("settings", "{}");
  cache = null;
  return getSettings();
}

function sanitize(s: Settings): Settings {
  const out = { ...s };
  for (const [key, [min, max]] of Object.entries(NUM_RANGE)) {
    const k = key as keyof Settings;
    const n = Number(out[k]);
    (out as any)[k] = Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : (defaults() as any)[k];
  }
  out.tg_channel = String(out.tg_channel || "").replace(/^@/, "").replace(/[^A-Za-z0-9_]/g, "").slice(0, 64)
    || defaults().tg_channel;
  out.site_name = String(out.site_name || "").trim().slice(0, 60) || defaults().site_name;
  out.site_url = String(out.site_url || "").trim().replace(/\/$/, "") || defaults().site_url;
  out.claude_effort = (EFFORTS as readonly string[]).includes(out.claude_effort)
    ? out.claude_effort : "low";
  out.claude_model = String(out.claude_model || "").trim() || defaults().claude_model;
  out.gemini_model = String(out.gemini_model || "").trim() || defaults().gemini_model;
  out.gemini_thinking = Boolean(out.gemini_thinking);
  out.ai_provider = (["claude", "gemini", "rules"] as const).includes(out.ai_provider)
    ? out.ai_provider : "claude";
  out.prompt_extra = String(out.prompt_extra || "").slice(0, 4000);
  out.auto_publish = Boolean(out.auto_publish);
  out.hide_phones = Boolean(out.hide_phones);
  out.show_visitor_count = Boolean(out.show_visitor_count);
  out.show_source_link = Boolean(out.show_source_link);
  out.publish_enabled = Boolean(out.publish_enabled);
  out.publish_include_photo = Boolean(out.publish_include_photo);
  out.publish_include_phones = Boolean(out.publish_include_phones);
  out.publish_include_link = Boolean(out.publish_include_link);
  out.brand_channel = String(out.brand_channel || "").replace(/^@/, "").replace(/[^A-Za-z0-9_]/g, "").slice(0, 64);
  const tok = String(out.publish_bot_token || "").trim();
  out.publish_bot_token = isEncrypted(tok) ? tok : tok.slice(0, 200);
  out.publish_channel = String(out.publish_channel || "").trim().slice(0, 80);
  out.publish_template = String(out.publish_template || "").slice(0, 4000) || DEFAULT_TEMPLATE;
  out.publish_footer = String(out.publish_footer || "").slice(0, 300);
  out.extra_job_words = cleanList(out.extra_job_words);
  out.extra_reject_words = cleanList(out.extra_reject_words);
  return out;
}

function cleanList(v: unknown): string[] {
  // نقبل الفاصلة العربية والإنكليزية والفاصلة المنقوطة والسطر الجديد
  const arr = Array.isArray(v) ? v : String(v ?? "").split(/[,،؛;\n]/);
  return [...new Set(arr.map((x) => String(x).trim()).filter((x) => x.length > 1))].slice(0, 100);
}

export const listToText = (a: string[]) => a.join("، ");

/** ملخص سريع لحالة الإعدادات — يُعرض بأعلى صفحة الإعدادات */
export function settingsHealth(s: Settings) {
  const claudeKey = (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || "");
  const geminiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "");
  const hasClaude = claudeKey.length > 20 && !claudeKey.includes("...");
  const hasGemini = geminiKey.length > 20;
  const aiOn = s.ai_provider !== "rules" && (s.ai_provider === "gemini" ? hasGemini : hasClaude);
  const pubReady = s.publish_enabled && !!s.publish_bot_token && !!s.publish_channel;
  return {
    aiOn,
    hasClaude,
    hasGemini,
    provider: s.ai_provider,
    pubOn: s.publish_enabled,
    pubReady,
    pubBroken: s.publish_enabled && !pubReady,
    autoPublish: s.auto_publish,
    sourceHidden: !s.show_source_link,
  };
}
export const textToList = (s: string) => cleanList(s);
