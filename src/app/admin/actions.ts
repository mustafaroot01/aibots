"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  getJob, markTelegram, setStatus, setTelegramStatus,
} from "@/lib/db";
import { attemptLogin, requireAdmin, safeBack, setLoginError, signOut, signOutEverywhere } from "@/lib/auth";
import { getSettings, resetSettings, saveSettings, textToList, type Settings } from "@/lib/settings";
import { ingestOnce, markForReclassify, processPending, publishQueued } from "@/lib/ingest";
import { publishJob, sendTestMessage, testConnection } from "@/lib/publisher";
import { announce, newIndexNowKey, parseServiceAccount } from "@/lib/indexing";
import { searchJobs } from "@/lib/db";
import type { JobStatus } from "@/lib/types";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => Number(f.get(k));
const bool = (f: FormData, k: string) => f.get(k) === "on" || f.get(k) === "true";

/* ————————————————— الدخول والخروج ————————————————— */

export async function loginAction(formData: FormData) {
  const r = await attemptLogin(str(formData, "token"));
  if (!r.ok) {
    await setLoginError(r.error ?? "فشل الدخول");
    redirect("/admin");
  }
  redirect("/admin");
}

export async function logoutAction() {
  await signOut();
  redirect("/admin");
}

export async function logoutEverywhereAction() {
  await requireAdmin();
  await signOutEverywhere();
  redirect("/admin");
}

/* ————————————————— إدارة المنشورات ————————————————— */

export async function changeStatusAction(formData: FormData) {
  await requireAdmin();
  const id = num(formData, "id");
  const status = str(formData, "status") as JobStatus;
  const back = safeBack(str(formData, "back"));
  if (!Number.isFinite(id) || !["published", "rejected", "hidden", "pending", "pending_review"].includes(status)) {
    throw new Error("طلب غير صالح");
  }
  setStatus(id, status);

  // إذا صار منشور والنشر بالقناة مفعّل — نرسله فوراً بدون ما ننتظر دورة العامل
  let extra = "";
  if (status === "published") {
    const cfg = getSettings();
    const job = getJob(id);
    if (cfg.publish_enabled && job && job.tg_status !== "sent") {
      const r = await publishJob(job, cfg);
      extra = r.ok ? " · وانرسل لقناتك" : ` · بس فشل الإرسال لقناتك: ${r.error}`;
    }
  }

  revalidatePath("/admin/posts");
  revalidatePath("/");
  const sep = back.includes("?") ? "&" : "?";
  redirect(`${back}${sep}msg=${encodeURIComponent(`تم التحديث${extra}`)}`);
}

/** نشر منشور واحد بقناتك يدوياً */
export async function publishOneAction(formData: FormData) {
  await requireAdmin();
  const id = num(formData, "id");
  const back = safeBack(str(formData, "back"));
  const job = getJob(id);
  if (!job) throw new Error("المنشور غير موجود");

  const r = await publishJob(job, getSettings());
  revalidatePath("/admin/posts");
  redirect(`${back}${back.includes("?") ? "&" : "?"}msg=${encodeURIComponent(
    r.ok ? `تم النشر بالقناة (رسالة رقم ${r.messageId})` : `فشل النشر: ${r.error}`
  )}`);
}

/** يرجّع منشور لطابور النشر بالقناة */
export async function requeueAction(formData: FormData) {
  await requireAdmin();
  const id = num(formData, "id");
  const back = safeBack(str(formData, "back"));
  setTelegramStatus(id, "queued");
  revalidatePath("/admin/posts");
  redirect(back);
}

/* ————————————————— أوامر التشغيل ————————————————— */

export async function runIngestAction() {
  await requireAdmin();
  let msg: string;
  try {
    const r = await ingestOnce();
    msg = `تمت الدورة: سحبنا ${r.fetched}، جديد ${r.isNew}، صُنّف ${r.classified} (${r.classifier}) → نُشر ${r.published}، رُفض ${r.rejected}` +
      (r.tgSent || r.tgFailed ? ` · القناة: أُرسل ${r.tgSent}، فشل ${r.tgFailed}` : "");
  } catch (e) {
    msg = `فشلت الدورة: ${e instanceof Error ? e.message : e}`;
  }
  revalidatePath("/admin");
  revalidatePath("/");
  redirect(`/admin?msg=${encodeURIComponent(msg)}`);
}

