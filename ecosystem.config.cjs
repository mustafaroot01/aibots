/**
 * إعدادات pm2 — تشغّل الموقع والعامل سوا على السيرفر.
 *   pm2 start ecosystem.config.cjs && pm2 save
 *
 * يضيف راية node:sqlite تلقائياً على Node 22.5–23.3.
 */
const [maj, min] = process.versions.node.split(".").map(Number);
const needsFlag = maj < 23 || (maj === 23 && min < 4);

const env = {
  NODE_ENV: "production",
  NODE_NO_WARNINGS: "1",
  ...(needsFlag ? { NODE_OPTIONS: "--experimental-sqlite" } : {}),
};

module.exports = {
  apps: [
    {
      name: "jobs-web",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      cwd: __dirname,
      env,
      max_memory_restart: "500M",
      autorestart: true,
    },
    {
      name: "jobs-worker",
      script: "node_modules/.bin/tsx",
      args: "src/worker/run.ts cron",
      cwd: __dirname,
      env,
      max_memory_restart: "400M",
      autorestart: true,
      restart_delay: 10000,
    },
  ],
};
