/**
 * استخراج أرقام الهاتف العراقية وتوحيدها.
 * يتعامل مع: الأرقام العربية (٠-٩) والفارسية (۰-۹)، المسافات والشرطات،
 * صيغ +964 و 00964، ويرفض الأرقام اللي مو أرقام هاتف (مثل مديات الرواتب).
 */

/** بادئات الموبايل العراقية المعتمدة */
const VALID_PREFIX = /^07[3-9]\d{8}$/;

/** يحوّل الأرقام العربية والفارسية الى إنكليزية ويشيل علامات الاتجاه */
export function toAsciiDigits(s: string): string {
  return (s || "")
    .replace(/[‎‏؜​-‍﻿]/g, "")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/** يوحّد رقم واحد الى صيغة 07XXXXXXXXX، ويرجع null إذا مو رقم عراقي صالح */
export function normalizePhone(raw: string): string | null {
  if (!raw) return null;
  let d = toAsciiDigits(String(raw)).replace(/[^\d+]/g, "");

  if (d.startsWith("+")) d = d.slice(1);
  if (d.startsWith("00964")) d = d.slice(5);
  else if (d.startsWith("964")) d = d.slice(3);

  if (d.startsWith("7") && d.length === 10) d = "0" + d;   // 7XXXXXXXXX ← بدون صفر
  if (d.startsWith("07") && d.length === 11) {
    return VALID_PREFIX.test(d) ? d : null;
  }
  return null;
}

/**
 * يسحب كل أرقام الهاتف من نص حر.
 * الصفر بالبداية إجباري بالصيغة المحلية — هيج ما نلتبس بمديات الرواتب مثل «750-1000000».
 */
export function extractPhones(text: string): string[] {
  const t = toAsciiDigits(text || "");
  const out: string[] = [];

  // ١) صيغة دولية: +964 / 00964 / 964 ثم 7 وتسع أرقام
  const intl = /(?:\+|00)?964[\s\-.\/]?7(?:[\s\-.]?\d){9}/g;
  // ٢) صيغة محلية: 07 وتسع أرقام (الصفر إجباري)
  const local = /(?<![\d])0[\s\-.]?7(?:[\s\-.]?\d){9}(?![\d])/g;

  for (const re of [intl, local]) {
    for (const m of t.match(re) || []) {
      const n = normalizePhone(m);
      if (n) out.push(n);
    }
  }
  return [...new Set(out)];
}

/**
 * الأرقام المعتمدة لأي منشور.
 * نعتمد على السحب من النص حصراً — أدق من الموديل وما ينخدع بمديات الرواتب
 * مثل «الراتب 750-1000000». إذا ما لكينا رقم، نخلي القائمة فارغة
 * (النص الكامل للإعلان يظل ظاهر بالموقع وبالقناة على كل حال).
 */
export function mergePhones(_modelPhones: string[] | undefined, rawText: string): string[] {
  return extractPhones(rawText);
}

/** عرض الرقم مقسّم للقراءة: 0770 123 4567 */
export function prettyPhone(p: string): string {
  return /^07\d{9}$/.test(p) ? `${p.slice(0, 4)} ${p.slice(4, 7)} ${p.slice(7)}` : p;
}

/** رابط واتساب بالصيغة الدولية */
export function waLink(phone: string): string {
  const n = normalizePhone(phone) ?? phone.replace(/\D/g, "");
  return `https://wa.me/964${n.replace(/^0/, "")}`;
}
