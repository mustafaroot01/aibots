/**
 * طبقة قاعدة البيانات — SQLite عن طريق node:sqlite المدمج بـ Node
 * (بدون أي مكتبة native، يعني ما يحتاج بناء ولا مترجم على السيرفر).
 * يتطلب Node 23.4 أو أحدث — يُنصح بـ Node 24 LTS.
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import type { Extraction, JobRow, JobStatus, RawPost } from "./types";

const DB_PATH = process.env.DB_PATH || "./data/jobs.db";

let _db: DatabaseSync | null = null;

export function db(): DatabaseSync {
  if (_db) return _db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const d = new DatabaseSync(DB_PATH);
  d.exec("PRAGMA journal_mode = WAL");
  d.exec("PRAGMA busy_timeout = 5000");
  d.exec("PRAGMA synchronous = NORMAL");
  d.exec("PRAGMA temp_store = MEMORY");
  d.exec("PRAGMA cache_size = -32000");     // ٣٢ ميغا كاش
  d.exec("PRAGMA mmap_size = 268435456");   // ٢٥٦ ميغا قراءة مباشرة من الذاكرة
  migrate(d);
  _db = d;
  return d;
}

function migrate(d: DatabaseSync) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS posts (
      id            INTEGER PRIMARY KEY,
      channel       TEXT NOT NULL,
      url           TEXT NOT NULL,
      raw_text      TEXT NOT NULL DEFAULT '',
      photos        TEXT NOT NULL DEFAULT '[]',
      links         TEXT NOT NULL DEFAULT '[]',
      posted_at     TEXT,
      posted_ts     INTEGER NOT NULL DEFAULT 0,
      fetched_at    TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'pending',
      is_job        INTEGER,
      confidence    REAL,
      reason        TEXT,
      title         TEXT,
      company       TEXT,
      city          TEXT,
      area          TEXT,
      category      TEXT,
      employment_type TEXT,
      gender        TEXT,
      salary        TEXT,
      experience    TEXT,
      vacancies     INTEGER,
      phones        TEXT NOT NULL DEFAULT '[]',
      contacts      TEXT NOT NULL DEFAULT '[]',
      apply_method  TEXT,
      summary       TEXT,
      tags          TEXT NOT NULL DEFAULT '[]',
      search_blob   TEXT NOT NULL DEFAULT '',
      classified_at TEXT,
      classifier    TEXT,
      tg_status     TEXT NOT NULL DEFAULT 'idle',
      tg_message_id INTEGER,
      tg_sent_at    TEXT,
      tg_error      TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_posts_status_date ON posts(status, posted_ts DESC);
    CREATE INDEX IF NOT EXISTS idx_posts_city        ON posts(city);
    CREATE INDEX IF NOT EXISTS idx_posts_category    ON posts(category);

    -- فهارس جزئية للمنشور فقط: تخلي عدّ المحافظات والأقسام فوري حتى بمليون صف
    CREATE INDEX IF NOT EXISTS idx_pub_city ON posts(city)     WHERE status = 'published';
    CREATE INDEX IF NOT EXISTS idx_pub_cat  ON posts(category) WHERE status = 'published';
    CREATE INDEX IF NOT EXISTS idx_pub_type ON posts(employment_type) WHERE status = 'published';
    -- فهرس الكلمات: مرتّب بالتاريخ حتى يوقف البحث بأول ٢٠ نتيجة بدل ما يمسح الجدول
    CREATE TABLE IF NOT EXISTS search_tokens (
      token     TEXT NOT NULL,
      posted_ts INTEGER NOT NULL,
      post_id   INTEGER NOT NULL,
      PRIMARY KEY (token, posted_ts DESC, post_id)
    ) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS idx_tok_post ON search_tokens(post_id);

    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);

    CREATE TABLE IF NOT EXISTS visits (
      day     TEXT PRIMARY KEY,
      views   INTEGER NOT NULL DEFAULT 0,
      uniques INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS visit_seen (
      day TEXT NOT NULL,
      fp  TEXT NOT NULL,
      PRIMARY KEY (day, fp)
    ) WITHOUT ROWID;

    CREATE TABLE IF NOT EXISTS sessions (
      id          TEXT PRIMARY KEY,
      created_at  INTEGER NOT NULL,
      last_seen   INTEGER NOT NULL,
      expires_at  INTEGER NOT NULL,
      device      TEXT
    );

    CREATE TABLE IF NOT EXISTS login_attempts (
      fingerprint  TEXT PRIMARY KEY,
      fails        INTEGER NOT NULL DEFAULT 0,
      locked_until INTEGER NOT NULL DEFAULT 0,
      last_try     INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS publish_log (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id    INTEGER NOT NULL,
      at         TEXT NOT NULL,
      ok         INTEGER NOT NULL,
      detail     TEXT
    );
  `);

  // ترقيات تدريجية للقواعد القديمة
  const cols = new Set((d.prepare(`PRAGMA table_info(posts)`).all() as any[]).map((c) => c.name));
  const add = (name: string, decl: string) => {
    if (!cols.has(name)) d.exec(`ALTER TABLE posts ADD COLUMN ${name} ${decl}`);
  };
  add("posted_ts", "INTEGER NOT NULL DEFAULT 0");
  add("tg_status", "TEXT NOT NULL DEFAULT 'idle'");      // idle | queued | sent | failed | skipped
  add("tg_message_id", "INTEGER");
  add("tg_sent_at", "TEXT");
  add("tg_error", "TEXT");

  // الفهارس اللي تعتمد على أعمدة مضافة لاحقاً — بعد ما نتأكد إنها موجودة
  d.exec(`CREATE INDEX IF NOT EXISTS idx_tg_queue ON posts(tg_status, posted_ts) WHERE status = 'published'`);

  // تعبئة الوقت الرقمي للصفوف القديمة
  const stale = d.prepare(`SELECT id, posted_at FROM posts WHERE posted_ts = 0 AND posted_at IS NOT NULL`).all() as any[];
  if (stale.length) {
    const up = d.prepare(`UPDATE posts SET posted_ts = ? WHERE id = ?`);
    for (const r of stale) {
      const ts = Math.floor(new Date(r.posted_at).getTime() / 1000);
      if (Number.isFinite(ts)) up.run(ts, r.id);
    }
  }
}

/** يحوّل تاريخ تلجرام (ISO مع الإزاحة) الى ثواني epoch — أساس كل الترتيب والمقارنات */
export function toTs(iso: string | null): number {
  if (!iso) return 0;
  const t = Math.floor(new Date(iso).getTime() / 1000);
  return Number.isFinite(t) ? t : 0;
}

