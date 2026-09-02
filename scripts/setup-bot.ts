/**
 * ربط بوت تلجرام بقناتك — خطوة بخطوة بالترمنال.
 *   npm run setup-bot
 */
import "../src/lib/env";
import { createInterface } from "node:readline/promises";
import { getSettings, saveSettings } from "../src/lib/settings";
import { sendTestMessage, testConnection } from "../src/lib/publisher";
import { fullStats } from "../src/lib/db";

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = async (q: string, def = "") => {
  const a = (await rl.question(q)).trim();
  return a || def;
};

async function main() {
  const s = getSettings();

  console.log("\n═══════════════════════════════════════════");
  console.log("  ربط بوت تلجرام — نشر تلقائي بقناتك");
  console.log("═══════════════════════════════════════════\n");

  console.log("قبل ما نبدي، لازم تسوي بوت (دقيقة وحدة):");
  console.log("  ١) افتح تلجرام وروح لـ  @BotFather");
  console.log("  ٢) ارسل:  /newbot");
  console.log("  ٣) اختار اسم وأي يوزر ينتهي بـ bot");
  console.log("  ٤) راح يعطيك توكن شكله:  123456789:AAH...");
  console.log("  ٥) روح لقناتك ← Administrators ← Add Admin ← اختار البوت");
  console.log("     وتأكد صلاحية «Post Messages» مفعّلة\n");

  const token = await ask(`توكن البوت${s.publish_bot_token ? " (اضغط Enter تبقي الحالي)" : ""}: `,
    s.publish_bot_token);
  if (!token) { console.log("\n❌ ما موجود توكن — وقفنا."); rl.close(); process.exit(1); }

  const channel = await ask(`قناة النشر [${s.publish_channel || "@" + (s.brand_channel || "MyChannel")}]: `,
    s.publish_channel || (s.brand_channel ? "@" + s.brand_channel : ""));
  if (!channel) { console.log("\n❌ ما موجودة قناة — وقفنا."); rl.close(); process.exit(1); }

  const draft = { ...s, publish_bot_token: token, publish_channel: channel };

  console.log("\n── نفحص الاتصال...");
  let info;
  try {
    info = await testConnection(draft as never);
    console.log(`   ✅ البوت ${info.bot} متصل بالقناة: ${info.chat}`);
  } catch (e) {
    console.log(`   ❌ ${e instanceof Error ? e.message : e}`);
    console.log("\n   تأكد من:");
    console.log("   • التوكن منسوخ كامل بدون فراغات");
    console.log("   • البوت مضاف كـ Administrator بالقناة");
    console.log("   • اسم القناة صحيح (يبدي بـ @ أو رقم يبدي بـ -100)");
    rl.close(); process.exit(1);
  }

  console.log("\n── نرسل رسالة تجريبية...");
  try {
    const id = await sendTestMessage(draft as never);
    console.log(`   ✅ انرسلت (رقم ${id}) — شوف قناتك`);
  } catch (e) {
    console.log(`   ❌ ${e instanceof Error ? e.message : e}`);
    console.log("   غالباً البوت ما عنده صلاحية «Post Messages».");
    rl.close(); process.exit(1);
  }

  const st = fullStats();
  console.log(`\n── عندك ${st.tg_queued} وظيفة منشورة بالموقع وما انرسلت لقناتك.`);
  console.log(`   الحارس ما ينشر إلا اللي عمره أقل من ${s.publish_max_age_hours} ساعة،`);
  console.log("   فالقديمة تنتخطى تلقائياً وما تغرق قناتك.\n");

  const go = (await ask("نفعّل النشر التلقائي الآن؟ [نعم/لا] (نعم): ", "نعم")).toLowerCase();
  const enable = !["لا", "no", "n", "كلا"].includes(go);

  saveSettings({
    publish_bot_token: token,
    publish_channel: channel,
    publish_enabled: enable,
  });

  console.log("\n═══════════════════════════════════════════");
  if (enable) {
    console.log("✅ خلص — النشر التلقائي مفعّل");
    console.log("\n   من الحين، كل وظيفة تنقبل:");
    console.log("     تلجرام ← فلترة ← الموقع ← قناتك");
    console.log("\n   أعد تشغيل العامل حتى يلتقط الإعداد:");
    console.log("     ./node_modules/.bin/pm2 restart jobs-worker");
  } else {
    console.log("✅ انحفظت الإعدادات — النشر مطفي");
    console.log("   تفعّله وقت ما تريد من /admin/settings");
  }
  console.log("   التوكن انخزن مشفّر بقاعدة البيانات.");
  console.log("═══════════════════════════════════════════\n");
  rl.close();
}

main().catch((e) => { console.error("\n❌ فشل:", e instanceof Error ? e.message : e); rl.close(); process.exit(1); });
