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
Domains → دومينك → **Apache & nginx Settings**:

1. شيل صح ☐ **Proxy mode**
2. بخانة **Additional nginx directives** حط:

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
}
```

3. احفظ، وفعّل **SSL/TLS Certificates → Let's Encrypt**

> **مهم:** `X-Forwarded-Proto` ضروري — بدونه كوكي لوحة التحكم ما تكون Secure.

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
