/**
 * إعدادات pm2 — تشغّل الموقع والعامل سوا على السيرفر.
 *   pm2 start ecosystem.config.cjs
 *   pm2 save && pm2 startup
 */
module.exports = {
  apps: [
    {
      name: "jobs-web",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      cwd: __dirname,
      env: { NODE_ENV: "production" },
      max_memory_restart: "400M",
    },
    {
      name: "jobs-worker",
      script: "node_modules/.bin/tsx",
      args: "src/worker/run.ts cron",
      cwd: __dirname,
      env: { NODE_ENV: "production" },
      max_memory_restart: "300M",
      restart_delay: 10000,
    },
  ],
};
