/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.pexels.com' },
    ],
  },
  // Anyone who still has the old preview URL bookmarked or shared lands on
  // the real domain instead, path and query string intact — a bookmarked
  // /login or a pasted /reset-password?token=... link keeps working rather
  // than dead-ending on a URL that will eventually get decommissioned.
  //
  // Matched on host, not wildcarded to *.vercel.app: that would also catch
  // this project's PR/branch preview deployments, which need to stay
  // reachable on their own throwaway URLs for review before merging.
  redirects: async () => [
    {
      source: '/:path*',
      has: [{ type: 'host', value: 'swift-check-in-seven.vercel.app' }],
      destination: 'https://wemotiply.com/:path*',
      permanent: true,
    },
  ],
  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-XSS-Protection', value: '1; mode=block' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        {
          key: 'Content-Security-Policy',
          // layout.tsx loads Playfair Display and DM Sans from Google Fonts.
          // Without fonts.googleapis.com in style-src the stylesheet is
          // blocked outright, and without fonts.gstatic.com in font-src the
          // font files are — so the whole app silently fell back to Times and
          // Arial in production while looking correct in dev.
          value: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "img-src 'self' data: https:",
            "font-src 'self' https://fonts.gstatic.com",
            "connect-src 'self' https://*.supabase.co",
            // Paystack checkout is a top-level redirect, which form-action
            // governs — without this the browser can block the hand-off to
            // the payment page.
            "form-action 'self' https://checkout.paystack.com",
            "frame-ancestors 'none'",
            "base-uri 'self'",
          ].join('; '),
        },
      ],
    },
  ],
};

module.exports = nextConfig;
