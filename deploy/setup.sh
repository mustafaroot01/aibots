#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
#  تنصيب موقع وظائف ديالى على سيرفر Plesk أو أي VPS
#  التشغيل:  bash deploy/setup.sh
#  ما يحتاج صلاحيات root — يشتغل بحساب المستخدم العادي
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"
echo "📁 مجلد المشروع: $APP_DIR"

# ——— ١) فحص نسخة Node ———
echo
echo "═══ ١) فحص Node ═══"
if ! command -v node >/dev/null 2>&1; then
  echo "❌ Node مو منصّب. نصّب Node 24:"
  echo "   curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash - && sudo apt install -y nodejs"
  exit 1
fi
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
NODE_MINOR=$(node -p "process.versions.node.split('.')[1]")
echo "   النسخة الحالية: $(node -v)"

node_ok() { [ "$1" -gt 22 ] || { [ "$1" -eq 22 ] && [ "$2" -ge 5 ]; }; }

if ! node_ok "$NODE_MAJOR" "$NODE_MINOR"; then
  echo "   ⚠️  النسخة قديمة — ندوّر على نسخة أحدث بالسيرفر..."
  FOUND=""
  # Plesk يخزن نسخ Node هنا
  for d in /opt/plesk/node/*/bin /usr/local/n/versions/node/*/bin "$HOME/.nvm/versions/node"/*/bin; do
    [ -x "$d/node" ] || continue
    V=$("$d/node" -p "process.versions.node" 2>/dev/null) || continue
    M=${V%%.*}; R=${V#*.}; R=${R%%.*}
    if node_ok "$M" "$R"; then FOUND="$d"; fi
  done

  if [ -n "$FOUND" ]; then
    export PATH="$FOUND:$PATH"
    echo "   ✅ لكينا نسخة أحدث: $("$FOUND/node" -v) بـ $FOUND"
    echo "   💡 خليها دائمة:  echo 'export PATH=\"$FOUND:\$PATH\"' >> ~/.bashrc"
    NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
    NODE_MINOR=$(node -p "process.versions.node.split('.')[1]")
  else
    echo
    echo "❌ لازم Node 22.5 أو أحدث. خيارات:"
    echo
    echo "   ١) من لوحة Plesk (الأسهل):"
    echo "      Extensions → Node.js → نصّب نسخة 22 أو أحدث"
    echo "      وبعدها: Domains → دومينك → Node.js → اختار النسخة"
    echo
    echo "   ٢) بدون صلاحيات root (nvm):"
    echo "      curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash"
    echo "      source ~/.nvm/nvm.sh && nvm install 24 && nvm alias default 24"
    echo
    echo "   ٣) بصلاحيات root:"
    echo "      curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash - && sudo apt install -y nodejs"
    exit 1
  fi
fi

if [ "$NODE_MAJOR" -lt 23 ] || { [ "$NODE_MAJOR" -eq 23 ] && [ "$NODE_MINOR" -lt 4 ]; }; then
  echo "   ✅ النسخة مدعومة (راح نضيف راية --experimental-sqlite تلقائياً)"
else
  echo "   ✅ النسخة كافية"
fi

# ——— ٢) ملف الإعدادات ———
echo
echo "═══ ٢) ملف الإعدادات ═══"
if [ -f .env.local ]; then
  echo "   ✅ .env.local موجود — ما نلمسه"
else
  cat > .env.local <<'ENVFILE'
# ——— القناة المصدر ———
TG_CHANNEL=Diyala_jobs

# ——— الذكاء الاصطناعي ———
AI_PROVIDER=gemini
GEMINI_API_KEY=__PUT_YOUR_GEMINI_KEY_HERE__
GEMINI_MODEL=gemini-3.5-flash
AI_RPM=4
CLAUDE_MODEL=claude-opus-5
CLAUDE_EFFORT=low
CLAUDE_BATCH_SIZE=12

# ——— قاعدة البيانات والتشغيل ———
DB_PATH=./data/jobs.db
POLL_SECONDS=180

# ——— الأمان (مولّدة عشوائياً — لا تشاركها) ———
ADMIN_TOKEN=__GENERATED_ON_SERVER__
SECRET_KEY=__GENERATED_ON_SERVER__

# ——— الموقع ———
SITE_NAME=وظائف ديالى
SITE_URL=https://غيّرني-للدومين-مالك.com
BRAND_CHANNEL=diyalajob

# ——— النشر بقناتك (املأهن من لوحة التحكم) ———
TG_BOT_TOKEN=
TG_PUBLISH_CHANNEL=
ENVFILE
  chmod 600 .env.local
  echo "   ✅ انبنى .env.local بمفاتيح عشوائية"
  echo "   ⚠️  عدّل SITE_URL للدومين مالك: nano .env.local"
fi

# ——— ٣) حماية الملفات الحساسة ———
echo
echo "═══ ٣) حماية الملفات ═══"
mkdir -p data
chmod 700 data 2>/dev/null || true
chmod 600 .env.local 2>/dev/null || true

# إذا المشروع داخل httpdocs، نمنع الوصول المباشر للملفات الحساسة
WEB_EXPOSED=0
case "$APP_DIR" in
  *httpdocs*|*public_html*|*/www/*) WEB_EXPOSED=1 ;;
esac
# بـ Plesk مجلد النطاق الفرعي نفسه ممكن يكون هو جذر الويب
if [ -d "$APP_DIR/../conf" ] && [ ! -d "$APP_DIR/httpdocs" ]; then WEB_EXPOSED=1; fi

if [ "$WEB_EXPOSED" = "1" ]; then
  echo "   ⚠️  المجلد ممكن يكون مكشوف للويب — نضيف حماية"
  cat > .htaccess <<'HTA'
# منع الوصول المباشر لأي ملف حساس
<FilesMatch "^(\.env.*|.*\.db|.*\.db-.*|package.*\.json|.*\.ts|.*\.tsx)$">
  Require all denied
</FilesMatch>
RedirectMatch 404 /\.git
RedirectMatch 404 /data/
RedirectMatch 404 /src/
RedirectMatch 404 /node_modules/
HTA
  echo "   ✅ انضاف .htaccess"
  echo "   💡 الأفضل تنقل المشروع خارج httpdocs — شوف الملاحظة بآخر السكربت"
fi

# ——— ٤) تنصيب الحزم والبناء ———
echo
echo "═══ ٤) تنصيب الحزم ═══"
npm ci --no-audit --no-fund 2>/dev/null || npm install --no-audit --no-fund
echo "   ✅ الحزم انصبّت"

echo
echo "═══ ٥) بناء الموقع ═══"
npm run build
echo "   ✅ البناء تم"

# ——— ٦) تعبئة أولية ———
echo
echo "═══ ٦) تعبئة أولية من القناة ═══"
npm run backfill 5 || echo "   ⚠️ الأرشفة فشلت — ما تأثر، العامل راح يجيب الجديد"

# ——— ٧) pm2 ———
echo
echo "═══ ٧) التشغيل الدائم ═══"
if ! command -v pm2 >/dev/null 2>&1; then
  echo "   نصّب pm2..."
  npm install -g pm2
fi
pm2 delete jobs-web jobs-worker 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save
# التشغيل عند إقلاع السيرفر (يحتاج root — نطبع الأمر إذا ما نقدر)
pm2 startup systemd -u "$(whoami)" --hp "$HOME" 2>/dev/null | tail -2 || \
  echo "   💡 حتى يشتغل بعد إعادة تشغيل السيرفر، نفّذ الأمر اللي يطبعه: pm2 startup"

echo
echo "═══════════════════════════════════════════════"
echo "✅ خلص التنصيب"
echo
echo "   الموقع شغال على:  http://127.0.0.1:3000"
echo "   توكن لوحة التحكم: $(grep '^ADMIN_TOKEN=' .env.local | cut -d= -f2)"
echo
echo "   الخطوة الأخيرة — وصّل الدومين بالمنفذ 3000:"
echo "   • Plesk: Domains → دومينك → Apache & nginx Settings"
echo "     شيل صح «Proxy mode» وحط بـ «Additional nginx directives»:"
echo
echo "       location / {"
echo "           proxy_pass http://127.0.0.1:3000;"
echo "           proxy_http_version 1.1;"
echo "           proxy_set_header Host \$host;"
echo "           proxy_set_header X-Real-IP \$remote_addr;"
echo "           proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;"
echo "           proxy_set_header X-Forwarded-Proto \$scheme;"
echo "       }"
echo
echo "   • nginx عادي: انسخ deploy/nginx.conf وعدّل server_name"
echo
echo "   أوامر مفيدة:"
echo "     pm2 logs jobs-worker    ← متابعة السحب والفلترة"
echo "     pm2 restart all         ← إعادة تشغيل"
echo "     pm2 status              ← الحالة"
echo "═══════════════════════════════════════════════"