/**
 * تطبيع النص العربي حتى يشتغل البحث حتى لو اختلف الإملاء:
 * أ/إ/آ ← ا، ى ← ي، ة ← ه، وحذف التشكيل والتطويل.
 */
export function normalizeAr(s: string): string {
  return (s || "")
    .replace(/[ؗ-ًؚ-ْٰـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}\s@+]/gu, " ")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

function buildBlob(parts: (string | null | undefined)[]): string {
  return normalizeAr(parts.filter(Boolean).join(" "));
}

// ————— فهرس البحث بالكلمات —————

const MAX_TOKENS = 40;

/** يقسّم النص المُطبَّع الى كلمات فريدة صالحة للفهرسة */
export function tokenize(blob: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of (blob || "").split(" ")) {
    if (t.length < 2 || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= MAX_TOKENS) break;
  }
  return out;
}

/** يحدّث كلمات منشور واحد بفهرس البحث */
export function indexPost(id: number, blob: string, postedTs: number) {
  const d = db();
  d.prepare(`DELETE FROM search_tokens WHERE post_id = ?`).run(id);
  const ins = d.prepare(`INSERT OR IGNORE INTO search_tokens (token, posted_ts, post_id) VALUES (?, ?, ?)`);
  for (const t of tokenize(blob)) ins.run(t, postedTs, id);
}

/** يعيد بناء فهرس البحث كامل (بعد ترقية أو استيراد) */
export function rebuildSearchIndex(): number {
  const d = db();
  d.exec(`DELETE FROM search_tokens`);
  const rows = d.prepare(`SELECT id, search_blob, posted_ts FROM posts`).all() as any[];
  const ins = d.prepare(`INSERT OR IGNORE INTO search_tokens (token, posted_ts, post_id) VALUES (?, ?, ?)`);
  d.exec("BEGIN");
  for (const r of rows) for (const t of tokenize(r.search_blob)) ins.run(t, r.posted_ts, r.id);
  d.exec("COMMIT");
  d.exec("ANALYZE");
  return rows.length;
}

