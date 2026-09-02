import type { MetadataRoute } from "next";
import { searchJobs } from "@/lib/db";

import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  const SITE = getSettings().site_url;
  const { rows } = searchJobs({ perPage: 1000, page: 1 });
  return [
    { url: `${SITE}/`, changeFrequency: "hourly", priority: 1 },
    ...rows.map((j) => ({
      url: `${SITE}/job/${j.id}`,
      lastModified: j.posted_at ? new Date(j.posted_at) : undefined,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
