export type JobStatus = "pending" | "pending_review" | "published" | "rejected" | "hidden";

export interface RawPost {
  id: number;
  channel: string;
  url: string;
  text: string;
  photos: string[];
  links: string[];
  postedAt: string | null;
}

export interface Extraction {
  is_job: boolean;
  confidence: number;
  reason: string;
  title: string | null;
  company: string | null;
  city: string | null;
  area: string | null;
  category: string | null;
  employment_type: string | null;
  gender: string | null;
  salary: string | null;
  experience: string | null;
  vacancies: number | null;
  phones: string[];
  contacts: string[];
  apply_method: string | null;
  summary: string | null;
  tags: string[];
}

export type TgStatus = "idle" | "queued" | "sent" | "failed" | "skipped";

export interface JobRow extends Extraction {
  id: number;
  channel: string;
  url: string;
  raw_text: string;
  photos: string[];
  links: string[];
  posted_at: string | null;
  posted_ts: number;
  fetched_at: string;
  status: JobStatus;
  classified_at: string | null;
  classifier: string | null;
  tg_status: TgStatus;
  tg_message_id: number | null;
  tg_sent_at: string | null;
  tg_error: string | null;
}

/** التصنيفات المعتمدة بالموقع */
export const CATEGORIES = [
  "مبيعات وتسويق",
  "مطاعم وكافيهات",
  "طبي وصيدلة",
  "هندسة وفنية",
  "تعليم وتدريس",
  "محاسبة وإدارة",
  "تكنولوجيا وبرمجة",
  "سواق ونقل",
  "عمال وحرفيين",
  "أمن وحماية",
  "خدمات منزلية",
  "أخرى",
] as const;

export const EMPLOYMENT_TYPES = ["دوام كامل", "دوام جزئي", "عقد", "تدريب", "عمل حر"] as const;
export const GENDERS = ["ذكور", "إناث", "الجنسين"] as const;
