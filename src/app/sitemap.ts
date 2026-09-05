import type { MetadataRoute } from "next";
import { LABS, SITE } from "@/labs";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${SITE.url}/`, lastModified: now, changeFrequency: "monthly", priority: 1 },
    ...LABS.filter((l) => l.status === "live").map((l) => ({
      url: `${SITE.url}/lab/${l.slug}/`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.8
    }))
  ];
}
