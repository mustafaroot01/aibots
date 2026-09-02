/**
 * منظّم سرعة الطلبات — يضمن ما نتجاوز حد المزوّد.
 * الحالة مشتركة بقاعدة البيانات، فالسيرفر والعامل ما يتجاوزون الحد سوا.
 * كل طلب فعلي يمر من هنا، بضمنه محاولات الإعادة بعد خطأ 429.
 */
import { db } from "../db";

const KEY = "ai_next_slot";        // أقرب لحظة مسموح نرسل بيها (ميلي ثانية)
let queue: Promise<void> = Promise.resolve();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function readSlot(): number {
  const r = db().prepare(`SELECT value FROM meta WHERE key = ?`).get(KEY) as { value: string } | undefined;
  const n = Number(r?.value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function writeSlot(at: number) {
  db().prepare(`INSERT INTO meta(key, value) VALUES(?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(KEY, String(at));
}

/** يحجز دور ويستنى لحد ما يجي — بالتسلسل حتى لو انطلب بالتوازي */
export function acquire(requestsPerMinute: number): Promise<void> {
  const minGap = Math.ceil(60_000 / Math.max(1, requestsPerMinute));

  const next = queue.then(async () => {
    // نحجز الدور بذرّية حتى ما تتصادم العمليات
    const now = Date.now();
    const slot = Math.max(now, readSlot());
    writeSlot(slot + minGap);

    const wait = slot - now;
    if (wait > 0) await sleep(wait);
  });

  queue = next.catch(() => {});
  return next;
}

/** يسجّل انتظار إجباري فرضه المزوّد (بعد 429) حتى ما ترسل أي عملية قبل انتهائه */
export function backoff(seconds: number) {
  writeSlot(Math.max(readSlot(), Date.now() + seconds * 1000));
}
