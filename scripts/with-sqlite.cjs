#!/usr/bin/env node
/**
 * مشغّل يضيف راية --experimental-sqlite تلقائياً على نسخ Node القديمة.
 * Node 23.4+ ما يحتاجها، وNode 22.5–23.3 يحتاجها حتى يشتغل node:sqlite.
 *
 *   node scripts/with-sqlite.cjs <الأمر> [معاملات...]
 */
const { spawn } = require("node:child_process");

const [maj, min] = process.versions.node.split(".").map(Number);

if (maj < 22 || (maj === 22 && min < 5)) {
  console.error(
    `\n❌ نسخة Node الحالية ${process.version} ما تدعم قاعدة البيانات المدمجة.\n` +
    `   لازم Node 22.5 أو أحدث (يُنصح بـ 24).\n`
  );
  process.exit(1);
}

const needsFlag = maj < 23 || (maj === 23 && min < 4);
const env = { ...process.env };

if (needsFlag) {
  const opts = env.NODE_OPTIONS || "";
  if (!opts.includes("experimental-sqlite")) {
    env.NODE_OPTIONS = `${opts} --experimental-sqlite`.trim();
  }
}
// نكتم تحذير «ميزة تجريبية» حتى ما يلخبط السجلات
env.NODE_NO_WARNINGS = env.NODE_NO_WARNINGS || "1";

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) {
  console.error("الاستعمال: node scripts/with-sqlite.cjs <الأمر> [معاملات...]");
  process.exit(1);
}

spawn(cmd, args, { stdio: "inherit", env, shell: process.platform === "win32" })
  .on("exit", (code, signal) => process.exit(signal ? 1 : code ?? 0))
  .on("error", (e) => { console.error("فشل التشغيل:", e.message); process.exit(1); });
