import type { MetadataRoute } from "next";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

/** زواحف الذكاء الاصطناعي — مسموحة صراحةً حتى يعرفون الموقع ويستشهدون بيه */
const AI_AGENTS = [
  "GPTBot", "OAI-SearchBot", "ChatGPT-User",          // OpenAI
  "ClaudeBot", "Claude-Web", "anthropic-ai", "Claude-SearchBot", // Anthropic
  "Google-Extended", "Googlebot", "Googlebot-News",   // Google
  "PerplexityBot", "Perplexity-User",                 // Perplexity
  "Applebot", "Applebot-Extended",                    // Apple
  "Bingbot", "msnbot",                                // Microsoft
  "cohere-ai", "Meta-ExternalAgent", "Amazonbot",
  "YandexBot", "DuckDuckBot", "CCBot", "Bytespider",
];

export default function robots(): MetadataRoute.Robots {
  const s = getSettings();
  const base = s.site_url;

  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/admin", "/admin/", "/login"] },
      // نسمح لكل وكيل ذكاء صراحةً — بعضهم ما يعتمد على قاعدة *
      ...AI_AGENTS.map((agent) => ({
        userAgent: agent,
        allow: "/",
        disallow: ["/admin", "/admin/", "/login"],
      })),
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
