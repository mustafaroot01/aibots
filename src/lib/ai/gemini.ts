/** مزوّد Gemini — Google Gen AI SDK مع مخرجات JSON منظمة */
import { GoogleGenAI } from "@google/genai";
import { GEMINI_SCHEMA, LenientBatchSchema, buildSystem, buildUserPrompt, type ExtractionItem } from "./schema";
import type { RawPost } from "../types";
import type { Settings } from "../settings";
import { acquire, backoff } from "./rate";

let client: GoogleGenAI | null = null;

export function apiKey(): string {
  return (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
}

export function hasKey(): boolean {
  return apiKey().length > 20;
}

/** أخطاء الحصة اليومية — تنميّز حتى ما نضيع المنشورات بالفلترة الضعيفة */
export class QuotaExhausted extends Error {
  constructor(public model: string) {
    super(`انتهت الحصة اليومية المجانية لموديل ${model}`);
    this.name = "QuotaExhausted";
  }
}

/** سلسلة موديلات بديلة — كل موديل عنده حصة يومية مستقلة */
const FALLBACK_CHAIN = [
  "gemini-3.5-flash",
  "gemini-2.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-flash-lite-latest",
];

function nextModels(current: string): string[] {
  return FALLBACK_CHAIN.filter((m) => m !== current);
}

/** يفك رسالة خطأ جوجل الطويلة الى جملة عربية مفهومة */
function readError(e: unknown): { msg: string; retryAfter: number | null; daily: boolean } {
  const raw = e instanceof Error ? e.message : String(e);
  let body: any = null;
  try {
    body = JSON.parse(raw.slice(raw.indexOf("{")));
  } catch { /* مو JSON */ }

  const err = body?.error;
  if (!err) return { msg: raw.slice(0, 200), retryAfter: null, daily: false };

  if (err.code === 429) {
    const details = err.details || [];
    const violations = details.flatMap((d: any) => d.violations || []);
    const daily = violations.some((v: any) => String(v.quotaId || "").includes("PerDay"));
    const info = details.find((d: any) => d["@type"]?.includes("RetryInfo"));
    const secs = Number(String(info?.retryDelay || "").replace("s", "")) || 30;

    if (daily) {
      const limit = violations.find((v: any) => String(v.quotaId || "").includes("PerDay"))?.quotaValue;
      return { msg: `انتهت الحصة اليومية المجانية${limit ? ` (${limit} طلب)` : ""}`, retryAfter: null, daily: true };
    }
    return { msg: `تجاوزنا حد الطلبات بالدقيقة (${secs} ثانية انتظار)`, retryAfter: secs, daily: false };
  }
  if (err.code === 400) return { msg: `طلب غير صالح: ${String(err.message).slice(0, 120)}`, retryAfter: null, daily: false };
  if (err.code === 403) return { msg: "المفتاح غير صالح أو ما عنده صلاحية", retryAfter: null, daily: false };
  if (err.code === 404) return { msg: `الموديل غير متاح: ${String(err.message).slice(0, 120)}`, retryAfter: null, daily: false };
  if (err.code >= 500) return { msg: "خدمة Gemini مو متاحة حالياً", retryAfter: 15, daily: false };
  return { msg: String(err.message || raw).slice(0, 180), retryAfter: null, daily: false };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function run(
  chunk: RawPost[], cfg: Settings, attempt = 1, model = cfg.gemini_model, tried: string[] = []
): Promise<ExtractionItem[]> {
  if (!client) client = new GoogleGenAI({ apiKey: apiKey() });

  // كل محاولة (حتى الإعادة) تمر من منظّم السرعة
  await acquire(cfg.ai_rpm);

  let res;
  try {
    res = await callModel(chunk, cfg, model);
  } catch (e) {
    const { msg, retryAfter, daily } = readError(e);

    // الحصة اليومية خلصت لهذا الموديل — نجرب موديل ثاني (لكل موديل حصة مستقلة)
    if (daily) {
      const rest = nextModels(model).filter((m) => !tried.includes(m));
      if (rest.length) {
        console.log(`[gemini] ${msg} لـ ${model} — ننتقل الى ${rest[0]}`);
        return run(chunk, cfg, 1, rest[0], [...tried, model]);
      }
      throw new QuotaExhausted(model);
    }

    if (retryAfter && attempt <= 4) {
      const wait = Math.min(retryAfter + 2, 70);
      backoff(wait);
      console.log(`[gemini] ${msg} — ننتظر ${wait} ثانية (محاولة ${attempt}/4)`);
      await sleep(wait * 1000);
      return run(chunk, cfg, attempt + 1, model, tried);
    }
    throw new Error(msg);
  }

  return parseResponse(res);
}

async function callModel(chunk: RawPost[], cfg: Settings, model: string) {
  return client!.models.generateContent({
    model,
    contents: buildUserPrompt(chunk),
    config: {
      systemInstruction: buildSystem(),
      responseMimeType: "application/json",
      responseSchema: GEMINI_SCHEMA as never,
      temperature: 0,
      maxOutputTokens: 16000,
      // التفكير مطفي افتراضياً: نفس الدقة بالتصنيف، بس أسرع ٣ مرات وأرخص ٣ مرات
      thinkingConfig: { thinkingBudget: cfg.gemini_thinking ? -1 : 0 },
    },

  });
}

function parseResponse(res: Awaited<ReturnType<typeof callModel>>): ExtractionItem[] {
  const text = res.text;
  if (!text) {
    const reason = res.candidates?.[0]?.finishReason;
    throw new Error(`ما رجع نص من Gemini${reason ? ` (السبب: ${reason})` : ""}`);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("رد Gemini مو JSON صالح");
  }

  const parsed = LenientBatchSchema.safeParse(raw);
  if (!parsed.success) throw new Error(`رد Gemini ما يطابق المخطط: ${parsed.error.issues[0]?.message}`);

  // نكمّل الحقول الناقصة بقيم فارغة حتى يشتغل نفس مسار التنظيف
  return parsed.data.items.map((it) => ({
    post_id: it.post_id,
    is_job: it.is_job,
    confidence: it.confidence ?? 0.5,
    reason: it.reason ?? "",
    title: it.title ?? null,
    company: it.company ?? null,
    city: it.city ?? null,
    area: it.area ?? null,
    category: it.category ?? null,
    employment_type: it.employment_type ?? null,
    gender: it.gender ?? null,
    salary: it.salary ?? null,
    experience: it.experience ?? null,
    vacancies: it.vacancies ?? null,
    phones: it.phones ?? [],
    contacts: it.contacts ?? [],
    apply_method: it.apply_method ?? null,
    summary: it.summary ?? null,
    tags: it.tags ?? [],
  }));
}
