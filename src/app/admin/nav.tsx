"use client";

import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "نظرة عامة" },
  { href: "/admin/posts", label: "المنشورات" },
  { href: "/admin/settings", label: "الإعدادات" },
];

export default function AdminNav() {
  const path = usePathname();
  return (
    <nav className="adm-nav">
      {LINKS.map((l) => (
        <a key={l.href} href={l.href} className={path === l.href ? "on" : ""}>
          {l.label}
        </a>
      ))}
    </nav>
  );
}
