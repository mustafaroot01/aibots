/** شريط رسالة بعد أي إجراء — أحمر إذا فيه فشل */
export function Toast({ msg }: { msg?: string }) {
  if (!msg) return null;
  const bad = /فشل|❌|غير صحيح|خطأ|رفض/.test(msg);
  return <div className={`toast ${bad ? "bad" : ""}`}>{msg}</div>;
}
