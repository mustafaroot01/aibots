import * as cheerio from "cheerio";
import type { RawPost } from "./types";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export interface FetchOptions {
  /** يجيب المنشورات الأقدم من هذا الرقم (للأرشفة) */
  before?: number;
  /** يجيب المنشورات الأحدث من هذا الرقم */
  after?: number;
}

/**
 * يسحب منشورات قناة تلجرام عامة من صفحة المعاينة t.me/s/<channel>.
 * ما يحتاج أي توكن أو صلاحية — القناة لازم تكون عامة فقط.
 */
export async function fetchChannel(channel: string, opts: FetchOptions = {}): Promise<RawPost[]> {
  const params = new URLSearchParams();
  if (opts.before) params.set("before", String(opts.before));
  if (opts.after) params.set("after", String(opts.after));
  const url = `https://t.me/s/${encodeURIComponent(channel)}${params.size ? `?${params}` : ""}`;

  const res = await fetch(url, {
    headers: { "user-agent": UA, "accept-language": "ar,en;q=0.8" },
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`فشل جلب القناة: HTTP ${res.status} — ${url}`);
  return parseChannelHtml(await res.text(), channel);
}

export function parseChannelHtml(html: string, channel: string): RawPost[] {
  const $ = cheerio.load(html);
  const out: RawPost[] = [];

  $(".tgme_widget_message").each((_, el) => {
    const node = $(el);
    // نتجاهل رسائل الخدمة (تثبيت منشور، تغيير الصورة، انضمام...) — مو محتوى
    if (node.hasClass("service_message")) return;
    const dataPost = node.attr("data-post");
    if (!dataPost) return;
    const id = Number(dataPost.split("/").pop());
    if (!Number.isFinite(id)) return;

    const textEl = node.find(".tgme_widget_message_text").first();
    // اسم القناة يظهر داخل نص المنشور بصفحة المعاينة — نشيله
    textEl.find(".tgme_widget_message_author_name").remove();
    const text = htmlToText($, textEl);

    const links: string[] = [];
    textEl.find("a").each((_, a) => {
      const href = $(a).attr("href");
      if (href && /^https?:/i.test(href)) links.push(href);
    });

    const photos: string[] = [];
    node.find(".tgme_widget_message_photo_wrap, .tgme_widget_message_video_thumb").each((_, ph) => {
      const style = $(ph).attr("style") || "";
      const m = style.match(/background-image\s*:\s*url\(['"]?(.*?)['"]?\)/i);
      if (m?.[1]) photos.push(m[1]);
    });

    const postedAt = node.find(".tgme_widget_message_date time").attr("datetime") || null;

    out.push({
      id,
      channel,
      url: `https://t.me/${channel}/${id}`,
      text,
      photos: [...new Set(photos)],
      links: [...new Set(links)],
      postedAt,
    });
  });

  return out.sort((a, b) => a.id - b.id);
}

/** يحوّل HTML المنشور الى نص نظيف مع الحفاظ على الأسطر */
function htmlToText($: cheerio.CheerioAPI, el: cheerio.Cheerio<any>): string {
  if (!el.length) return "";
  const clone = el.clone();
  clone.find("br").replaceWith("\n");
  clone.find("div, p").each((_, d) => {
    $(d).prepend("\n");
  });
  return decodeEntities(clone.text())
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
