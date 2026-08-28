import Link from 'next/link';

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-cream px-6 py-16 text-navy-900">
      <article className="mx-auto max-w-2xl">
        <Link href="/" className="text-sm font-medium text-gold-600">← Back to WeMotiply</Link>
        <p className="mt-10 panel-label">LEGAL</p>
        <h1 className="mt-3 font-display text-4xl">Privacy Policy</h1>
        <p className="mt-3 text-sm text-navy-500">Last updated: August 28, 2026</p>
        <div className="mt-10 space-y-7 text-sm leading-7 text-navy-700">
          <section><h2 className="font-display text-2xl text-navy-900">Information churches provide</h2><p className="mt-2">WeMotiply stores the account, congregation, attendance, communication, and giving information entered by your church so the service can provide its features.</p></section>
          <section><h2 className="font-display text-2xl text-navy-900">How information is used</h2><p className="mt-2">Information is used to operate the service, including check-in, reporting, emails, SMS, and account support. We do not sell congregation information.</p></section>
          <section><h2 className="font-display text-2xl text-navy-900">Your responsibilities</h2><p className="mt-2">Churches are responsible for collecting and using member information lawfully, including obtaining any required consent before sending email or SMS communications.</p></section>
          <section><h2 className="font-display text-2xl text-navy-900">Questions</h2><p className="mt-2">For privacy questions or account-data requests, contact the WeMotiply team through the support link in the app.</p></section>
        </div>
      </article>
    </main>
  );
}
