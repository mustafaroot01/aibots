/**
 * تشفير الأسرار المخزّنة بقاعدة البيانات (توكن البوت مثلاً).
 * حتى لو نسخة القاعدة انسربت، التوكن ما ينقرأ بدون مفتاح السيرفر.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const PREFIX = "enc:v1:";

/** مفتاح التشفير من SECRET_KEY، وإذا مو موجود نشتقه من ADMIN_TOKEN */
function key(): Buffer | null {
  const src = process.env.SECRET_KEY || process.env.ADMIN_TOKEN || "";
  if (src.length < 6) return null;
  return createHash("sha256").update(`diyala-jobs::${src}`).digest();
}

export function isEncrypted(v: string): boolean {
  return typeof v === "string" && v.startsWith(PREFIX);
}

export function encryptSecret(plain: string): string {
  if (!plain) return "";
  const k = key();
  if (!k) return plain;                       // ما نكسر التشغيل إذا ما موجود مفتاح
  if (isEncrypted(plain)) return plain;

  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", k, iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  const tag = c.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptSecret(value: string): string {
  if (!value || !isEncrypted(value)) return value || "";
  const k = key();
  if (!k) return "";

  try {
    const raw = Buffer.from(value.slice(PREFIX.length), "base64");
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const data = raw.subarray(28);
    const d = createDecipheriv("aes-256-gcm", k, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(data), d.final()]).toString("utf8");
  } catch {
    // المفتاح تغيّر أو البيانات تلفت
    return "";
  }
}

/** يخفي سر للعرض: 123456:ABC... → 1234••••••DEF */
export function maskSecret(v: string): string {
  if (!v) return "";
  if (v.length <= 10) return "••••••";
  return `${v.slice(0, 4)}${"•".repeat(8)}${v.slice(-4)}`;
}
