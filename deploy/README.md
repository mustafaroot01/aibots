# النشر على السيرفر

## وين أحط المشروع؟

**لا تحطه داخل `httpdocs`** — أي ملف هناك ينقرأ من المتصفح مباشرة، يعني أي شخص
يكدر يفتح `موقعك.com/.env.local` ويشوف مفاتيحك، أو `موقعك.com/data/jobs.db`
وينزّل قاعدة بياناتك كاملة.

تطبيق Node ما يحتاج يكون بمجلد الويب أصلاً — هو يشتغل على منفذ (3000)
وnginx يمرّر الطلبات له. مجلد `httpdocs` يظل فاضي.

### الترتيب الصحيح (Plesk)

```
/var/www/vhosts/موقعك.com/
├── httpdocs/          ← يظل فاضي (nginx يمرّر كل شي للتطبيق)
└── jobsapp/           ← 👈 المشروع هنا
    ├── .env.local     ← محمي، ما ينوصله من الويب
    ├── data/jobs.db   ← محمي
    └── ...
```

### نقل المشروع من httpdocs

```bash
cd /var/www/vhosts/موقعك.com
mkdir -p jobsapp
mv httpdocs/* httpdocs/.[!.]* jobsapp/ 2>/dev/null
cd jobsapp
```

بعدها شغّل: `bash deploy/setup.sh`

### إذا ما تكدر تنقله

السكربت يضيف `.htaccess` يمنع الوصول للملفات الحساسة، لكن هذي طبقة واحدة —
النقل أأمن.

---

## ربط الدومين بالتطبيق

### Plesk

**Domains → دومينك → Apache & nginx Settings**

**١) شيل الصح عن هذي الخيارات:**
- ☐ **Proxy mode**
- ☐ **Serve static files directly by nginx** (أو "Smart static files processing")

**٢) بخانة «Additional nginx directives» حط:**

```nginx
location ~ ^/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
    proxy_read_timeout 300;
}
```

> **ليش `location ~ ^/` مو `location /`؟**
> Plesk يولّد `location /` بنفسه، وإذا كتبت واحد مثله يطلع خطأ:
> `duplicate location "/"`.
> `~ ^/` تعبير نمطي يطابق كل المسارات، و nginx يعطي التعابير النمطية أولوية
> أعلى من المطابقة بالبادئة — يعني كل الطلبات تروح للتطبيق.

**٣) Apply** ثم **SSL/TLS Certificates → Let's Encrypt**

> **مهم:** `X-Forwarded-Proto` ضروري — بدونه كوكي لوحة التحكم ما تكون Secure.

#### إذا ظل يطلع خطأ

جرّب تعطّل **nginx caching** من نفس الصفحة، أو استخدم إضافة **Node.js** بـ Plesk:
Extensions → Node.js → Application Root = مجلد المشروع، Startup File = `node_modules/next/dist/bin/next`.

### nginx عادي (بدون Plesk)

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/jobs
sudo ln -s /etc/nginx/sites-available/jobs /etc/nginx/sites-enabled/
sudo nano /etc/nginx/sites-available/jobs   # غيّر server_name
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d موقعك.com
```

---

## أوامر التشغيل

> إذا انصبّ pm2 داخل المشروع (ما عندك صلاحيات عامة)، بدّل `pm2` بـ `./node_modules/.bin/pm2`
> أو سوّي اختصار: `alias pm2=./node_modules/.bin/pm2`

| الأمر | الوظيفة |
|---|---|
| `bash deploy/setup.sh` | تنصيب كامل من الصفر (ما يحتاج root) |
| `pm2 status` | حالة التطبيق والعامل |
| `pm2 logs jobs-worker` | متابعة السحب والفلترة مباشرة |
| `pm2 restart all` | إعادة تشغيل |
| `npm run ingest` | دورة سحب يدوية |
| `npm run backfill 10` | سحب ١٠ صفحات من الأرشيف |
| `npm run reclassify all` | إعادة فلترة كل شي |

## بعد التشغيل

1. افتح `https://موقعك.com/admin` وسجّل دخول بالتوكن اللي طبعه السكربت
2. من الإعدادات: غيّر **رابط الموقع** للدومين مالك
3. فعّل **النشر بقناتك**: بوت من @BotFather → أدمن بقناتك → حط التوكن

