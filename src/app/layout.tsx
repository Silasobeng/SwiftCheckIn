import type { Metadata, Viewport } from 'next';
import './globals.css';
import InstallPrompt from '@/components/InstallPrompt';

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://wemotiply.com';
const TITLE = 'WeMotiply | Together, we multiply.';
const DESCRIPTION = 'Church growth, made visible. Check-in, attendance, giving and follow-up — everything a growing church needs in one place.';

export const metadata: Metadata = {
  // metadataBase makes the relative OG image below resolve to an absolute URL,
  // which every scraper requires — without it the preview silently has no image.
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  // Churches share links over WhatsApp far more than anywhere else here, and a
  // link with no card looks like spam next to one that unfurls properly.
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: 'WeMotiply',
    images: [{ url: '/icon-512.png', width: 512, height: 512, alt: 'WeMotiply' }],
    locale: 'en_GB',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: ['/icon-512.png'],
  },
  // The kiosk and dashboard live behind auth and have no business in search
  // results; the marketing page does.
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#16243A',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Weights must cover every weight the UI actually asks for, or the
            browser synthesises fake bolds — 600/700 are used throughout the
            admin dashboard and kiosk. */}
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400;1,600&family=DM+Sans:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-cream text-navy-900 antialiased">
        {children}
        <InstallPrompt />
      </body>
    </html>
  );
}
