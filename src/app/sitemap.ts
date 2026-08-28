import type { MetadataRoute } from 'next';

// Only the pages a stranger should be able to find. Everything else is either
// behind a login or specific to one church.
export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://wemotiply.com';
  return [
    { url: siteUrl,             lastModified: new Date(), changeFrequency: 'weekly',  priority: 1 },
    { url: `${siteUrl}/signup`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${siteUrl}/login`,  lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
  ];
}