/**
 * يجمع أرقام المنشورات المطابقة لكلمات البحث.
 * كل كلمة تتوسّع لبادئاتها (محاسب ← محاسب، محاسبة) وكل وحدة تنقرا مرتّبة
 * بالتاريخ من الفهرس، فالبحث يوقف بأول نتائج بدل ما يمسح الجدول.
 */
function candidateIds(terms: string[], cap = 1500): number[] | null {
  if (!terms.length) return null;
  const d = db();
  const expand = d.prepare(`SELECT DISTINCT token FROM search_tokens WHERE token >= ? AND token < ? LIMIT 10`);
  const pull = d.prepare(`SELECT post_id FROM search_tokens WHERE token = ? ORDER BY posted_ts DESC LIMIT ?`);

  let acc: Set<number> | null = null;
  for (const term of terms) {
    const tokens = (expand.all(term, term + "\uffff") as any[]).map((r) => r.token);
    if (!tokens.length) return [];

    const ids = new Set<number>();
    for (const tok of tokens) {
      for (const r of pull.all(tok, cap) as any[]) ids.add(r.post_id);
    }
    acc = acc ? new Set<number>([...acc].filter((id: number) => ids.has(id))) : ids;
    if (!acc.size) return [];
  }
  return [...(acc ?? [])].slice(0, cap * 2);
}

