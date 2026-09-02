"use client";

import { useEffect, useState } from "react";
import { Download } from "./icons";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** يسجّل الـ service worker (بدون واجهة) */
export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}

/** زر تثبيت التطبيق — يظهر بس لما المتصفح يسمح بالتثبيت */
export function InstallButton() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
    };
    const onInstalled = () => setDeferred(null);

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!deferred) return null;

  return (
    <button
      className="install-btn"
      onClick={async () => {
        await deferred.prompt();
        await deferred.userChoice;
        setDeferred(null);
      }}
    >
      <Download />
      ثبّت التطبيق
    </button>
  );
}

/** زر مشاركة يستخدم مشاركة النظام بالجوال، وينسخ الرابط بالكمبيوتر */
export function ShareButton({ title, url }: { title: string; url: string }) {
  const [done, setDone] = useState(false);

  return (
    <button
      className="btn"
      onClick={async () => {
        const full = new URL(url, window.location.origin).href;
        try {
          if (navigator.share) {
            await navigator.share({ title, url: full });
          } else {
            await navigator.clipboard.writeText(full);
            setDone(true);
            setTimeout(() => setDone(false), 1800);
          }
        } catch {
          /* المستخدم ألغى المشاركة */
        }
      }}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
        <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
      </svg>
      {done ? "تم نسخ الرابط" : "مشاركة"}
    </button>
  );
}
