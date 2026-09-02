#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
#  حارس التشغيل — يتأكد إن الموقع والعامل شغالين، ويرجّعهن إذا وقفوا.
#  يشتغل من cron كل ٥ دقايق و@reboot — بدون صلاحيات root.
#
#  التركيب:  bash deploy/keepalive.sh --install
#  الفحص:    bash deploy/keepalive.sh
# ═══════════════════════════════════════════════════════════════
set -uo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR" || exit 1

PM2="$APP_DIR/node_modules/.bin/pm2"
[ -x "$PM2" ] || PM2="$(command -v pm2 || true)"
[ -n "$PM2" ] || { echo "ما لكينا pm2"; exit 1; }

# نضمن إن node بالمسار (cron ما يحمّل ملفات الشِل)
for d in /opt/plesk/node/*/bin "$HOME/.nvm/versions/node"/*/bin; do
  [ -x "$d/node" ] && PATH="$d:$PATH"
done
export PATH

LOG="$APP_DIR/data/keepalive.log"
mkdir -p "$APP_DIR/data"
say() { echo "[$(date '+%F %T')] $*" >> "$LOG"; }

# ——— وضع التركيب ———
if [ "${1:-}" = "--install" ]; then
  LINE_CRON="*/5 * * * * bash $APP_DIR/deploy/keepalive.sh >/dev/null 2>&1"
  LINE_BOOT="@reboot sleep 30 && bash $APP_DIR/deploy/keepalive.sh >/dev/null 2>&1"

  CUR="$(crontab -l 2>/dev/null | grep -v 'keepalive.sh' || true)"
  printf '%s\n%s\n%s\n' "$CUR" "$LINE_CRON" "$LINE_BOOT" | grep -v '^$' | crontab -

  echo "✅ انركّب الحارس بـ cron:"
  echo "   • فحص كل ٥ دقايق"
  echo "   • تشغيل تلقائي بعد إعادة تشغيل السيرفر"
  echo
  crontab -l | grep keepalive
  echo
  echo "   السجل: $LOG"
  exit 0
fi

# ——— تنبيه تعارض النسخ (يصير لما تنزّل نسخة pm2 والخادم شغال بنسخة ثانية) ———
VER_MSG=$("$PM2" status 2>&1 | grep -c "out-of-date" || true)
if [ "$VER_MSG" != "0" ]; then
  say "نسخة pm2 بالذاكرة مختلفة عن المنصّبة — نحدّث الخادم"
  "$PM2" update >/dev/null 2>&1
fi

# ——— الفحص ———
RUNNING=$("$PM2" jlist 2>/dev/null | grep -o '"status":"online"' | wc -l | tr -d ' ')

if [ "$RUNNING" -ge 2 ]; then
  exit 0    # كل شي تمام، ما نسجل شي حتى ما يكبر الملف
fi

say "لكينا $RUNNING عملية شغالة من ٢ — نعيد التشغيل"

# إذا الـ daemon نفسه مات، pm2 resurrect يرجّع كل شي من آخر حفظ
if ! "$PM2" ping >/dev/null 2>&1; then
  say "خادم pm2 مات — نرجّعه"
  "$PM2" resurrect >/dev/null 2>&1 || "$PM2" start ecosystem.config.cjs >/dev/null 2>&1
else
  "$PM2" start ecosystem.config.cjs >/dev/null 2>&1
fi

"$PM2" save >/dev/null 2>&1
AFTER=$("$PM2" jlist 2>/dev/null | grep -o '"status":"online"' | wc -l | tr -d ' ')
say "بعد المحاولة: $AFTER عملية شغالة"

# تنظيف السجل إذا كبر
[ -f "$LOG" ] && [ "$(wc -l < "$LOG")" -gt 500 ] && tail -200 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
exit 0
