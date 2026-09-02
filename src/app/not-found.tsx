import type { Metadata } from "next";

/** صفحة غير موجودة — noindex حتى ما تنأرشف بمحركات البحث */
export const metadata: Metadata = {
  title: "الصفحة غير موجودة",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main className="wrap">
      <div className="empty" style={{ marginTop: 60 }}>
        <div className="ico" style={{ fontSize: 24 }}>٤٠٤</div>
        <h3>الصفحة مو موجودة</h3>
        <p>يمكن الإعلان انحذف أو الرابط غلط.</p>
        <a className="btn primary" href="/" style={{ display: "inline-flex" }}>الرجوع للرئيسية</a>
      </div>
    </main>
  );
}