export async function processPendingAction() {
  await requireAdmin();
  let msg: string;
  try {
    const r = await processPending(40);
    msg = `صُنّف ${r.classified} منشور (${r.classifier}) → نُشر ${r.published}، رُفض ${r.rejected}`;
  } catch (e) {
    msg = `فشلت الفلترة: ${e instanceof Error ? e.message : e}`;
  }
  revalidatePath("/admin");
  redirect(`/admin?msg=${encodeURIComponent(msg)}`);
}

export async function publishQueueAction() {
  await requireAdmin();
  let msg: string;
  try {
    const r = await publishQueued(10);
    msg = `النشر بالقناة: نجح ${r.tgSent}، فشل ${r.tgFailed}` + (r.tgSkipped ? `، تخطينا ${r.tgSkipped} منشور قديم` : "");
  } catch (e) {
    msg = `فشل النشر: ${e instanceof Error ? e.message : e}`;
  }
  revalidatePath("/admin");
  redirect(`/admin?msg=${encodeURIComponent(msg)}`);
}

export async function reclassifyAction(formData: FormData) {
  await requireAdmin();
  const scope = str(formData, "scope") === "all" ? "all" : "rejected";
  const n = markForReclassify(scope);
  revalidatePath("/admin");
  redirect(`/admin?msg=${encodeURIComponent(`رجّعنا ${n} منشور للفلترة — شغّل "فلترة المنتظر" أو انتظر العامل`)}`);
}

/* ————————————————— الإعدادات ————————————————— */

export async function saveSettingsAction(formData: FormData) {
  await requireAdmin();
  const section = str(formData, "section");
  const cur = getSettings();
  const patch: Partial<Settings> = {};

  if (section === "identity") {
    patch.site_name = str(formData, "site_name");
    patch.site_url = str(formData, "site_url");
    patch.brand_channel = str(formData, "brand_channel");
    patch.show_source_link = bool(formData, "show_source_link");
  } else if (section === "source") {
    const chans = String(formData.get("tg_channels") ?? "")
      .split(/[\n,،\s]+/).map((c) => c.trim().replace(/^@/, "")).filter(Boolean);
    if (chans.length) {
      patch.tg_channels = chans;
      patch.tg_channel = chans[0];
    }
    patch.poll_seconds = num(formData, "poll_seconds");
    patch.backfill_pages = num(formData, "backfill_pages");
  } else if (section === "ai") {
    patch.ai_provider = str(formData, "ai_provider") as Settings["ai_provider"];
    patch.gemini_model = str(formData, "gemini_model");
    patch.gemini_thinking = bool(formData, "gemini_thinking");
    patch.claude_model = str(formData, "claude_model");
    patch.claude_effort = str(formData, "claude_effort") as Settings["claude_effort"];
    patch.claude_batch_size = num(formData, "claude_batch_size");
    patch.ai_rpm = num(formData, "ai_rpm");
    patch.confidence_threshold = num(formData, "confidence_threshold");
    patch.auto_publish = bool(formData, "auto_publish");
    patch.prompt_extra = str(formData, "prompt_extra");
    patch.extra_job_words = textToList(str(formData, "extra_job_words"));
    patch.extra_reject_words = textToList(str(formData, "extra_reject_words"));
  } else if (section === "publish") {
    patch.publish_enabled = bool(formData, "publish_enabled");
    patch.publish_channel = str(formData, "publish_channel");
    patch.publish_template = String(formData.get("publish_template") ?? cur.publish_template);
    patch.publish_footer = str(formData, "publish_footer");
    patch.publish_include_photo = bool(formData, "publish_include_photo");
    patch.publish_include_phones = bool(formData, "publish_include_phones");
    patch.publish_include_link = bool(formData, "publish_include_link");
    patch.publish_delay_seconds = num(formData, "publish_delay_seconds");
    patch.publish_max_age_hours = num(formData, "publish_max_age_hours");
    const token = str(formData, "publish_bot_token");
    // نخلي التوكن القديم إذا الحقل انترك فارغ
    if (token && !token.startsWith("•")) patch.publish_bot_token = token;
  } else if (section === "indexing") {
    patch.indexing_google = bool(formData, "indexing_google");
    patch.indexing_indexnow = bool(formData, "indexing_indexnow");
    patch.google_verification = str(formData, "google_verification");
    patch.bing_verification = str(formData, "bing_verification");
    patch.indexnow_key = str(formData, "indexnow_key") || cur.indexnow_key || newIndexNowKey();
    const sa = String(formData.get("google_service_account") ?? "").trim();
    if (sa && !sa.startsWith("•")) patch.google_service_account = sa;

  } else if (section === "display") {
    patch.per_page = num(formData, "per_page");
    patch.hide_phones = bool(formData, "hide_phones");
    patch.show_visitor_count = bool(formData, "show_visitor_count");
  }

  saveSettings(patch);
  revalidatePath("/", "layout");
  redirect(`/admin/settings?msg=${encodeURIComponent("تم حفظ الإعدادات")}#${section}`);
}

