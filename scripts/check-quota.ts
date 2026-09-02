/**
 * يفحص حالة حصة الذكاء الاصطناعي.
 *   npm run quota          ← من السجل المحلي، بدون ما يستهلك ولا طلب
 *   npm run quota -- --live ← يرسل طلب فعلي صغير للتأكد (يستهلك طلب واحد)
 */
import "../src/lib/env";
import { getMeta, db } from "../src/lib/db";
import { getSettings } from "../src/lib/settings";
import { providerStatus } from "../src/lib/classify";

const s = getSettings();
const ps = providerStatus();
const live = process.argv.includes("--live");

const baghdad = (d: Date) =>
  new Intl.DateTimeFormat("ar-IQ", { timeZone: "Asia/Baghdad", dateStyle: "short", timeStyle: "short" }).format(d);

console.log("═══ حالة الفلترة ═══");
console.log("  المزوّد:", ps.active === "rules" ? "كلمات مفتاحية (ما موجود مفتاح)" : `${ps.active} · ${ps.model}`);
console.log("  مفتاح Gemini:", ps.geminiKey ? "موجود ✅" : "ما موجود ❌");
console.log("  مفتاح Claude:", ps.claudeKey ? "موجود ✅" : "ما موجود");

const lastRun = getMeta("last_run");
const quotaOut = getMeta("quota_exhausted_at");
console.log("\n═══ آخر نشاط ═══");
console.log("  آخر دورة سحب:", lastRun ? baghdad(new Date(lastRun)) : "ما اشتغلت بعد");

const counts = db().prepare(
  `SELECT classifier, COUNT(*) c FROM posts WHERE classifier IS NOT NULL GROUP BY classifier`
).all() as any[];
console.log("  توزيع المصنِّف:", counts.map((r) => `${r.classifier}=${r.c}`).join(" · ") || "لا شيء");

// وقت تجدد الحصة: منتصف الليل بتوقيت المحيط الهادئ
const now = new Date();
const ptNow = new Date(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
const ptReset = new Date(ptNow);
ptReset.setDate(ptReset.getDate() + 1);
ptReset.setHours(0, 0, 0, 0);
const hours = (ptReset.getTime() - ptNow.getTime()) / 3_600_000;
const resetAt = new Date(now.getTime() + hours * 3_600_000);

console.log("\n═══ الحصة اليومية ═══");
if (quotaOut) {
  console.log("  ⚠️ انتهت الحصة:", baghdad(new Date(quotaOut)));
  console.log("  🕒 تتجدد تلقائياً:", baghdad(resetAt), `(بعد ${hours.toFixed(1)} ساعة)`);
  console.log("     ما تحتاج تسوي شي — جوجل يجددها لحاله.");
} else {
  console.log("  ✅ ما سجّلنا انتهاء حصة");
  console.log("  🕒 التجديد القادم:", baghdad(resetAt));
}

console.log("\n  الحد المجاني: ٢٠ طلب باليوم لكل موديل");
console.log(`  دفعتك الحالية: ${s.claude_batch_size} منشور بالطلب → حوالي ${20 * s.claude_batch_size} منشور باليوم`);

if (!live) {
  console.log("\n  (للفحص الفعلي: npm run quota -- --live — يستهلك طلب واحد)");
  process.exit(0);
}

// فحص حي
const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
if (!key) { console.log("\n❌ ما موجود مفتاح للفحص الحي"); process.exit(1); }

const res = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/${s.gemini_model}:generateContent?key=${key}`,
  {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: "1" }] }], generationConfig: { maxOutputTokens: 5 } }),
  }
);

const data: any = await res.json().catch(() => ({}));
console.log("\n═══ الفحص الحي ═══");
if (res.ok) {
  console.log(`  ✅ ${s.gemini_model} شغال — الحصة متوفرة، تكدر تشغّل: npm run reclassify all`);
} else {
  const err = data?.error ?? {};
  const daily = (err.details ?? []).flatMap((d: any) => d.violations ?? [])
    .find((v: any) => String(v.quotaId ?? "").includes("PerDay"));
  if (daily) {
    console.log(`  ⚠️ انتهت الحصة اليومية (${daily.quotaValue} طلب) لـ ${s.gemini_model}`);
    console.log(`  🕒 تتجدد: ${baghdad(resetAt)} — تلقائياً`);
  } else if (err.code === 403) {
    console.log(`  ❌ المفتاح مرفوض: ${String(err.message).slice(0, 120)}`);
  } else {
    console.log(`  ❌ ${err.code ?? res.status}: ${String(err.message ?? "").slice(0, 120)}`);
  }
}