## النسخ الاحتياطي

كل شي بملف واحد:
```bash
cp data/jobs.db ~/backup-$(date +%F).db
```


---

## تحديث المشروع على السيرفر

```bash
cd /var/www/vhosts/diyala.org/jobs.diyala.org
git fetch origin
git reset --hard origin/main    # يتجاوز أي اختلاف بالتاريخ
npm install --no-audit --no-fund
npm run build
./node_modules/.bin/pm2 restart all
```

> `git reset --hard` **ما يمس** `.env.local` ولا `data/jobs.db` ولا `node_modules` —
> كلهن خارج تتبّع git. يرجّع بس ملفات الكود لآخر نسخة.

### إذا طلعت «divergent branches»

هذا يصير لما ينكتب تاريخ المستودع من جديد (مثلاً بعد إزالة سر مسرّب).
الحل نفس الأمر أعلاه: `git reset --hard origin/main`.


---

## خلّي العامل شغال دائماً

pm2 يشغّل العمليات كخادم مستقل — **تسكّر الترمنال وهي تظل شغالة**. بس فيه حالتين توقف بيهن:
إعادة تشغيل السيرفر، وبعض إعدادات النظام اللي تقتل عمليات المستخدم عند الخروج.

### الحل (بدون صلاحيات root)

```bash
bash deploy/keepalive.sh --install
```

يركّب مهمتين بـ cron:
- **فحص كل ٥ دقايق** — إذا وقف شي يرجّعه
- **`@reboot`** — يشتغل تلقائياً بعد إعادة تشغيل السيرفر

للتأكد: `crontab -l | grep keepalive` · السجل: `data/keepalive.log`

### إذا عندك root (أنظف)

```bash
sudo env PATH=$PATH:/opt/plesk/node/22/bin \
  ./node_modules/.bin/pm2 startup systemd -u $(whoami) --hp $HOME
./node_modules/.bin/pm2 save
```

بعدها systemd نفسه يشغّل pm2 عند الإقلاع. الحارس يظل مفيد كطبقة ثانية.

### إذا طلع تنبيه «In-memory PM2 is out-of-date»

يعني خادم pm2 اللي بالذاكرة نسخته غير النسخة المنصّبة بالمشروع. الحل:

```bash
./node_modules/.bin/pm2 update
```

يحدّث الخادم ويرجّع العمليات تلقائياً. الحارس يسوي هذا لحاله إذا صادفه.

### فحص يدوي

```bash
./node_modules/.bin/pm2 status          # لازم الاثنين online
./node_modules/.bin/pm2 logs jobs-worker --lines 20
bash deploy/keepalive.sh                # فحص فوري
```


---

## حصة Gemini المجانية

**٢٠ طلب باليوم لكل موديل** — وتتجدد **تلقائياً** كل يوم منتصف الليل بتوقيت المحيط
الهادئ، اللي يقابل **١٠:٠٠ صباحاً بتوقيت بغداد**. ما تحتاج تسوي أي شي.

بدفعة ١٢ منشور بالطلب: **٢٤٠ منشور باليوم** — أضعاف حاجة أي قناة.

### الفحص

```bash
npm run quota              # من السجل المحلي، بدون استهلاك
npm run quota -- --live    # فحص فعلي (طلب واحد)
```

### إذا خلصت الحصة

النظام يتصرف لحاله بثلاث مراحل:
1. **ينتقل لموديل ثاني** — كل موديل عنده حصة مستقلة
2. **إذا خلصت كل الحصص**، يخلي المنشورات **بالانتظار** بدل ما ينشرها بفلترة ضعيفة
3. الدورة الجاية بعد التجديد تصنّفهن صح تلقائياً

يعني ما تخسر ولا منشور، وما تحتاج تدخّل يدوي.

### تريد حصة أكبر؟

فعّل الدفع بمشروع Google Cloud (نفس المفتاح) — الأسعار رخيصة جداً:
حوالي **$0.58 بالشهر** لقناة تنشر ٣٠ منشور باليوم.
