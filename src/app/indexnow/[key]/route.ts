/** ملف مفتاح IndexNow — محركات البحث تطلبه للتأكد إنك تملك الموقع */
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  const s = getSettings();
  const want = `${s.indexnow_key}.txt`;

  if (!s.indexnow_key || key !== want) return new Response("Not found", { status: 404 });

  return new Response(s.indexnow_key, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
