import { applyExtraction, insertRaw, jobsAwaitingTelegram, minSourceId, pendingPosts, setMeta, setTelegramStatus, db } from "./db";
import { classify, cleanTitle, rulesTitle } from "./classify";
import { extractPhones } from "./phone";
import { cleanBody, shorten } from "./text";
import { publishJob } from "./publisher";
import { getSettings } from "./settings";
import { announce } from "./indexing";
import { fetchChannel } from "./telegram";
import type { RawPost } from "./types";

export interface IngestResult {
  fetched: number;
  isNew: number;
  classified: number;
  published: number;
  rejected: number;
  classifier: string;
  tgSent: number;
  tgFailed: number;
  tgSkipped: number;
}

/** دورة كاملة: سحب من القناة ← تخزين الجديد ← فلترة وتحليل ← نشر بالموقع ← نشر بقناتك */
export async function ingestOnce(): Promise<IngestResult> {
  const cfg = getSettings();
  let fetched = 0, isNew = 0;

  for (const channel of cfg.tg_channels) {
    try {
      const posts = await fetchChannel(channel);
      fetched += posts.length;
      for (const p of posts) if (insertRaw(p)) isNew++;
    } catch (e) {
      console.error(`[ingest] فشل سحب @${channel}:`, e instanceof Error ? e.message : e);
    }
    if (cfg.tg_channels.length > 1) await sleep(1200);   // نتأنى بين القنوات
  }

  const result = await processPending();
  const tg = await publishQueued();
  setMeta("last_run", new Date().toISOString());
  return { fetched, isNew, ...result, ...tg };
}

/** يفلتر ويحلل كل المنشورات اللي بحالة pending */
export async function processPending(limit = 40) {
  const pending = pendingPosts(limit);
  if (!pending.length) return { classified: 0, published: 0, rejected: 0, classifier: "none" };

  const cfg = getSettings();
  const { results, classifier, quotaExhausted } = await classify(pending);
  let published = 0, rejected = 0;
  const publishedUrls: string[] = [];
  for (const p of pending) {
    const e = results.get(p.id);
    if (!e) continue;
    const status = applyExtraction(p.id, e, classifier, {
      autoPublish: cfg.auto_publish,
      threshold: cfg.confidence_threshold,
    });
    if (status === "rejected") rejected++;
    else {
      published++;
      publishedUrls.push(`${cfg.site_url}/job/${p.id}`);
    }
  }
  if (quotaExhausted) setMeta("quota_exhausted_at", new Date().toISOString());
  else setMeta("quota_exhausted_at", "");

  // نبلّغ محركات البحث بالوظائف الجديدة — بالخلفية، ما نعطّل الدورة
  if (publishedUrls.length && (cfg.indexing_google || cfg.indexing_indexnow)) {
    announce(publishedUrls, cfg)
      .then((r) => setMeta("last_index_ping", JSON.stringify({ at: new Date().toISOString(), ...r })))
      .catch(() => {});
  }

  return { classified: results.size, published, rejected, classifier, quotaExhausted };
}

/** ينشر الوظائف المنتظرة بقناة تلجرام الخاصة بك */
export async function publishQueued(limit = 10): Promise<{ tgSent: number; tgFailed: number; tgSkipped: number }> {
  const cfg = getSettings();
  let tgSent = 0, tgFailed = 0, skipped = 0;
  if (!cfg.publish_enabled) return { tgSent, tgFailed, tgSkipped: 0 };

  const maxAge = cfg.publish_max_age_hours * 3600;
  const nowTs = Math.floor(Date.now() / 1000);

  for (const job of jobsAwaitingTelegram(limit)) {
    // نتجاهل المنشورات القديمة (نتيجة الأرشفة) حتى ما نغرق القناة — بدون ما نعدها فشل
    if (job.posted_ts && nowTs - job.posted_ts > maxAge) {
      setTelegramStatus(job.id, "skipped", `تم تخطيه — أقدم من ${cfg.publish_max_age_hours} ساعة`);
      skipped++;
      continue;
    }
    const r = await publishJob(job, cfg);
    r.ok ? tgSent++ : tgFailed++;
    await sleep(cfg.publish_delay_seconds * 1000);
  }
  return { tgSent, tgFailed, tgSkipped: skipped };
}

/** يسحب الأرشيف القديم صفحة صفحة */
/** يسحب الأرشيف القديم من كل قناة، صفحة صفحة */
export async function backfill(pages = 5): Promise<{ isNew: number; perChannel: Record<string, number> }> {
  const cfg = getSettings();
  let isNew = 0;
  const perChannel: Record<string, number> = {};

  for (const channel of cfg.tg_channels) {
    let before = minSourceId(channel) || undefined;
    let got = 0;

    for (let i = 0; i < pages; i++) {
      let posts: RawPost[];
      try {
        posts = await fetchChannel(channel, before ? { before } : {});
      } catch (e) {
        console.error(`[backfill] @${channel}:`, e instanceof Error ? e.message : e);
        break;
      }
      if (!posts.length) break;
      for (const p of posts) if (insertRaw(p)) { isNew++; got++; }

      const oldest = Math.min(...posts.map((p) => p.id));
      if (before && oldest >= before) break;   // ما تقدمنا، نوقف
      before = oldest;
      await sleep(1200);
    }
    perChannel[channel] = got;
  }
  return { isNew, perChannel };
}

/** يعيد تصنيف منشورات معينة (بعد ما تعدّل الإعدادات مثلاً) */
export function markForReclassify(where: "rejected" | "all" = "rejected"): number {
  const sql = where === "all"
    ? `UPDATE posts SET status='pending'`
    : `UPDATE posts SET status='pending' WHERE status='rejected'`;
  return Number(db().prepare(sql).run().changes);
}

/**
 * يعيد استخراج أرقام الهاتف وينظّف العناوين لكل المنشورات الموجودة —
 * بدون ما يستهلك أي طلب ذكاء اصطناعي.
 */
export function repairExtraction(): number {
  const rows = db().prepare(`SELECT id, raw_text, phones, title, summary, classifier FROM posts`).all() as any[];
  const up = db().prepare(`UPDATE posts SET phones=?, title=?, summary=? WHERE id=?`);
  let changed = 0;

  for (const r of rows) {
    // بالإصلاح نعيد السحب من النص فقط — حتى ننظّف أي رقم غلط انخزن سابقاً
    const phones = extractPhones(r.raw_text || "");
    // للمصنّفة بالقواعد نعيد بناء العنوان من النص، وغيرها ننظّفه بس
    const isRules = r.classifier?.startsWith("rules");
    const title = isRules
      ? cleanTitle(rulesTitle(r.raw_text || "")) || r.title
      : r.title ? cleanTitle(r.title) : r.title;
    // الملخص ينعاد بناؤه بس للمصنّفة بالقواعد — ملخص الموديل أدق ما نلمسه
    const summary = isRules
      ? shorten(cleanBody(r.raw_text || ""), 190) || null
      : r.summary;

    if (JSON.stringify(phones) !== r.phones || title !== r.title || summary !== r.summary) {
      up.run(JSON.stringify(phones), title, summary, r.id);
      changed++;
    }
  }
  return changed;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
