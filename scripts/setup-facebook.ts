/**
 * ربط صفحة فيسبوك — خطوة بخطوة بالترمنال.
 *   npm run setup-fb
 */
import "../src/lib/env";
import { createInterface } from "node:readline/promises";
import { getSettings, saveSettings } from "../src/lib/settings";
import { postToPage, testConnection } from "../src/lib/facebook";

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = async (q: string, def = "") => (await rl.question(q)).trim() || def;

async function main() {
  const s = getSettings();

  console.log("\n═══════════════════════════════════════════");
  console.log("  ربط صفحة فيسبوك — نشر تلقائي");
  console.log("═══════════════════════════════════════════\n");
  console.log("قبل ما نبدي، جهّز التوكن (١٠ دقايق أول مرة):");
  console.log("  ١) developers.facebook.com ← My Apps ← Create App ← Business");
  console.log("  ٢) ضيف منتج: Facebook Login for Business");
  console.log("  ٣) افتح Graph API Explorer واختار تطبيقك");
  console.log("  ٤) Permissions: pages_manage_posts + pages_read_engagement");
  console.log("  ٥) Generate Access Token ← وافق على صفحتك");
  console.log("  ٦) بدّل من User Token الى Page Token ← اختار صفحتك");
  console.log("  ٧) للتوكن الطويل: Access Token Debugger ← Extend Access Token\n");

  const pageId = await ask(`معرّف الصفحة${s.fb_page_id ? ` [${s.fb_page_id}]` : ""}: `, s.fb_page_id);
  if (!pageId) { console.log("\n❌ ما موجود معرّف — وقفنا."); rl.close(); process.exit(1); }

  const token = await ask(`توكن الصفحة${s.fb_page_token ? " (Enter يبقي الحالي)" : ""}: `, s.fb_page_token);
  if (!token) { console.log("\n❌ ما موجود توكن — وقفنا."); rl.close(); process.exit(1); }

  const draft = { ...s, fb_page_id: pageId, fb_page_token: token, fb_enabled: true };

  console.log("\n── نفحص الاتصال...");
  try {
    const info = await testConnection(draft);
    console.log(`   ✅ متصل بصفحة: ${info.page} (${info.id})`);
  } catch (e) {
    console.log(`   ❌ ${e instanceof Error ? e.message : e}`);
    console.log("\n   تأكد من: التوكن توكن صفحة مو مستخدم · الصلاحيات مضافة · انت أدمن بالصفحة");
    rl.close(); process.exit(1);
  }

  console.log("\n── ننشر منشور تجريبي...");
  const r = await postToPage(draft, "✅ تم ربط الصفحة بنجاح — منشور تجريبي من موقع الوظائف.");
  if (r.ok) console.log(`   ✅ انرسل (${r.postId}) — شوف صفحتك`);
  else { console.log(`   ❌ ${r.error}`); rl.close(); process.exit(1); }

  const go = (await ask("\nنفعّل النشر التلقائي؟ [نعم/لا] (نعم): ", "نعم")).toLowerCase();
  const enable = !["لا", "no", "n", "كلا"].includes(go);

  saveSettings({ fb_page_id: pageId, fb_page_token: token, fb_enabled: enable });

  console.log("\n═══════════════════════════════════════════");
  console.log(enable ? "✅ خلص — النشر بفيسبوك مفعّل" : "✅ انحفظت الإعدادات — النشر مطفي");
  if (enable) {
    console.log("\n   كل وظيفة تنقبل تنشر بـ: الموقع · تلجرام · فيسبوك");
    console.log("\n   أعد تشغيل العامل:");
    console.log("     ./node_modules/.bin/pm2 restart jobs-worker");
  }
  console.log("   التوكن انخزن مشفّر بقاعدة البيانات.");
  console.log("═══════════════════════════════════════════\n");
  rl.close();
}

main().catch((e) => { console.error("\n❌ فشل:", e instanceof Error ? e.message : e); rl.close(); process.exit(1); });
