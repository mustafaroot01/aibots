/**
 * بيانات منظمة (JSON-LD) — هي اللي تخلي كوكل ووكلاء الذكاء يفهمون
 * إن هذي وظيفة حقيقية بمكان محدد، مو مجرد نص بصفحة.
 */
import type { JobRow } from "./types";
import type { Settings } from "./settings";

const EMPLOYMENT_MAP: Record<string, string> = {
  "دوام كامل": "FULL_TIME",
  "دوام جزئي": "PART_TIME",
  "عقد": "CONTRACTOR",
  "تدريب": "INTERN",
  "عمل حر": "OTHER",
};

/** يحوّل الراتب النصي الى مبلغ منظم إذا كان يحتوي أرقام */
function parseSalary(raw: string | null) {
  if (!raw) return undefined;
  const nums = (raw.match(/\d[\d,]{3,}/g) || []).map((n) => Number(n.replace(/,/g, "")));
  if (!nums.length) return undefined;

  const value = nums.length >= 2
    ? { "@type": "QuantitativeValue", minValue: Math.min(...nums), maxValue: Math.max(...nums), unitText: "MONTH" }
    : { "@type": "QuantitativeValue", value: nums[0], unitText: "MONTH" };

  return { "@type": "MonetaryAmount", currency: "IQD", value };
}

/** مخطط JobPosting — هذا اللي يدخّل الوظيفة بنتائج «وظائف Google» */
export function jobPostingLd(job: JobRow, s: Settings) {
  const posted = job.posted_at ? new Date(job.posted_at) : new Date();
  const validThrough = new Date(posted.getTime() + 60 * 86400_000);
  const salary = parseSalary(job.salary);

  return {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    identifier: { "@type": "PropertyValue", name: s.site_name, value: String(job.id) },
    title: job.title || "إعلان وظيفة",
    description: [
      job.summary,
      job.experience ? `الخبرة المطلوبة: ${job.experience}` : null,
      job.apply_method ? `طريقة التقديم: ${job.apply_method}` : null,
      "",
      job.raw_text,
    ].filter(Boolean).join("\n").slice(0, 4000),
    datePosted: posted.toISOString(),
    validThrough: validThrough.toISOString(),
    employmentType: job.employment_type ? EMPLOYMENT_MAP[job.employment_type] ?? "OTHER" : undefined,
    hiringOrganization: {
      "@type": "Organization",
      name: job.company || s.site_name,
      sameAs: s.site_url,
    },
    jobLocation: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressLocality: job.area || job.city || "العراق",
        addressRegion: job.city || undefined,
        addressCountry: "IQ",
      },
    },
    baseSalary: salary,
    industry: job.category || undefined,
    totalJobOpenings: job.vacancies || undefined,
    directApply: false,
    url: `${s.site_url}/job/${job.id}`,
    ...(job.phones.length ? { applicationContact: { "@type": "ContactPoint", telephone: `+964${job.phones[0].slice(1)}` } } : {}),
  };
}

/** مخطط الموقع نفسه + مربع بحث يظهر بكوكل */
export function websiteLd(s: Settings) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: s.site_name,
    url: s.site_url,
    inLanguage: "ar-IQ",
    description: `أحدث الشواغر والتعيينات في ديالى والعراق — ${s.site_name}`,
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${s.site_url}/?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
    publisher: {
      "@type": "Organization",
      name: s.site_name,
      url: s.site_url,
      logo: { "@type": "ImageObject", url: `${s.site_url}/icons/icon-512.png` },
    },
  };
}

/** قائمة الوظائف بالصفحة الرئيسية — تساعد الوكلاء يقرون النتائج */
export function itemListLd(jobs: JobRow[], s: Settings) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `وظائف متاحة — ${s.site_name}`,
    numberOfItems: jobs.length,
    itemListElement: jobs.slice(0, 25).map((j, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${s.site_url}/job/${j.id}`,
      name: j.title || "إعلان وظيفة",
    })),
  };
}

export function breadcrumbLd(trail: { name: string; url: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((t, i) => ({
      "@type": "ListItem", position: i + 1, name: t.name, item: t.url,
    })),
  };
}

/** وسم يزرع البيانات المنظمة بالصفحة */
export function JsonLd({ data }: { data: object | object[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
