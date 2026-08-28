import type { MetadataRoute } from 'next';

// A church's kiosk URL is effectively public (it's opened on a tablet with no
// login), and /admin, /owner and /reset-password all sit behind auth. None of
// them belong in search results — only the marketing page does.
export default function robots(): MetadataRoute.Robots {
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://wemotiply.com';
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/owner', '/kiosk/', '/reset-password', '/api/'],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
