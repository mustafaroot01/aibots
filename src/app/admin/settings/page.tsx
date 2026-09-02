import { guardPage } from "@/lib/auth";
import { getSettings, EFFORTS, MODELS, GEMINI_MODELS, PROVIDERS, listToText, settingsHealth } from "@/lib/settings";
import { searchJobs } from "@/lib/db";
import { renderMessage } from "@/lib/publisher";
import { providerStatus } from "@/lib/classify";
import { Toast } from "@/components/toast";
import { ConfirmButton } from "@/components/confirm";
import { SecretField, SettingsCard, Toggle } from "@/components/form-bits";
import { Alert, Briefcase, Building, Search, Telegram, Users } from "@/components/icons";
import {
  resetSettingsAction, saveSettingsAction, sendTestAction, testBotAction,
} from "../actions";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

const SECTIONS = [
  { id: "identity", label: "الهوية" },
  { id: "source", label: "المصدر" },
  { id: "ai", label: "الفلترة" },
  { id: "publish", label: "النشر بقناتك" },
  { id: "display", label: "العرض" },
  { id: "danger", label: "إعادة ضبط" },
];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await guardPage();
  const sp = await searchParams;
  const s = getSettings();
  const h = settingsHealth(s);
  const ps = providerStatus();

  const sample = searchJobs({ perPage: 1, page: 1 }).rows[0];
  const preview = sample
    ? renderMessage(sample, s).replace(/<\/?b>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    : "ما موجودة وظيفة منشورة حتى نعرضها كمثال.";

  return (
    <>
      <Toast msg={one(sp.msg)} />

      {/* ————— ملخص وتنقل ————— */}
      <div className="adm-card">
        <h2><Alert /> ملخص الإعدادات</h2>
        <div className="health">
          <span className={`hchip ${h.aiOn ? "on" : "warn"}`}>
            {h.aiOn ? "✅" : "⚠️"} الفلترة: {ps.active === "rules" ? "كلمات مفتاحية" : `${ps.active === "gemini" ? "Gemini" : "Claude"} · ${ps.model}`}
          </span>
          <span className={`hchip ${h.autoPublish ? "on" : "warn"}`}>
            {h.autoPublish ? "✅ نشر تلقائي" : "🔸 يحتاج موافقتك"}
          </span>
          <span className={`hchip ${h.pubBroken ? "off" : h.pubReady ? "on" : "warn"}`}>
            {h.pubBroken ? "❌ النشر بالقناة ناقص" : h.pubReady ? `✅ ينشر بـ ${s.publish_channel}` : "🔸 النشر بالقناة مطفي"}
          </span>
          <span className={`hchip ${h.sourceHidden ? "on" : "warn"}`}>
            {h.sourceHidden ? "✅ المصدر مخفي" : "⚠️ رابط المصدر ظاهر"}
          </span>
          <span className="hchip">🔁 فحص كل {s.poll_seconds}ث · {s.ai_rpm} طلب/دقيقة</span>
        </div>
        <nav className="jump-nav">
          {SECTIONS.map((x) => <a key={x.id} href={`#${x.id}`}>{x.label}</a>)}
        </nav>
      </div>

      {/* ————— ١. هوية الموقع ————— */}
      <form action={saveSettingsAction}>
        <input type="hidden" name="section" value="identity" />
        <SettingsCard
          id="identity"
          title={<><Briefcase /> ١. هوية الموقع</>}
          badge="يظهر للزوار"
          hint="الاسم والرابط اللي يظهرون بالموقع ومحركات البحث وتطبيق الجوال."
        >
          <div className="form-grid two">
            <div className="field">
              <label htmlFor="site_name">اسم الموقع</label>
              <input id="site_name" name="site_name" type="text" defaultValue={s.site_name} maxLength={60} required />
            </div>
            <div className="field">
              <label htmlFor="site_url">رابط الموقع</label>
              <input id="site_url" name="site_url" type="url" defaultValue={s.site_url} dir="ltr"
                placeholder="https://jobs.example.com" />
              <div className="desc">يُستخدم بروابط الوظائف اللي تنرسل لقناتك وبخريطة الموقع.</div>
            </div>
            <div className="field">
              <label htmlFor="brand_channel">قناتك على تلجرام (اختياري)</label>
              <input id="brand_channel" name="brand_channel" type="text" defaultValue={s.brand_channel}
                dir="ltr" placeholder="MyJobsChannel" />
              <div className="desc">تظهر بالهيدر والفوتر كـ «قناتنا». اكتب اليوزر بدون @.</div>
            </div>
            <div className="field" style={{ alignSelf: "end" }}>
              <Toggle
                name="show_source_link"
                label="إظهار رابط المصدر"
                hint="مطفي = ما يظهر اسم القناة اللي انسحب منها الإعلان"
                defaultChecked={s.show_source_link}
                onText="ظاهر" offText="مخفي"
              />
            </div>
          </div>
        </SettingsCard>
      </form>

      {/* ————— ٢. مصدر المحتوى ————— */}
      <form action={saveSettingsAction}>
        <input type="hidden" name="section" value="source" />
        <SettingsCard
          id="source"
          title={<><Search /> ٢. مصدر المحتوى</>}
          badge="داخلي" badgeTone="muted"
          hint="القناة العامة اللي ننسحب منها المنشورات — هذي داخلية وما تظهر لزوار الموقع."
        >
          <div className="form-grid two">
            <div className="field">
              <label htmlFor="tg_channel">يوزر القناة المصدر</label>
              <input id="tg_channel" name="tg_channel" type="text" defaultValue={s.tg_channel} dir="ltr" required />
              <div className="desc">بدون @ — لازم تكون قناة عامة.</div>
            </div>
            <div className="field">
              <label htmlFor="poll_seconds">كل كم ثانية نفحص القناة</label>
              <input id="poll_seconds" name="poll_seconds" type="number" inputMode="numeric"
                min={30} max={86400} step={30} defaultValue={s.poll_seconds} />
              <div className="desc">الموصى به ١٢٠–٣٠٠ ثانية.</div>
            </div>
            <div className="field">
              <label htmlFor="backfill_pages">عدد صفحات الأرشفة</label>
              <input id="backfill_pages" name="backfill_pages" type="number" inputMode="numeric"
                min={1} max={100} defaultValue={s.backfill_pages} />
              <div className="desc">يُستخدم بأمر <code>npm run backfill</code>.</div>
            </div>
          </div>
        </SettingsCard>
      </form>

      {/* ————— ٣. الفلترة والتحليل ————— */}
      <form action={saveSettingsAction}>
        <input type="hidden" name="section" value="ai" />
        <SettingsCard
          id="ai"
          title={<><Users /> ٣. الفلترة والتحليل</>}
          badge={ps.active === "rules" ? "كلمات مفتاحية" : ps.active === "gemini" ? "Gemini شغال" : "Claude شغال"}
          badgeTone={ps.active === "rules" ? "warn" : ""}
          hint={
            <>
              {ps.active === "rules"
                ? "⚠️ ما موجود مفتاح لأي مزوّد — الفلترة تشتغل بالكلمات المفتاحية بس."
                : `كل منشور يمر على ${ps.active === "gemini" ? "Gemini" : "Claude"} (${ps.model}) ويتحلل قبل النشر.`}
              {" "}المفاتيح تنحط بملف <code>.env.local</code> على السيرفر:{" "}
              <b style={{ color: ps.claudeKey ? "var(--brand-ink)" : "var(--muted)" }}>
                ANTHROPIC_API_KEY {ps.claudeKey ? "✓" : "✗"}
              </b>{" · "}
              <b style={{ color: ps.geminiKey ? "var(--brand-ink)" : "var(--muted)" }}>
                GEMINI_API_KEY {ps.geminiKey ? "✓" : "✗"}
              </b>
            </>
          }
        >
          <div className="field">
            <label htmlFor="ai_provider">المزوّد</label>
            <select id="ai_provider" name="ai_provider" defaultValue={s.ai_provider}>
              {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            <div className="desc">
              إذا اخترت مزوّد وما موجود مفتاحه، النظام يجرب الثاني تلقائياً، وإذا ما موجود ولا مفتاح ينزل للكلمات المفتاحية.
            </div>
          </div>

          <div className="section-label">Gemini</div>
          <div className="form-grid two">
            <div className="field">
              <label htmlFor="gemini_model">الموديل</label>
              <select id="gemini_model" name="gemini_model" defaultValue={s.gemini_model}>
                {GEMINI_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                {!GEMINI_MODELS.some((m) => m.id === s.gemini_model) && (
                  <option value={s.gemini_model}>{s.gemini_model}</option>
                )}
              </select>
            </div>
            <div className="field" style={{ alignSelf: "end" }}>
              <Toggle name="gemini_thinking" label="التفكير العميق"
                hint="مطفي = أسرع ٣ مرات وأرخص ٣ مرات بنفس الدقة"
                defaultChecked={s.gemini_thinking} />
            </div>
          </div>

          <div className="section-label">Claude</div>
          <div className="form-grid two">
            <div className="field">
              <label htmlFor="claude_model">الموديل</label>
              <select id="claude_model" name="claude_model" defaultValue={s.claude_model}>
                {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                {!MODELS.some((m) => m.id === s.claude_model) && <option value={s.claude_model}>{s.claude_model}</option>}
              </select>
            </div>
            <div className="field">
              <label htmlFor="claude_effort">مستوى الجهد</label>
              <select id="claude_effort" name="claude_effort" defaultValue={s.claude_effort}>
                {EFFORTS.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
              <div className="desc">low = أرخص وأسرع · high = أدق وأغلى.</div>
            </div>
          </div>

          <div className="section-label">قواعد النشر والسرعة</div>
          <div className="form-grid two">
            <div className="field">
              <label htmlFor="claude_batch_size">منشورات بالطلب الواحد</label>
              <input id="claude_batch_size" name="claude_batch_size" type="number" inputMode="numeric"
                min={1} max={20} defaultValue={s.claude_batch_size} />
              <div className="desc">كل ما زاد، قلّت الطلبات والكلفة (الموصى به ٨).</div>
            </div>
            <div className="field">
              <label htmlFor="ai_rpm">أقصى طلبات بالدقيقة</label>
              <input id="ai_rpm" name="ai_rpm" type="number" inputMode="numeric"
                min={1} max={300} defaultValue={s.ai_rpm} />
              <div className="desc">الباقة المجانية لجيمناي = ٥، خليها ٤ للأمان.</div>
            </div>
            <div className="field">
              <label htmlFor="confidence_threshold">أقل ثقة مقبولة للنشر</label>
              <input id="confidence_threshold" name="confidence_threshold" type="number" inputMode="decimal"
                step="0.05" min={0} max={1} defaultValue={s.confidence_threshold} />
              <div className="desc">٠٫٥ متوازن · ٠٫٧ متشدد (ينشر أقل بس أدق).</div>
            </div>
            <div className="field" style={{ alignSelf: "end" }}>
              <Toggle name="auto_publish" label="النشر التلقائي"
                hint="مطفي = الوظائف المقبولة تنتظر موافقتك اليدوية"
                defaultChecked={s.auto_publish} />
            </div>
          </div>

          <div className="section-label">ضبط دقيق للفلترة</div>
          <div className="form-grid two">
            <div className="field">
              <label htmlFor="extra_job_words">كلمات قبول إضافية</label>
              <textarea id="extra_job_words" name="extra_job_words" defaultValue={listToText(s.extra_job_words)}
                placeholder="مثال: نبحث عن، فرصة ذهبية" style={{ minHeight: 76 }} />
              <div className="desc">افصل بينهن بفارزة عربية أو إنكليزية.</div>
            </div>
            <div className="field">
              <label htmlFor="extra_reject_words">كلمات رفض إضافية</label>
              <textarea id="extra_reject_words" name="extra_reject_words" defaultValue={listToText(s.extra_reject_words)}
                placeholder="مثال: بيع سيارة، ايجار شقة" style={{ minHeight: 76 }} />
              <div className="desc">أي منشور يحتوي وحدة منهن ينرفض.</div>
            </div>
          </div>

          <div className="field" style={{ marginTop: 14 }}>
            <label htmlFor="prompt_extra">تعليمات إضافية للموديل</label>
            <textarea id="prompt_extra" name="prompt_extra" defaultValue={s.prompt_extra}
              placeholder="مثال: لا تنشر وظائف خارج محافظة ديالى. اعتبر وظائف التوصيل ضمن قسم سواق ونقل." />
            <div className="desc">تنضاف لتعليمات الفلترة. بعد التعديل شغّل «إعادة فلترة الكل» من الصفحة الرئيسية.</div>
          </div>
        </SettingsCard>
      </form>

      {/* ————— ٤. النشر بقناتك ————— */}
      <form action={saveSettingsAction}>
        <input type="hidden" name="section" value="publish" />
        <SettingsCard
          id="publish"
          title={<><Telegram /> ٤. النشر بقناتك</>}
          badge={h.pubReady ? "مفعّل" : h.pubBroken ? "ناقص إعدادات" : "مطفي"}
          badgeTone={h.pubReady ? "" : h.pubBroken ? "warn" : "muted"}
          hint={<>كل وظيفة تنشر بالموقع تنرسل بنفس اللحظة لقناتك باسمك — <b>بدون ذكر المصدر</b>. تحتاج بوت من <b>@BotFather</b> يكون <b>أدمن</b> بقناتك.</>}
          extraButtons={
            <>
              <button className="btn" type="submit" formAction={testBotAction} formNoValidate>فحص الاتصال</button>
              <button className="btn" type="submit" formAction={sendTestAction} formNoValidate>رسالة تجريبية</button>
            </>
          }
        >
          {h.pubBroken && (
            <div className="toast bad" style={{ marginBottom: 14 }}>
              النشر مفعّل بس ناقص {!s.publish_bot_token ? "توكن البوت" : ""}
              {!s.publish_bot_token && !s.publish_channel ? " و" : ""}
              {!s.publish_channel ? "قناة النشر" : ""} — ما راح ينرسل شي.
            </div>
          )}

          <Toggle name="publish_enabled" label="النشر التلقائي بالقناة"
            hint="لما يكون مطفي، الوظائف تنشر بالموقع بس"
            defaultChecked={s.publish_enabled} />

          <div className="form-grid two" style={{ marginTop: 14 }}>
            <div className="field">
              <label htmlFor="publish_bot_token">توكن البوت</label>
              <SecretField id="publish_bot_token" name="publish_bot_token"
                placeholder={s.publish_bot_token ? "اتركه فارغ إذا ما تريد تغييره" : "123456:ABC-DEF..."}
                saved={Boolean(s.publish_bot_token)} />
              <div className="desc">ينخزن <b>مشفّر</b> بقاعدة البيانات وما ينعرض بالواجهة أبداً.</div>
            </div>
            <div className="field">
              <label htmlFor="publish_channel">قناة النشر</label>
              <input id="publish_channel" name="publish_channel" type="text" dir="ltr"
                defaultValue={s.publish_channel} placeholder="@MyJobsChannel أو -1001234567890" />
              <div className="desc">لازم البوت يكون أدمن بيها وعنده صلاحية النشر.</div>
            </div>
            <div className="field">
              <label htmlFor="publish_delay_seconds">فاصل بين الرسائل (ثانية)</label>
              <input id="publish_delay_seconds" name="publish_delay_seconds" type="number" inputMode="numeric"
                min={1} max={120} defaultValue={s.publish_delay_seconds} />
              <div className="desc">يحميك من حظر تلجرام المؤقت. الموصى به ٤.</div>
            </div>
            <div className="field">
              <label htmlFor="publish_max_age_hours">أقصى عمر للمنشور (ساعة)</label>
              <input id="publish_max_age_hours" name="publish_max_age_hours" type="number" inputMode="numeric"
                min={1} max={8760} defaultValue={s.publish_max_age_hours} />
              <div className="desc">الأقدم من هذا ما ينرسل — يحميك من إغراق القناة وقت الأرشفة.</div>
            </div>
          </div>

          <div className="section-label">شنو ينرسل بالرسالة</div>
          <div className="form-grid two">
            <Toggle name="publish_include_photo" label="صورة الإعلان" defaultChecked={s.publish_include_photo} />
            <Toggle name="publish_include_phones" label="أرقام التواصل" defaultChecked={s.publish_include_phones} />
            <Toggle name="publish_include_link" label="رابط الموقع" defaultChecked={s.publish_include_link} />
          </div>

          <div className="field" style={{ marginTop: 14 }}>
            <label htmlFor="publish_template">قالب الرسالة</label>
            <textarea id="publish_template" name="publish_template" className="code" dir="rtl"
              defaultValue={s.publish_template} style={{ minHeight: 200 }} />
            <div className="desc">أي سطر كل متغيراته فارغة ينحذف تلقائياً. يدعم وسوم HTML بسيطة مثل &lt;b&gt;.</div>
            <div className="tpl-help">
              {["title", "company", "city", "area", "category", "type", "gender", "salary", "experience",
                "vacancies", "summary", "phones", "apply", "link", "footer", "channel", "text"]
                .map((k) => <code key={k}>{`{${k}}`}</code>)}
            </div>
          </div>

          <div className="field" style={{ marginTop: 14 }}>
            <label htmlFor="publish_footer">تذييل ثابت</label>
            <input id="publish_footer" name="publish_footer" type="text" defaultValue={s.publish_footer}
              placeholder="مثال: 📢 اشترك بقناتنا لأحدث الوظائف" maxLength={300} />
          </div>

          <div className="section-label">معاينة الرسالة</div>
          <div className="preview-box">{preview}</div>
        </SettingsCard>
      </form>

      {/* ————— ٥. عرض الموقع ————— */}
      <form action={saveSettingsAction}>
        <input type="hidden" name="section" value="display" />
        <SettingsCard id="display" title={<><Building /> ٥. عرض الموقع</>}>
          <div className="form-grid two">
            <div className="field">
              <label htmlFor="per_page">عدد الوظائف بالصفحة</label>
              <input id="per_page" name="per_page" type="number" inputMode="numeric"
                min={5} max={60} defaultValue={s.per_page} />
            </div>
            <div className="field" style={{ alignSelf: "end" }}>
              <Toggle name="show_visitor_count" label="إظهار عدّاد الزوار بالموقع"
                hint="يظهر بتذييل الصفحة للزوار"
                defaultChecked={s.show_visitor_count} onText="ظاهر" offText="مخفي" />
            </div>
            <div className="field" style={{ alignSelf: "end" }}>
              <Toggle name="hide_phones" label="إخفاء أرقام الهاتف بالموقع"
                hint="تبقى موجودة بنص الإعلان الأصلي"
                defaultChecked={s.hide_phones} onText="مخفية" offText="ظاهرة" />
            </div>
          </div>
        </SettingsCard>
      </form>

      {/* ————— ٦. إعادة ضبط ————— */}
      <div className="adm-card" id="danger">
        <h2><Alert /> ٦. إعادة ضبط</h2>
        <p className="hint">يرجّع كل الإعدادات لقيمها الافتراضية (بضمنها توكن البوت والقالب). المنشورات ما تنمس.</p>
        <form action={resetSettingsAction}>
          <ConfirmButton
            message="راح ترجع كل الإعدادات للوضع الافتراضي، بضمنها توكن البوت وقالب الرسالة. متأكد؟"
            style={{ color: "var(--danger)", borderColor: "var(--danger)" }}
          >
            إعادة ضبط الإعدادات
          </ConfirmButton>
        </form>
      </div>
    </>
  );
}