export async function resetSettingsAction() {
  await requireAdmin();
  resetSettings();
  revalidatePath("/", "layout");
  redirect(`/admin/settings?msg=${encodeURIComponent("رجّعنا كل الإعدادات للوضع الافتراضي")}`);
}

/** يبني إعدادات مؤقتة من القيم المكتوبة بالنموذج — حتى تفحص قبل ما تحفظ */
function draftSettings(formData: FormData) {
  const cfg = getSettings();
  const token = str(formData, "publish_bot_token");
  const channel = str(formData, "publish_channel");
  return {
    ...cfg,
    publish_bot_token: token || cfg.publish_bot_token,
    publish_channel: channel || cfg.publish_channel,
  };
}

export async function testBotAction(formData: FormData) {
  await requireAdmin();
  let msg: string;
  try {
    const r = await testConnection(draftSettings(formData));
    msg = `✅ البوت ${r.bot} متصل بالقناة: ${r.chat}`;
  } catch (e) {
    msg = `❌ ${e instanceof Error ? e.message : e}`;
  }
  redirect(`/admin/settings?msg=${encodeURIComponent(msg)}#publish`);
}

export async function sendTestAction(formData: FormData) {
  await requireAdmin();
  let msg: string;
  try {
    const id = await sendTestMessage(draftSettings(formData));
    msg = `✅ انرسلت رسالة تجريبية للقناة (رقم ${id})`;
  } catch (e) {
    msg = `❌ ${e instanceof Error ? e.message : e}`;
  }
  redirect(`/admin/settings?msg=${encodeURIComponent(msg)}#publish`);
}


/** يبلّغ محركات البحث بكل الوظائف المنشورة (يُستعمل مرة بعد الضبط) */
export async function pingIndexAction() {
  await requireAdmin();
  const cfg = getSettings();
  const { rows } = searchJobs({ perPage: 100, page: 1 });
  const urls = rows.map((j) => `${cfg.site_url}/job/${j.id}`);

  let msg: string;
  try {
    const r = await announce(urls, cfg);
    msg = `أبلغنا ${urls.length} رابط · Google: ${r.google} · IndexNow: ${r.indexnow}`;
  } catch (e) {
    msg = `فشل الإبلاغ: ${e instanceof Error ? e.message : e}`;
  }
  redirect(`/admin/settings?msg=${encodeURIComponent(msg)}#indexing`);
}

/** يولّد مفتاح IndexNow جديد */
export async function newIndexKeyAction() {
  await requireAdmin();
  const key = newIndexNowKey();
  saveSettings({ indexnow_key: key, indexing_indexnow: true });
  redirect(`/admin/settings?msg=${encodeURIComponent(`المفتاح الجديد: ${key} — تأكد إنه ينفتح على موقعك`)}#indexing`);
}
