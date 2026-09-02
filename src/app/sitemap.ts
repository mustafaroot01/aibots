import type { MetadataRoute } from "next";
import { facets, searchJobs } from "@/lib/db";

import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  const SITE = getSettings().site_url;
  const { rows } = searchJobs({ perPage: 1000, page: 1 });
  const { cities, cats } = facets();

  return [
    { url: `${SITE}/`, changeFrequency: "hourly" as const, priority: 1 },
    // صفحات المحافظات والأقسام — تستهدف بحث «وظائف بعقوبة» وشبيهاته
    ...cities.map((c) => ({
      url: `${SITE}/city/${encodeURIComponent(c.v)}`,
      changeFrequency: "daily" as const,
      priority: 0.9,
    })),
    ...cats.map((c) => ({
      url: `${SITE}/category/${encodeURIComponent(c.v)}`,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
    ...rows.map((j) => ({
      url: `${SITE}/job/${j.id}`,
      lastModified: j.posted_at ? new Date(j.posted_at) : undefined,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
