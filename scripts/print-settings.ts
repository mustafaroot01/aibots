/**
 * يطبع الإعدادات الحالية (أداة تشخيص محلية — مو مسار ويب).
 *   npx tsx scripts/print-settings.ts            ← الأسرار مخفية
 *   npx tsx scripts/print-settings.ts --reveal   ← يظهر الأسرار (للفحص فقط)
 */
import "../src/lib/env";
import { getSettings } from "../src/lib/settings";
import { maskSecret } from "../src/lib/crypto";

const reveal = process.argv.includes("--reveal");
const s = getSettings();

console.log(JSON.stringify({
  ...s,
  publish_bot_token: reveal ? s.publish_bot_token : maskSecret(s.publish_bot_token),
}, null, reveal ? 0 : 2));