export function setMeta(key: string, value: string) {
  db().prepare(`INSERT INTO meta(key,value) VALUES(?,?)
                ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(key, value);
}
export function getMeta(key: string): string | null {
  const r = db().prepare(`SELECT value FROM meta WHERE key=?`).get(key) as { value: string } | undefined;
  return r?.value ?? null;
}

/** يخزّن منشور جديد بحالة pending. يرجع false إذا موجود مسبقاً. */
export function insertRaw(p: RawPost): boolean {
  const info = db().prepare(`
    INSERT OR IGNORE INTO posts (id, channel, url, raw_text, photos, links, posted_at, posted_ts, fetched_at, status, search_blob)
    VALUES (@id, @channel, @url, @text, @photos, @links, @postedAt, @postedTs, @fetchedAt, 'pending', @blob)
  `).run({
    id: p.id, channel: p.channel, url: p.url, text: p.text,
    photos: JSON.stringify(p.photos), links: JSON.stringify(p.links),
    postedAt: p.postedAt, postedTs: toTs(p.postedAt), fetchedAt: new Date().toISOString(),
    blob: buildBlob([p.text]),
  });
  const added = Number(info.changes) > 0;
  if (added) indexPost(p.id, buildBlob([p.text]), toTs(p.postedAt));
  return added;
}

export function pendingPosts(limit = 40): RawPost[] {
  const rows = db().prepare(
    `SELECT id, channel, url, raw_text, photos, links, posted_at
     FROM posts WHERE status='pending' ORDER BY id ASC LIMIT ?`
  ).all(limit) as any[];
  return rows.map((r) => ({
    id: r.id, channel: r.channel, url: r.url, text: r.raw_text,
    photos: JSON.parse(r.photos), links: JSON.parse(r.links), postedAt: r.posted_at,
  }));
}

export interface PublishRules {
  autoPublish: boolean;
  threshold: number;
}

export function applyExtraction(
  id: number,
  e: Extraction,
  classifier: string,
  rules: PublishRules = { autoPublish: true, threshold: 0.5 }
): JobStatus {
  const passes = e.is_job && e.confidence >= rules.threshold;
  // إذا النشر التلقائي مطفي، الوظائف المقبولة تنتظر مراجعة يدوية
  const status: JobStatus = passes ? (rules.autoPublish ? "published" : "pending_review") : "rejected";
  const row = db().prepare(`SELECT raw_text FROM posts WHERE id=?`).get(id) as { raw_text: string } | undefined;

  db().prepare(`
    UPDATE posts SET
      status=@status, is_job=@is_job, confidence=@confidence, reason=@reason,
      title=@title, company=@company, city=@city, area=@area, category=@category,
      employment_type=@employment_type, gender=@gender, salary=@salary,
      experience=@experience, vacancies=@vacancies, phones=@phones, contacts=@contacts,
      apply_method=@apply_method, summary=@summary, tags=@tags, search_blob=@blob,
      classified_at=@classified_at, classifier=@classifier,
      tg_status=CASE WHEN @status='published' AND tg_status='idle' THEN 'queued' ELSE tg_status END
    WHERE id=@id
  `).run({
    id, status, is_job: e.is_job ? 1 : 0, confidence: e.confidence, reason: e.reason ?? null,
    title: e.title, company: e.company, city: e.city, area: e.area, category: e.category,
    employment_type: e.employment_type, gender: e.gender, salary: e.salary,
    experience: e.experience, vacancies: e.vacancies,
    phones: JSON.stringify(e.phones ?? []), contacts: JSON.stringify(e.contacts ?? []),
    apply_method: e.apply_method, summary: e.summary, tags: JSON.stringify(e.tags ?? []),
    blob: buildBlob([row?.raw_text, e.title, e.company, e.city, e.area, e.category, e.summary, ...(e.tags ?? [])]),
    classified_at: new Date().toISOString(), classifier,
  });

  const blob = buildBlob([row?.raw_text, e.title, e.company, e.city, e.area, e.category, e.summary, ...(e.tags ?? [])]);
  const ts = (db().prepare(`SELECT posted_ts FROM posts WHERE id=?`).get(id) as any)?.posted_ts ?? 0;
  indexPost(id, blob, ts);

  return status;
}

/** يغيّر حالة المنشور — وإذا صار منشور، ينحط تلقائياً بطابور النشر بقناتك */
export function setStatus(id: number, status: JobStatus) {
  db().prepare(`
    UPDATE posts SET
      status = @status,
      tg_status = CASE
        WHEN @status = 'published' AND tg_status IN ('idle', 'skipped') THEN 'queued'
        ELSE tg_status END
    WHERE id = @id
  `).run({ id, status });
}

function hydrate(r: any): JobRow {
  return {
    ...r,
    is_job: !!r.is_job,
    photos: JSON.parse(r.photos || "[]"),
    links: JSON.parse(r.links || "[]"),
    phones: JSON.parse(r.phones || "[]"),
    contacts: JSON.parse(r.contacts || "[]"),
    tags: JSON.parse(r.tags || "[]"),
  } as JobRow;
}

export interface JobQuery {
  q?: string; city?: string; category?: string; type?: string; gender?: string;
  page?: number; perPage?: number; status?: JobStatus;
}

export function searchJobs(opts: JobQuery): { rows: JobRow[]; total: number; capped?: boolean } {
  const perPage = opts.perPage ?? 20;
  const page = Math.max(1, opts.page ?? 1);
  const where: string[] = ["status = ?"];
  const args: any[] = [opts.status ?? "published"];

  if (opts.city) { where.push("city = ?"); args.push(opts.city); }
  if (opts.category) { where.push("category = ?"); args.push(opts.category); }
  if (opts.type) { where.push("employment_type = ?"); args.push(opts.type); }
  if (opts.gender) { where.push("(gender = ? OR gender = 'الجنسين')"); args.push(opts.gender); }

  // البحث الحر يمر على فهرس الكلمات — أسرع بآلاف المرات من المسح بـ LIKE
  const terms = normalizeAr(opts.q || "").split(" ").filter((t) => t.length > 1);
  let capped = false;

  if (terms.length) {
    const ids = candidateIds(terms);
    if (!ids || !ids.length) return { rows: [], total: 0 };
    where.push(`id IN (${ids.map(() => "?").join(",")})`);
    args.push(...ids);
    capped = ids.length >= 3000;
  }

  const clause = where.join(" AND ");
  const rows = db().prepare(
    `SELECT * FROM posts WHERE ${clause} ORDER BY posted_ts DESC, id DESC LIMIT ? OFFSET ?`
  ).all(...args, perPage, (page - 1) * perPage) as any[];

  // العدّ بسقف: ما نمسح الجدول كله حتى نطلع رقم دقيق ما يفيد أحد
  const COUNT_CAP = 2000;
  const total = Number((db().prepare(
    `SELECT COUNT(*) c FROM (SELECT 1 FROM posts WHERE ${clause} LIMIT ${COUNT_CAP})`
  ).get(...args) as { c: number }).c);

  return { rows: rows.map(hydrate), total, capped: capped || total >= COUNT_CAP };
}

export function getJob(id: number): JobRow | null {
  const r = db().prepare(`SELECT * FROM posts WHERE id=?`).get(id) as any;
  return r ? hydrate(r) : null;
}

let facetCache: { at: number; value: ReturnType<typeof computeFacets> } | null = null;

export function facets() {
  if (facetCache && Date.now() - facetCache.at < 60_000) return facetCache.value;
  const value = computeFacets();
  facetCache = { at: Date.now(), value };
  return value;
}

function computeFacets() {
  const d = db();
  const cities = d.prepare(
    `SELECT city v, COUNT(*) c FROM posts WHERE status='published' AND city IS NOT NULL AND city<>''
     GROUP BY city ORDER BY c DESC LIMIT 20`).all() as unknown as { v: string; c: number }[];
  const cats = d.prepare(
    `SELECT category v, COUNT(*) c FROM posts WHERE status='published' AND category IS NOT NULL AND category<>''
     GROUP BY category ORDER BY c DESC LIMIT 20`).all() as unknown as { v: string; c: number }[];
  return { cities, cats };
}

export function stats() {
  const row = db().prepare(`
    SELECT
      (SELECT COUNT(*) FROM posts) total,
      (SELECT COUNT(*) FROM posts WHERE status='published') published,
      (SELECT COUNT(*) FROM posts WHERE status='rejected')  rejected,
      (SELECT COUNT(*) FROM posts WHERE status='pending')   pending,
      (SELECT COUNT(*) FROM posts WHERE status='published' AND posted_ts >= strftime('%s','now') - 604800) week
  `).get() as any;
  return row as { total: number; published: number; rejected: number; pending: number; week: number };
}

export function recent(limit = 60, status?: JobStatus): JobRow[] {
  const rows = (status
    ? db().prepare(`SELECT * FROM posts WHERE status=? ORDER BY id DESC LIMIT ?`).all(status, limit)
    : db().prepare(`SELECT * FROM posts ORDER BY id DESC LIMIT ?`).all(limit)) as any[];
  return rows.map(hydrate);
}

export function maxPostId(): number {
  const r = db().prepare(`SELECT MAX(id) m FROM posts`).get() as { m: number | null };
  return r?.m ?? 0;
}

export function minPostId(): number {
  const r = db().prepare(`SELECT MIN(id) m FROM posts`).get() as { m: number | null };
  return r?.m ?? 0;
}


// ————— النشر بقناة تلجرام —————

/** الوظائف المنشورة بالموقع واللي بعدها ما انرسلت للقناة */
export function jobsAwaitingTelegram(limit = 5): JobRow[] {
  const rows = db().prepare(
    `SELECT * FROM posts WHERE status='published' AND tg_status='queued'
     ORDER BY posted_ts ASC, id ASC LIMIT ?`
  ).all(limit) as any[];
  return rows.map(hydrate);
}

export function markTelegram(id: number, ok: boolean, info: { messageId?: number; error?: string }) {
  db().prepare(`
    UPDATE posts SET tg_status=@st, tg_message_id=@mid, tg_sent_at=@at, tg_error=@err WHERE id=@id
  `).run({
    id,
    st: ok ? "sent" : "failed",
    mid: info.messageId ?? null,
    at: new Date().toISOString(),
    err: info.error?.slice(0, 400) ?? null,
  });
  db().prepare(`INSERT INTO publish_log (post_id, at, ok, detail) VALUES (?,?,?,?)`)
    .run(id, new Date().toISOString(), ok ? 1 : 0, (info.error ?? `message_id=${info.messageId ?? "?"}`).slice(0, 400));
}

export function setTelegramStatus(id: number, st: string, note: string | null = null) {
  db().prepare(`UPDATE posts SET tg_status=?, tg_error=? WHERE id=?`).run(st, note, id);
}

export function publishLog(limit = 20) {
  return db().prepare(
    `SELECT l.*, p.title FROM publish_log l LEFT JOIN posts p ON p.id = l.post_id
     ORDER BY l.id DESC LIMIT ?`
  ).all(limit) as unknown as { id: number; post_id: number; at: string; ok: number; detail: string; title: string | null }[];
}

// ————— استعلامات لوحة الإدارة —————

export interface AdminQuery {
  status?: string; q?: string; tg?: string; page?: number; perPage?: number;
}

export function adminSearch(o: AdminQuery): { rows: JobRow[]; total: number } {
  const perPage = o.perPage ?? 25;
  const page = Math.max(1, o.page ?? 1);
  const where: string[] = ["1=1"];
  const args: any[] = [];

  if (o.status && o.status !== "all") { where.push("status = ?"); args.push(o.status); }
  if (o.tg && o.tg !== "all") { where.push("tg_status = ?"); args.push(o.tg); }
  for (const term of normalizeAr(o.q || "").split(" ").filter((t) => t.length > 1)) {
    where.push("search_blob LIKE ?");
    args.push(`%${term}%`);
  }

  const clause = where.join(" AND ");
  const rows = db().prepare(
    `SELECT * FROM posts WHERE ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`
  ).all(...args, perPage, (page - 1) * perPage) as any[];
  const total = Number((db().prepare(`SELECT COUNT(*) c FROM posts WHERE ${clause}`).get(...args) as any).c);
  return { rows: rows.map(hydrate), total };
}

export function fullStats() {
  const r = db().prepare(`
    SELECT
      (SELECT COUNT(*) FROM posts) total,
      (SELECT COUNT(*) FROM posts WHERE status='published') published,
      (SELECT COUNT(*) FROM posts WHERE status='rejected')  rejected,
      (SELECT COUNT(*) FROM posts WHERE status='pending')   pending,
      (SELECT COUNT(*) FROM posts WHERE status='pending_review') review,
      (SELECT COUNT(*) FROM posts WHERE status='hidden')    hidden,
      (SELECT COUNT(*) FROM posts WHERE tg_status='sent')   tg_sent,
      (SELECT COUNT(*) FROM posts WHERE tg_status='queued' AND status='published') tg_queued,
      (SELECT COUNT(*) FROM posts WHERE tg_status='failed') tg_failed,
      (SELECT COUNT(*) FROM posts WHERE tg_status='skipped') tg_skipped,
      (SELECT COUNT(*) FROM posts WHERE posted_ts >= strftime('%s','now') - 86400) today,
      (SELECT COUNT(*) FROM posts WHERE status='published' AND posted_ts >= strftime('%s','now') - 604800) week
  `).get() as any;
  return r as Record<string, number>;
}


// ————— عدّاد الزوار —————

/** يوم بغداد بصيغة YYYY-MM-DD */
export function baghdadDay(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baghdad" }).format(d);
}

/** يسجّل زيارة. fp = بصمة مجهولة (هاش IP+المتصفح) — ما نخزن IP ولا أي بيانات شخصية */
export function trackVisit(fp: string) {
  const day = baghdadDay();
  const d = db();

  const fresh = Number(
    d.prepare(`INSERT OR IGNORE INTO visit_seen (day, fp) VALUES (?, ?)`).run(day, fp).changes
  ) > 0;

  d.prepare(`
    INSERT INTO visits (day, views, uniques) VALUES (@day, 1, @u)
    ON CONFLICT(day) DO UPDATE SET views = views + 1, uniques = uniques + @u
  `).run({ day, u: fresh ? 1 : 0 });

  // تنظيف البصمات الأقدم من ٤٥ يوم (مرة كل ~٢٠٠ زيارة)
  if (Math.random() < 0.005) {
    d.prepare(`DELETE FROM visit_seen WHERE day < date('now', '-45 days')`).run();
  }
}

export interface VisitStats {
  today: { views: number; uniques: number };
  yesterday: { views: number; uniques: number };
  week: { views: number; uniques: number };
  month: { views: number; uniques: number };
  daily: { day: string; views: number; uniques: number }[];
}

export function visitStats(): VisitStats {
  const d = db();
  const day = baghdadDay();
  const yesterday = baghdadDay(new Date(Date.now() - 86400_000));

  const one = (k: string) =>
    (d.prepare(`SELECT views, uniques FROM visits WHERE day = ?`).get(k) as any) ?? { views: 0, uniques: 0 };
  const range = (days: number) =>
    (d.prepare(
      `SELECT COALESCE(SUM(views),0) views, COALESCE(SUM(uniques),0) uniques
       FROM visits WHERE day >= date('now', ?)`
    ).get(`-${days} days`) as any) ?? { views: 0, uniques: 0 };

  return {
    today: one(day),
    yesterday: one(yesterday),
    week: range(7),
    month: range(30),
    daily: d.prepare(
      `SELECT day, views, uniques FROM visits ORDER BY day DESC LIMIT 14`
    ).all() as never,
  };
}
