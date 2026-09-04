/**
 * بوابة أولى للوحة التحكم: أي طلب بدون كوكي جلسة بالشكل الصحيح
 * ينعرض له صفحة الدخول مباشرة — بدون ما تنبني صفحة اللوحة أصلاً.
 * (التحقق الحقيقي من الجلسة يصير داخل كل صفحة مقابل قاعدة البيانات)
 */
import { NextResponse, type NextRequest } from "next/server";

const SESSION_SHAPE = /^[a-f0-9]{64}$/;

export function middleware(req: NextRequest) {
  // ملف مفتاح IndexNow بجذر الموقع: /<key>.txt
  const m = req.nextUrl.pathname.match(/^\/([a-f0-9]{16,64}\.txt)$/);
  if (m) return NextResponse.rewrite(new URL(`/indexnow/${m[1]}`, req.url));

  const sess = req.cookies.get("dj_sess")?.value;
  if (!sess || !SESSION_SHAPE.test(sess)) {
    return NextResponse.rewrite(new URL("/login", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/:key([a-f0-9]{16,64}\\.txt)"],
};
