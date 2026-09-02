/**
 * عامل الخلفية: يسحب من قناة التلجرام، يفلتر بالذكاء الاصطناعي، ويخزّن بقاعدة البيانات.
 *
 *   npm run ingest      → دورة وحدة
 *   npm run worker      → يشتغل دائم كل POLL_SECONDS ثانية
 *   npm run backfill 10 → يسحب 10 صفحات من الأرشيف القديم
 *   npm run reclassify  → يعيد تصنيف المرفوضات
 */
import "../lib/env";
import { backfill, ingestOnce, markForReclassify, processPending, repairExtraction, sleep } from "../lib/ingest";
import { hasApiKey } from "../lib/classify";
import { stats } from "../lib/db";
import { getSettings } from "../lib/settings";

const mode = process.argv[2] || "once";


function log(...a: unknown[]) {
  console.log(`[${new Date().toISOString()}]`, ...a);
}

async function runOnce() {
  const r = await ingestOnce();
  log(
    `سحبنا ${r.fetched} | جديد ${r.isNew} | تصنيف ${r.classified} (${r.classifier}) → نُشر ${r.published}، رُفض ${r.rejected}` +
    (r.tgSent || r.tgFailed ? ` | قناتك: أُرسل ${r.tgSent}، فشل ${r.tgFailed}` : "")
  );
}

async function main() {
  if (!hasApiKey()) {
    log("⚠️  ما موجود ANTHROPIC_API_KEY — راح نشتغل بالفلترة بالكلمات المفتاحية فقط.");
  }

  switch (mode) {
    case "once":
      await runOnce();
      log("الحالة:", stats());
      break;

    case "cron": {
      const s0 = getSettings();
      log(`العامل اشتغل — فحص كل ${s0.poll_seconds} ثانية على القناة المصدر (${s0.tg_channel})`);
      for (;;) {
        try {
          await runOnce();
        } catch (e) {
          log("خطأ بالدورة:", e instanceof Error ? e.message : e);
        }
        // نقرا المهلة كل دورة حتى أي تعديل باللوحة يشتغل فوراً
        await sleep(getSettings().poll_seconds * 1000);
      }
    }

    case "backfill": {
      const pages = Number(process.argv[3] || 5);
      const r = await backfill(pages);
      log(`الأرشفة: ${r.isNew} منشور جديد، وصلنا للمنشور رقم ${r.oldest}`);
      for (;;) {
        const p = await processPending(40);
        if (!p.classified) break;
        log(`تصنيف ${p.classified} → نُشر ${p.published}، رُفض ${p.rejected}`);
      }
      log("الحالة:", stats());
      break;
    }

    case "reclassify": {
      const scope = (process.argv[3] as "rejected" | "all") || "rejected";
      const n = markForReclassify(scope);
      log(`رجّعنا ${n} منشور للفلترة من جديد...`);
      for (;;) {
        const p = await processPending(40);
        if (!p.classified) break;
        log(`تصنيف ${p.classified} → نُشر ${p.published}، رُفض ${p.rejected}`);
      }
      log("الحالة:", stats());
      break;
    }

    case "fix": {
      const n = repairExtraction();
      log(`صلّحنا الأرقام والعناوين لـ ${n} منشور`);
      break;
    }

    default:
      console.error(`وضع غير معروف: ${mode}. استخدم once | cron | backfill | reclassify | fix`);
      process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
