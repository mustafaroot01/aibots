"use client";

import { useState } from "react";

/** مفتاح تشغيل/إطفاء بحالة نصية تتغير مباشرة */
export function Toggle({
  name, label, hint, defaultChecked = false, onText = "مفعّل", offText = "مطفي",
}: {
  name: string; label: string; hint?: string;
  defaultChecked?: boolean; onText?: string; offText?: string;
}) {
  const [on, setOn] = useState(defaultChecked);
  return (
    <label className={`switch ${on ? "is-on" : ""}`}>
      <input type="checkbox" name={name} defaultChecked={defaultChecked}
        onChange={(e) => setOn(e.currentTarget.checked)} />
      <span className="track" />
      <span className="lbl">
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <span className={`state ${on ? "on" : "off"}`}>{on ? onText : offText}</span>
    </label>
  );
}

/** حقل سر مع زر إظهار/إخفاء */
export function SecretField({
  name, id, placeholder, saved,
}: { name: string; id: string; placeholder: string; saved: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <div className="secret-wrap">
      <input id={id} name={name} type={show ? "text" : "password"} dir="ltr"
        placeholder={placeholder} autoComplete="off" spellCheck={false} />
      <button type="button" className="eye" onClick={() => setShow((v) => !v)}
        aria-label={show ? "إخفاء" : "إظهار"}>
        {show ? "🙈" : "👁"}
      </button>
      {saved && <span className="saved-pill">محفوظ ✓</span>}
    </div>
  );
}

/**
 * غلاف بطاقة إعدادات: يراقب أي تعديل ويظهر شريط حفظ ثابت
 * حتى ما تنسى تحفظ وأنت تنزل بالصفحة.
 */
export function SettingsCard({
  id, title, badge, badgeTone = "", hint, children, extraButtons,
}: {
  id: string; title: React.ReactNode; badge?: string; badgeTone?: string;
  hint?: React.ReactNode; children: React.ReactNode; extraButtons?: React.ReactNode;
}) {
  const [dirty, setDirty] = useState(false);

  return (
    <div className="adm-card" id={id} onInput={() => setDirty(true)} onChange={() => setDirty(true)}>
      <h2>
        {title}
        {badge && <span className={`sec-badge ${badgeTone}`}>{badge}</span>}
      </h2>
      {hint && <p className="hint">{hint}</p>}
      {children}
      <div className={`card-actions ${dirty ? "dirty" : ""}`}>
        <button className="btn primary" type="submit">
          {dirty ? "حفظ التغييرات" : "حفظ"}
        </button>
        {extraButtons}
        <span className="dirty-note">{dirty ? "● عندك تعديلات ما انحفظت" : ""}</span>
      </div>
    </div>
  );
}
