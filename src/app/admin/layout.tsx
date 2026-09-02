import { redirect } from "next/navigation";
import { adminConfigured, isAuthed } from "@/lib/auth";
import { logoutAction } from "./actions";
import { Briefcase } from "@/components/icons";
import AdminNav from "./nav";

export const metadata = {
  title: "لوحة التحكم",
  robots: { index: false, follow: false, nocache: true },
};
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!adminConfigured() || !(await isAuthed())) redirect("/login");


  return (
    <>
      <header className="adm-top">
        <div className="wrap">
          <div className="row1">
            <span className="brand-mark" style={{ width: 30, height: 30, borderRadius: 9 }}><Briefcase /></span>
            <b style={{ fontSize: 15 }}>لوحة التحكم</b>
            <span className="adm-badge">مدير</span>
            <span className="spacer" style={{ flex: 1 }} />
            <a href="/" className="mini" style={{ display: "inline-grid", placeItems: "center" }}>الموقع</a>
            <form action={logoutAction}><button className="mini" type="submit">خروج</button></form>
          </div>
          <AdminNav />
        </div>
      </header>
      <main className="wrap adm-main">{children}</main>
    </>
  );
}
