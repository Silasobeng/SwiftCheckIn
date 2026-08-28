import Link from 'next/link';

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-cream px-6 py-16 text-navy-900">
      <article className="mx-auto max-w-2xl">
        <Link href="/" className="text-sm font-medium text-gold-600">← Back to WeMotiply</Link>
        <p className="mt-10 panel-label">LEGAL</p>
        <h1 className="mt-3 font-display text-4xl">Terms of Service</h1>
        <p className="mt-3 text-sm text-navy-500">Last updated: August 28, 2026</p>
        <div className="mt-10 space-y-7 text-sm leading-7 text-navy-700">
          <section><h2 className="font-display text-2xl text-navy-900">Using WeMotiply</h2><p className="mt-2">WeMotiply helps churches manage attendance, people, communications, giving records, and kiosk check-in. You are responsible for the information you add and for ensuring your authorised team members use the service appropriately.</p></section>
          <section><h2 className="font-display text-2xl text-navy-900">Your account</h2><p className="mt-2">Keep your account credentials secure. You must tell us promptly if you believe someone has accessed your account without permission.</p></section>
          <section><h2 className="font-display text-2xl text-navy-900">Billing and trial</h2><p className="mt-2">A free trial is available for the period shown at sign-up. Paid subscriptions and SMS credits are charged as described in the product at the time of purchase.</p></section>
          <section><h2 className="font-display text-2xl text-navy-900">Questions</h2><p className="mt-2">For questions about these terms, contact the WeMotiply team through the support link in the app.</p></section>
        </div>
      </article>
    </main>
  );
}
