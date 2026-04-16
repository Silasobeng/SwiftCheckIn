import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SwiftEntryPro | Church check-in, made simple.',
  description: 'Track attendance. Stay connected. Modern attendance management for churches.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;1,400&family=DM+Sans:wght@300;400;500&display=swap"
          rel="stylesheet"
        />
        <style>{`
          :root {
            --font-sans: 'DM Sans', system-ui, sans-serif;
            --font-serif: 'Playfair Display', Georgia, serif;
            --cream: #F8F4EE;
            --cream-dark: #EDE7DC;
            --navy: #16243A;
            --amber: #C97B1A;
            --amber-light: #F0A832;
          }
          body { font-family: var(--font-sans); }
          .font-display, .font-serif { font-family: var(--font-serif); }
        `}</style>
      </head>
      <body className="bg-cream text-navy-900 antialiased">{children}</body>
    </html>
  );
}
