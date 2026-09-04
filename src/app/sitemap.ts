import type { MetadataRoute } from "next";
import { facets, listBlog, searchJobs } from "@/lib/db";

import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  const SITE = getSettings().site_url;
  const { rows } = searchJobs({ perPage: 1000, page: 1 });
  const { cities, cats } = facets();
  const blog = listBlog(500, 1).rows;

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
    { url: `${SITE}/blog`, changeFrequency: "daily" as const, priority: 0.9 },
    ...blog.map((p) => ({
      url: `${SITE}/blog/${encodeURIComponent(p.slug)}`,
      lastModified: new Date(p.created_ts * 1000),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    ...rows.map((j) => ({
      url: `${SITE}/job/${j.id}`,
      lastModified: j.posted_at ? new Date(j.posted_at) : undefined,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
