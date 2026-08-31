import Link from 'next/link';

const SECTIONS = [
  { id: 'getting-started', label: 'Getting started' },
  { id: 'kiosk', label: 'Your check-in kiosk' },
  { id: 'people', label: 'Managing people' },
  { id: 'messaging', label: 'Messaging' },
  { id: 'giving', label: 'Giving' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'settings', label: 'Settings & branding' },
  { id: 'billing', label: 'Billing & subscription' },
  { id: 'help', label: 'Getting help' },
];

export default function ManualPage() {
  return (
    <main className="min-h-screen bg-cream px-6 py-16 text-navy-900">
      <div className="mx-auto max-w-5xl">
        <Link href="/" className="text-sm font-medium text-gold-600">← Back to WeMotiply</Link>
        <p className="mt-10 panel-label">GUIDE</p>
        <h1 className="mt-3 font-display text-4xl">The WeMotiply Manual</h1>
        <p className="mt-3 max-w-2xl text-navy-500">
          Everything about how WeMotiply works, from your first login to running Sunday service —
          written for someone who has never used it before. Prefer watching? A short video is on
          the way to the homepage; this covers the same ground in more depth.
        </p>

        <div className="mt-12 grid grid-cols-1 gap-10 lg:grid-cols-[220px_1fr]">

          {/* Table of contents — sticky on desktop, a plain list on mobile */}
          <nav className="lg:sticky lg:top-16 lg:self-start">
            <p className="text-xs font-semibold uppercase tracking-widest text-navy-400">On this page</p>
            <ul className="mt-3 space-y-2 text-sm">
              {SECTIONS.map(s => (
                <li key={s.id}><a href={`#${s.id}`} className="text-navy-600 hover:text-gold-600">{s.label}</a></li>
              ))}
            </ul>
          </nav>

          <div className="space-y-16 text-[15px] leading-7 text-navy-700">

            <section id="getting-started">
              <h2 className="font-display text-2xl text-navy-900">Getting started</h2>
              <p className="mt-3">
                When you sign up, you create your church&apos;s account and get a 14-day free trial —
                no card required. You&apos;ll set your church name, your name, an email and password,
                and an optional phone number.
              </p>
              <p className="mt-3">
                WeMotiply also picks up your browser&apos;s timezone automatically at sign-up, so
                &quot;today&quot; and &quot;this month&quot; in your reports match your church&apos;s real
                calendar day from day one. You can change it later in <strong>Settings</strong> if it
                ever picked up the wrong one.
              </p>
              <p className="mt-3">
                Once you&apos;re in, you land on the <strong>Dashboard</strong> — a quick snapshot of
                today: how many have checked in, your total members and visitors, and a &quot;Things to
                know&quot; panel flagging data worth cleaning up (people missing a birthday or email,
                for example). This is what you&apos;ll see every time you log in.
              </p>
            </section>

            <section id="kiosk">
              <h2 className="font-display text-2xl text-navy-900">Your check-in kiosk</h2>
              <p className="mt-3">
                The kiosk is the screen your ushers or greeters use on a tablet or laptop at the door
                — it&apos;s a separate, simplified page anyone can use without logging in, reached at
                your own link (<strong>Open Kiosk</strong>, top right of the admin dashboard).
              </p>
              <h3 className="mt-6 font-display text-lg text-navy-900">Starting a service</h3>
              <p className="mt-2">
                Before people can check in, create a service under <strong>Today&apos;s Service</strong>
                — give it a title, date, and optionally a theme, scripture, and message. Then click
                <strong> Open Check-In</strong> on the Dashboard. Check-in stays open until you close
                it; if you forget and leave it open past that day, the app warns you the next time you
                look, since anyone checking in would otherwise be recorded against the wrong day.
              </p>
              <h3 className="mt-6 font-display text-lg text-navy-900">How someone checks in</h3>
              <p className="mt-2">
                At the kiosk, a person searches for their name or types it fresh if it&apos;s their
                first time. A returning person is recognised by name and checked in with one tap; a
                new person fills in a short form — name and phone are all that&apos;s required, everything
                else is optional. First-time visitors are automatically tagged as such, which is what
                triggers your welcome email or text.
              </p>
              <h3 className="mt-6 font-display text-lg text-navy-900">More than one service a day</h3>
              <p className="mt-2">
                If you run two services on the same day, WeMotiply treats attendance as one combined
                &quot;today&quot; rather than counting a person twice if they attend both — that&apos;s
                deliberate, so your numbers reflect real people, not repeat check-ins. Where it matters
                (like the Dashboard&apos;s check-in list), each entry is labelled with which service it
                belongs to whenever there&apos;s more than one that day.
              </p>
            </section>

            <section id="people">
              <h2 className="font-display text-2xl text-navy-900">Managing people</h2>
              <p className="mt-3">
                Everyone who has ever checked in — or that you&apos;ve added manually — lives in the
                <strong> People</strong> tab. Each person has a role: <strong>Visitor</strong>,
                <strong> Member</strong>, or <strong>Leader</strong>. Only members and leaders count as
                &quot;expected&quot; for attendance follow-up (a visitor who hasn&apos;t come back isn&apos;t
                treated as a no-show, since they were never a regular attender to begin with).
              </p>
              <p className="mt-3">
                Search by name, phone, or email; filter by role or group. Click anyone to open their
                full profile — edit any detail, assign them to groups, or add a photo.
              </p>
              <h3 className="mt-6 font-display text-lg text-navy-900">Photos</h3>
              <p className="mt-2">
                Adding a photo is optional and admin-only — never something the kiosk or a visitor can
                do themselves. From a person&apos;s profile, either <strong>Take photo</strong> (opens
                your device&apos;s camera directly) or <strong>Upload photo</strong> (pick an existing
                image). Anyone without a photo just shows their initials, so nothing looks broken if you
                never add one.
              </p>
              <h3 className="mt-6 font-display text-lg text-navy-900">Groups</h3>
              <p className="mt-2">
                Set up categories (like &quot;Cell Group&quot; or &quot;Department&quot;) under
                <strong> Settings</strong>, then create groups within each. A person can belong to one
                group per category — one Cell Group and one Department at the same time, for instance.
                Groups are also how you can message a specific set of people without hand-picking them
                every time.
              </p>
            </section>

            <section id="messaging">
              <h2 className="font-display text-2xl text-navy-900">Messaging</h2>
              <p className="mt-3">
                Messaging covers two channels — email, which is fully automatic once set up, and SMS,
                which is pay-as-you-go and mostly used to reach people email can&apos;t.
              </p>
              <h3 className="mt-6 font-display text-lg text-navy-900">Automatic emails</h3>
              <p className="mt-2">
                Three templates send themselves once a person has an email address on file:
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li><strong>Welcome</strong> — sent the moment a first-time visitor checks in.</li>
                <li><strong>Birthday</strong> — sent on a member&apos;s birthday, if you&apos;ve recorded their date of birth.</li>
                <li><strong>We miss you</strong> — sent to a member who has missed two services in a row, at most once a week per person.</li>
              </ul>
              <p className="mt-2">
                Edit the subject and wording of each under <strong>Messaging → Templates</strong>. You
                can also send a one-off custom email to any audience from the same tab.
              </p>
              <h3 className="mt-6 font-display text-lg text-navy-900">SMS</h3>
              <p className="mt-2">
                SMS costs real money per message, so it runs on a prepaid credit balance rather than
                being unlimited like email. Top up under <strong>Settings → SMS</strong> — pay by
                Mobile Money or card, and credits land in your balance automatically once payment
                clears. The same three automatic messages (welcome, birthday, missed-service) can be
                sent by text instead of email for anyone who has a phone number but no email on file —
                toggle each on individually in Settings.
              </p>
              <p className="mt-2">
                Give your texts your church&apos;s name instead of the platform default by setting a
                <strong> Sender Name</strong> in Settings (max 11 characters, no spaces) — it has its
                own Save button, separate from the toggles, and a brand-new name can take the network a
                few minutes to approve before it appears on real messages.
              </p>
              <h3 className="mt-6 font-display text-lg text-navy-900">Broadcasts</h3>
              <p className="mt-2">
                Send a one-off text to your whole congregation, just members, just visitors, one
                specific group, or a hand-picked list of individual people — under
                <strong> Messaging → SMS Broadcast</strong>. You&apos;ll see the cost in credits before
                you send, and any message that fails to deliver is automatically refunded.
              </p>
            </section>

            <section id="giving">
              <h2 className="font-display text-2xl text-navy-900">Giving</h2>
              <p className="mt-3">
                Record tithes, offerings, seed giving, pledges, and other gifts under the
                <strong> Giving</strong> tab — who gave, how much, what type, and optionally which
                service it was given at. This feeds directly into your Analytics (giving by type,
                trends over time) and lets you email an individual giving receipt when needed.
              </p>
            </section>

            <section id="analytics">
              <h2 className="font-display text-2xl text-navy-900">Analytics</h2>
              <p className="mt-3">
                The <strong>Analytics</strong> tab is where the numbers turn into a story: attendance
                trends over the last six months, whether your congregation is actually growing or just
                busier, giving by type, and a year-over-year comparison once you have two years of
                data. Below that, three actionable panels — visitor retention, visitor-to-member
                conversion, and your most faithful attenders — followed by lighter demographic
                breakdowns (gender, age, location, how people found you, occupation).
              </p>
              <p className="mt-3">
                Lists that could otherwise grow long — top locations, top occupations, and so on — are
                always capped to the top 5, so this stays readable no matter how large your
                congregation gets.
              </p>
            </section>

            <section id="settings">
              <h2 className="font-display text-2xl text-navy-900">Settings & branding</h2>
              <p className="mt-3">
                Under <strong>Settings</strong> you can set your church&apos;s logo, cover photo, brand
                colour, address, and contact details — these appear on your kiosk screen and in every
                email you send. You can also customise the kiosk&apos;s welcome heading and subtext, set
                your timezone, manage group categories, and configure everything covered above under
                Messaging.
              </p>
            </section>

            <section id="billing">
              <h2 className="font-display text-2xl text-navy-900">Billing & subscription</h2>
              <p className="mt-3">
                Every church starts with a 14-day free trial, no card required. After that, choose
                Monthly or Annual (Annual works out cheaper per month). Payment is handled by Paystack
                — Mobile Money or card — and opens right on the page as an overlay rather than sending
                you anywhere else. Your subscription status and trial countdown are always visible at
                the top of the Dashboard.
              </p>
            </section>

            <section id="help">
              <h2 className="font-display text-2xl text-navy-900">Getting help</h2>
              <p className="mt-3">
                Stuck on something this manual didn&apos;t cover? Use the WhatsApp button in the app or
                on the website to reach us directly — a real person, not a bot.
              </p>
            </section>

          </div>
        </div>
      </div>
    </main>
  );
}
