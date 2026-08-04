'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import type { LandingImages, LandingImageKey, PexelsImage } from '@/lib/pexels';

// FAQ questions come from the approved wireframe. The answers are written to
// match what the product actually does today — notably the member-list
// question, which is answered honestly because there is no bulk importer:
// people are added in the People tab or created automatically at check-in.
const FAQS = [
  { q:'Does it work without internet?', a:"Yes. Check-ins are saved on the device and sync automatically the moment the connection comes back. Your Sunday never stops for wifi." },
  { q:'Do members need to download anything?', a:"No. They walk up to the tablet and check in. Nothing to install, nothing to sign up for." },
  { q:'Can I bring in my existing member list?', a:"You add members in the People tab, and anyone who checks in for the first time is added automatically — so your list fills itself as people arrive. There is no bulk file upload yet." },
  { q:'Can I write my own follow-up messages?', a:"Yes. You write them in plain English and each one goes out personalised with the person's name. No coding, no templates to learn." },
  { q:'Can I track tithes and offerings?', a:"Yes. Record tithes, offerings, seeds and pledges by type, and a receipt can be emailed the moment a gift is recorded. Monthly and yearly totals are in your dashboard." },
  { q:'How long does it take to get started?', a:"Minutes. Create your account, add your church details, and open the kiosk screen on any tablet. Most churches are ready before their next service." },
  { q:'Is our church\'s data safe?', a:"Every church's data is completely separate from every other church's, passwords are encrypted, and nothing is reachable without your own login." },
];

const FEATURES: { title: string; lines: string[]; icon: FeatureIconVariant; imageKey: LandingImageKey }[] = [
  { title:'Smart Check-In', icon:'tablet', imageKey:'checkIn', lines:['Members check in within seconds.','No app. No paper. Just a tablet.'] },
  { title:'First-Time Visitor Experience', icon:'addPerson', imageKey:'visitor', lines:['A warm welcome form that takes','less than 30 seconds to fill.'] },
  { title:'Attendance History', icon:'calendar', imageKey:'attendance', lines:["Know who came.","Know who didn't.","Know who to call."] },
  { title:'Automated Follow-Up', icon:'mail', imageKey:'followUp', lines:['A welcome email when someone visits for the first time.','A birthday message on their day.',"A gentle reach-out when a member hasn't been seen in a while.",'All sent automatically. All written by you.'] },
  { title:'Giving Records', icon:'giving', imageKey:'giving', lines:['Record tithes, offerings, seeds and pledges.','Send a receipt the moment a gift is received.'] },
  { title:'Insights That Matter', icon:'chart', imageKey:'insights', lines:["Who's attending consistently.","Who's starting to drift.",'How giving is trending.','Where your church is growing.'] },
  { title:'Works Without Internet', icon:'offline', imageKey:'offline', lines:['No wifi on Sunday? No problem.',"Everything syncs when you're back."] },
];

const STEPS = [
  'Create your church account.',
  'Add your members.',
  'Put a tablet at your entrance.',
  'People check in on Sunday.',
  'WeMotiply handles the rest.',
];

const TESTIMONIALS = [
  { quote:'We finally know who has been absent and we follow up before they drift away.', by:'Pastor, Accra' },
  { quote:'Our volunteers picked it up in ten minutes. Sunday mornings are calmer now.', by:'Church Administrator' },
  { quote:'The giving receipts alone have changed how our members trust us with their gifts.', by:'Church Treasurer' },
];

// Traditions the product is built to work across — named generically, not
// as any specific organisation's mark. Swapping this for real logos later
// (once actual pilot churches have agreed to be named) only means changing
// what DENOMINATIONS holds; DenominationMarquee itself doesn't need to change.
const DENOMINATIONS = ['Pentecostal', 'Methodist', 'Presbyterian', 'Anglican', 'Baptist', 'Charismatic', 'Evangelical', 'Non-Denominational'];

/** A continuous, headerless strip — the loop point is invisible because the
 *  content is duplicated once and the track slides exactly one copy's width. */
function DenominationMarquee() {
  const loop = [...DENOMINATIONS, ...DENOMINATIONS];
  return (
    <div className="overflow-hidden border-y border-cream-dark bg-white py-7">
      <div className="marquee-track flex w-max items-center gap-16" style={{ animation: 'marquee 36s linear infinite' }}>
        {loop.map((d, i) => (
          <span key={i} className="whitespace-nowrap font-display text-lg tracking-wide text-navy-400">{d}</span>
        ))}
      </div>
    </div>
  );
}

/** Fades content up the first time it scrolls into view, then disconnects.
 *  Uses the fadeInUp keyframe already defined in the Tailwind config rather
 *  than adding a second motion language. */
function Reveal({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Content starts at opacity-0, so anything that stops the observer from
    // running would leave the section permanently invisible. On a browser
    // without IntersectionObserver, show it immediately instead of animating.
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); obs.disconnect(); }
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    obs.observe(el);
    // Backstop: browsers throttle IntersectionObserver in backgrounded tabs,
    // and a page whose copy never appears is a far worse outcome than one
    // that skips an animation. If the observer hasn't reported in by now,
    // reveal anyway.
    const failsafe = window.setTimeout(() => { setVisible(true); obs.disconnect(); }, 2500);
    return () => { window.clearTimeout(failsafe); obs.disconnect(); };
  }, []);

  return (
    <div ref={ref} className={`${visible ? 'animate-fade-in-up' : 'opacity-0'} ${className}`} style={{ animationDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

/** Gold checkmark used on every feature card and benefit line. */
function Check({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M4 10.5L8 14.5L16 5.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

/** The negative half of the before/after comparison — a plain drawn X, same
 *  single-stroke language as Check, not the ❌ emoji glyph (which renders as
 *  a different multicolour picture per OS and is exactly the toyish look
 *  this page is deliberately avoiding). */
function XMark({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
    </svg>
  );
}

export type FeatureIconVariant = 'tablet'|'addPerson'|'calendar'|'mail'|'giving'|'chart'|'offline';

/** One distinct mark per feature card, layered over its photo — the icon
 *  names the specific behaviour, the photo carries the warmth a line-drawing
 *  can't. */
function FeatureIcon({ variant, className = 'w-5 h-5' }: { variant: FeatureIconVariant; className?: string }) {
  const common = { stroke: 'currentColor', fill: 'none', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const glyphs: Record<FeatureIconVariant, React.ReactNode> = {
    tablet: <><rect x="6" y="3" width="12" height="18" rx="2" {...common} /><path d="M9 8l2.2 2.2L15 6" {...common} /></>,
    addPerson: <><circle cx="10" cy="8.3" r="3.3" {...common} /><path d="M4 19c0-3.6 2.7-6.3 6-6.3s6 2.7 6 6.3" {...common} /><path d="M18 8v4M16 10h4" {...common} /></>,
    calendar: <><rect x="4" y="5.5" width="16" height="14.5" rx="2" {...common} /><path d="M4 10h16M8 3.5v3M16 3.5v3" {...common} /><path d="M8.5 14l1.6 1.6L13.5 12" {...common} /></>,
    mail: <><rect x="3.5" y="5.5" width="17" height="13" rx="2" {...common} /><path d="M4.5 7l7.5 6 7.5-6" {...common} /></>,
    giving: <><path d="M12 6.2c-1-1.4-2.7-2-4.2-1.3C6 5.7 5.3 8 6.3 9.7c1 1.7 3.6 3.9 5.7 5.4 2.1-1.5 4.7-3.7 5.7-5.4 1-1.7.3-4-1.5-4.8-1.5-.7-3.2-.1-4.2 1.3z" {...common} /><path d="M5 19h14" {...common} /></>,
    chart: <><path d="M4 20V10M9.5 20V5M15 20v-7M20 20V8" {...common} /></>,
    offline: <><path d="M4 9.5C7 6.7 10 5.4 13.4 5.7M20 9.5a12.9 12.9 0 00-3-2.2M7.2 13.2a8.6 8.6 0 019.6 0M10.3 16.6a3.9 3.9 0 013.4 0" {...common} /><path d="M3.5 4.5l17 15" {...common} /></>,
  };
  return <svg className={className} viewBox="0 0 24 24" aria-hidden="true">{glyphs[variant]}</svg>;
}

/** A Pexels photo with the required photographer credit overlaid. Renders
 *  nothing when the image is missing (no key, rate-limited, empty search)
 *  so every section it's used in degrades to its photo-less layout instead
 *  of showing a broken image or empty box. */
function CreditedPhoto({ image, alt, className, imgClassName = 'object-cover', sizes = '(min-width: 768px) 50vw, 100vw' }: {
  image: PexelsImage | null;
  alt?: string;
  className: string;
  imgClassName?: string;
  sizes?: string;
}) {
  if (!image) return null;
  return (
    <div className={`relative ${className}`}>
      <Image src={image.url} alt={alt || image.alt} fill className={imgClassName} sizes={sizes} />
      <a
        href={image.pexelsUrl}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="absolute bottom-2 right-2 rounded-full bg-navy-950/60 px-2.5 py-1 text-[10px] font-medium text-white/90 backdrop-blur-sm transition hover:bg-navy-950/80"
      >
        Photo: {image.photographer} / Pexels
      </a>
    </div>
  );
}

export default function LandingPage({ images }: { images: LandingImages }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [mobileOpen, setMobileOpen]   = useState(false);
  const [openFaq, setOpenFaq]         = useState<number|null>(null);
  const [scrolled, setScrolled]       = useState(false);
  // Reduced-motion is a stated OS preference, so the loop is swapped for the
  // still frame rather than guessed at.
  const [allowMotion, setAllowMotion] = useState(true);
  // Gated by a real min-width check, never by a CSS class alone: `hidden
  // md:*` only sets display:none, and a mounted <video autoPlay> still
  // fetches. Verified previously by watching hero-bg.mp4 get requested on a
  // cold 375px load. The poster JPG is 31KB and is the hero background on
  // every viewport; only the video is desktop-only.
  const [showHeroVideo, setShowHeroVideo] = useState(false);

  useEffect(() => {
    fetch('/api/auth/session').then(r=>r.json()).then(d=>setIsLoggedIn(d.authenticated)).catch(()=>{});
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const onChange = () => setShowHeroVideo(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setAllowMotion(!mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Nav sits transparent on the hero photo and turns solid once the page
  // moves, so the links stay legible against cream sections below.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const navSolid = scrolled || mobileOpen;

  const Wordmark = ({ dark }: { dark: boolean }) => (
    <span className="font-display text-xl leading-none">
      <span className="text-gold-500">We</span>
      <span className={dark ? 'text-navy-900' : 'text-white'}>Motiply</span>
    </span>
  );

  return (
    <div className="min-h-screen overflow-x-hidden bg-cream font-sans text-navy-900">

      {/* ── NAV ── */}
      <header className={`fixed top-0 inset-x-0 z-50 transition-colors duration-300 ${navSolid ? 'bg-white/95 backdrop-blur-md border-b border-cream-dark' : 'bg-transparent'}`}>
        <div className="mx-auto flex h-20 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex flex-col leading-none">
            <Wordmark dark={navSolid} />
            <span className={`mt-1 text-[11px] italic ${navSolid ? 'text-navy-500' : 'text-white/70'}`}>Together, we multiply.</span>
          </Link>

          <nav className="hidden items-center gap-8 md:flex">
            {[['#features','Features'],['#pricing','Pricing'],['#faq','FAQ']].map(([href,label])=>(
              <a key={href} href={href} className={`text-sm transition-colors hover:text-gold-500 ${navSolid ? 'text-navy-600' : 'text-white/85'}`}>{label}</a>
            ))}
            {isLoggedIn ? (
              <Link href="/admin" className="rounded-full bg-gold-500 px-6 py-2.5 text-sm font-semibold text-navy-900 transition hover:brightness-105">Dashboard →</Link>
            ) : (
              <>
                <Link href="/login" className={`text-sm transition-colors hover:text-gold-500 ${navSolid ? 'text-navy-600' : 'text-white/85'}`}>Sign in</Link>
                <Link href="/signup" className="rounded-full bg-gold-500 px-6 py-2.5 text-sm font-semibold text-navy-900 transition hover:brightness-105">Start Free →</Link>
              </>
            )}
          </nav>

          <button
            onClick={()=>setMobileOpen(o=>!o)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
            className="flex h-10 w-10 flex-col items-center justify-center gap-1.5 md:hidden"
          >
            <span className={`block h-0.5 w-6 transition-all duration-300 ${navSolid ? 'bg-navy-900' : 'bg-white'} ${mobileOpen ? 'translate-y-2 rotate-45' : ''}`} />
            <span className={`block h-0.5 w-6 transition-all duration-300 ${navSolid ? 'bg-navy-900' : 'bg-white'} ${mobileOpen ? 'opacity-0' : ''}`} />
            <span className={`block h-0.5 w-6 transition-all duration-300 ${navSolid ? 'bg-navy-900' : 'bg-white'} ${mobileOpen ? '-translate-y-2 -rotate-45' : ''}`} />
          </button>
        </div>

        {mobileOpen && (
          <div className="border-t border-cream-dark bg-white px-6 py-4 md:hidden">
            {[['#features','Features'],['#pricing','Pricing'],['#faq','FAQ']].map(([href,label])=>(
              <a key={href} href={href} onClick={()=>setMobileOpen(false)} className="block py-3 text-navy-800">{label}</a>
            ))}
            {isLoggedIn ? (
              <Link href="/admin" onClick={()=>setMobileOpen(false)} className="mt-3 block rounded-full bg-gold-500 py-3 text-center font-semibold text-navy-900">Dashboard →</Link>
            ) : (
              <>
                <Link href="/signup" onClick={()=>setMobileOpen(false)} className="mt-3 block rounded-full bg-gold-500 py-3 text-center font-semibold text-navy-900">Start Free →</Link>
                <Link href="/login" onClick={()=>setMobileOpen(false)} className="mt-2 block py-3 text-center text-navy-600">Sign in</Link>
              </>
            )}
          </div>
        )}
      </header>

      {/* ── HERO ── */}
      <section className="relative flex min-h-[92vh] items-center justify-center overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage:'url(/hero-poster.jpg)' }} />
          {showHeroVideo && allowMotion && (
            <video autoPlay muted loop playsInline poster="/hero-poster.jpg" aria-hidden="true"
              className="absolute inset-0 h-full w-full object-cover">
              <source src="/hero-bg.mp4" type="video/mp4" />
            </video>
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-navy-950/70 via-navy-950/75 to-navy-950/90" />
        </div>

        <div className="relative z-10 mx-auto max-w-3xl px-6 py-32 text-center animate-fade-in-up">
          <p className="mb-8 font-display text-lg italic text-gold-400 sm:text-xl">
            &ldquo;Be fruitful and multiply.&rdquo;
            <span className="mt-2 block text-sm not-italic text-gold-400/70">— Genesis 1:28</span>
          </p>

          <h1 className="mb-6 font-display text-4xl leading-[1.12] text-white sm:text-5xl md:text-6xl" style={{ textWrap:'balance' as never }}>
            Never lose track<br/>of a soul<br/>who walks through your doors.
          </h1>

          <p className="mx-auto mb-10 max-w-xl text-base font-light leading-relaxed text-white/75 sm:text-lg">
            WeMotiply helps you welcome visitors, know your members, record tithes and offerings, follow up with care, and understand your church&apos;s growth — while giving you the insights to grow a healthier church.
          </p>

          <div className="mb-10 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
            <Link href="/signup" className="w-full rounded-full bg-gold-500 px-8 py-4 text-center font-semibold text-navy-900 shadow-lg shadow-gold-500/25 transition hover:-translate-y-0.5 hover:brightness-105 sm:w-auto">
              Start Free →
            </Link>
            <a href="#how-it-works" className="w-full rounded-full border border-white/40 px-8 py-4 text-center font-medium text-white backdrop-blur-sm transition hover:-translate-y-0.5 hover:border-white/70 hover:bg-white/10 sm:w-auto">
              See How It Works
            </a>
          </div>

          <div className="mx-auto flex max-w-xl flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm text-white/70">
            {['14-Day Free Trial','Easy to Set Up','Works Offline','No IT Skills Required','Fully Customizable'].map(t=>(
              <div key={t} className="flex items-center gap-2">
                <Check className="w-4 h-4 shrink-0 text-gold-400" />
                <span>{t}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <DenominationMarquee />

      {/* ── BEFORE / AFTER ── */}
      {/* "Before" photo still pending from the user — only the "After" photo
          arrived as an accessible file so far. Built so each card degrades
          gracefully with or without an image: the list is the source of
          truth, the photo is a header treatment on top of it. */}
      <section className="bg-cream px-6 py-20 md:py-28">
        <div className="mx-auto max-w-4xl">
          <Reveal>
            <h2 className="mb-14 text-center font-display text-2xl uppercase leading-snug tracking-wide text-navy-900 sm:text-3xl">
              Yes, your ministry can grow even bigger.
            </h2>
          </Reveal>
          <div className="grid gap-6 sm:grid-cols-2">
            <Reveal>
              <div className="h-full overflow-hidden rounded-2xl border border-cream-dark bg-white">
                <div className="p-7">
                  <div className="mb-5 text-xs font-semibold uppercase tracking-widest text-navy-400">Before WeMotiply</div>
                  <ul className="space-y-3.5">
                    {['Paper registers','Scattered information','Forgotten visitors','Manual follow-ups','No clear picture of growth'].map(t=>(
                      <li key={t} className="flex items-center gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-400">
                          <XMark className="w-3.5 h-3.5" />
                        </span>
                        <span className="font-light text-navy-600">{t}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Reveal>
            <Reveal delay={90}>
              <div className="h-full overflow-hidden rounded-2xl border border-gold-500/40 bg-white shadow-soft-md">
                <div className="relative h-40 w-full">
                  <Image
                    src="/after-wemotiply.jpg"
                    alt="A church leader and volunteer reviewing member records together"
                    fill
                    className="object-cover"
                    sizes="(min-width: 640px) 50vw, 100vw"
                  />
                </div>
                <div className="p-7">
                  <div className="mb-5 text-xs font-semibold uppercase tracking-widest text-gold-600">With WeMotiply</div>
                  <ul className="space-y-3.5">
                    {['Every person is known','Every visitor is welcomed','Every connection is tracked','Every follow-up happens','Every Sunday becomes insight'].map(t=>(
                      <li key={t} className="flex items-center gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gold-50 text-gold-500">
                          <Check className="w-3.5 h-3.5" />
                        </span>
                        <span className="text-navy-800">{t}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── WHY ONE PLATFORM ── */}
      <section className="bg-white px-6 py-20 md:py-28">
        <div className={`mx-auto items-center gap-10 md:gap-14 ${images.congregation ? 'grid max-w-5xl md:grid-cols-2' : 'max-w-2xl text-center'}`}>
          <Reveal>
            <p className="mb-6 text-lg font-light leading-relaxed text-navy-700">
              Healthy churches need more than paper registers and spreadsheets. When attendance, giving, and visitor records are kept in different places, it&apos;s difficult to build a healthy, growing church.
            </p>
            <p className="text-lg font-light leading-relaxed text-navy-700">
              WeMotiply brings your attendance, giving, visitors, and member care into one simple platform — so you can focus on ministry, not administration.
            </p>
          </Reveal>
          <Reveal delay={90}>
            <CreditedPhoto image={images.congregation} className="h-64 w-full overflow-hidden rounded-2xl shadow-soft-md md:h-80" />
          </Reveal>
        </div>
      </section>

      {/* ── THE SOLUTION ── */}
      <section className="bg-navy-900 px-6 py-20 md:py-28">
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <h2 className="mb-8 font-display text-2xl uppercase leading-snug tracking-wide text-white sm:text-3xl">
              That&apos;s why we built <span className="text-gold-400">WeMotiply</span>.
            </h2>
            <p className="mb-2 text-lg font-light text-white/60">Not another church database.</p>
            <p className="mb-8 text-lg font-light text-white/60">Not another spreadsheet.</p>
            <p className="mx-auto max-w-xl text-lg font-light leading-relaxed text-white/85">
              A platform built to help churches know their people, care for them, and grow — one Sunday at a time.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" className="scroll-mt-24 bg-cream px-6 py-20 md:py-28">
        <div className="mx-auto max-w-5xl">
          <Reveal>
            <h2 className="mb-14 text-center font-display text-2xl uppercase tracking-wide text-navy-900 sm:text-3xl">
              Everything your church needs.
            </h2>
          </Reveal>
          <div className="grid gap-5 md:grid-cols-2">
            {FEATURES.map((f,i)=>(
              <Reveal key={f.title} delay={(i%2)*80} className="h-full">
                <div className="group h-full overflow-hidden rounded-2xl border border-cream-dark bg-white transition duration-200 hover:-translate-y-1 hover:shadow-soft-md">
                  <CreditedPhoto
                    image={images[f.imageKey]}
                    className="h-36 w-full"
                    imgClassName="object-cover transition duration-300 group-hover:scale-105"
                  />
                  <div className="p-7">
                    <div className="mb-4 flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gold-50 text-gold-500 transition-transform duration-200 group-hover:scale-110">
                        <FeatureIcon variant={f.icon} />
                      </span>
                      <h3 className="font-display text-lg text-navy-900">{f.title}</h3>
                    </div>
                    <div className="space-y-1.5">
                      {f.lines.map(l=><p key={l} className="text-sm font-light leading-relaxed text-navy-600">{l}</p>)}
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how-it-works" className="scroll-mt-24 bg-white px-6 py-20 md:py-28">
        <div className="mx-auto max-w-2xl">
          <Reveal>
            <h2 className="mb-14 text-center font-display text-2xl uppercase tracking-wide text-navy-900 sm:text-3xl">
              How WeMotiply works
            </h2>
          </Reveal>
          <ol className="space-y-4">
            {STEPS.map((step,i)=>(
              <Reveal key={step} delay={i*70}>
                <li className="flex items-center gap-5 rounded-2xl border border-cream-dark bg-cream px-6 py-5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold-500 font-display text-lg text-navy-900">{i+1}</span>
                  <span className="font-light text-navy-800">{step}</span>
                </li>
              </Reveal>
            ))}
          </ol>
          <Reveal delay={140}>
            <div className="mt-12 text-center">
              <p className="font-display text-lg text-navy-900">Emails. Reports. Follow-up.</p>
              <p className="mt-1 font-light text-navy-600">So you can focus on your people.</p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── BUILT FOR CHURCHES ── */}
      <section className="bg-cream-dark px-6 py-20 md:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <Reveal>
            <h2 className="mb-8 font-display text-2xl uppercase tracking-wide text-navy-900 sm:text-3xl">
              Built from real conversations.
            </h2>
            <p className="mb-6 font-light leading-relaxed text-navy-700">
              Every feature in WeMotiply came from sitting with pastors and church leaders and asking one question:
            </p>
            <p className="mb-8 font-display text-xl italic text-gold-500">
              What is making Sunday harder than it should be?
            </p>
            <div className="space-y-1 font-light text-navy-600">
              <p>No guesswork.</p>
              <p>No features nobody asked for.</p>
              <p>Just what churches actually need.</p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── SOCIAL PROOF ── */}
      <section className="bg-white px-6 py-20 md:py-28">
        <div className="mx-auto grid max-w-5xl gap-5 md:grid-cols-3">
          {TESTIMONIALS.map((t,i)=>(
            <Reveal key={t.by} delay={i*90} className="h-full">
              <figure className="flex h-full flex-col rounded-2xl border border-cream-dark bg-cream p-7">
                <div className="mb-4 text-sm tracking-widest text-gold-400" aria-label="Five out of five stars">★★★★★</div>
                <blockquote className="mb-5 flex-1 font-display text-base italic leading-relaxed text-navy-900">
                  &ldquo;{t.quote}&rdquo;
                </blockquote>
                <figcaption className="text-sm text-navy-500">— {t.by}</figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" className="scroll-mt-24 bg-cream px-6 py-20 md:py-28">
        <div className="mx-auto max-w-3xl">
          <Reveal>
            <h2 className="mb-3 text-center font-display text-2xl uppercase tracking-wide text-navy-900 sm:text-3xl">
              One price.
            </h2>
            <h2 className="mb-14 text-center font-display text-2xl uppercase tracking-wide text-navy-900 sm:text-3xl">
              Everything included.
            </h2>
          </Reveal>

          <div className="mb-12 grid gap-5 sm:grid-cols-2">
            <Reveal className="h-full">
              <div className="flex h-full flex-col rounded-2xl border border-cream-dark bg-white p-8 text-center">
                <div className="mb-4 text-xs font-semibold uppercase tracking-widest text-navy-400">Monthly</div>
                <div className="font-display text-4xl text-navy-900">GHS 150</div>
                <div className="mt-1 text-sm text-navy-500">per month</div>
              </div>
            </Reveal>
            <Reveal delay={90} className="h-full">
              <div className="relative flex h-full flex-col rounded-2xl border-2 border-gold-500 bg-white p-8 text-center shadow-soft-lg">
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-gold-500 px-4 py-1 text-[11px] font-semibold uppercase tracking-widest text-navy-900">
                  2 months free
                </span>
                <div className="mb-4 text-xs font-semibold uppercase tracking-widest text-gold-600">Yearly</div>
                <div className="font-display text-4xl text-navy-900">GHS 1,500</div>
                <div className="mt-1 text-sm text-navy-500">per year</div>
              </div>
            </Reveal>
          </div>

          <Reveal delay={140}>
            <ul className="mx-auto mb-10 max-w-sm space-y-2.5">
              {['Unlimited members','Unlimited attendance','Unlimited giving records','Unlimited reports','Unlimited follow-up','Unlimited ministry.'].map(f=>(
                <li key={f} className="flex items-center gap-3 text-navy-700">
                  <Check className="w-4 h-4 shrink-0 text-gold-500" />
                  <span className="font-light">{f}</span>
                </li>
              ))}
            </ul>
            <div className="text-center">
              <Link href="/signup" className="inline-block rounded-full bg-gold-500 px-9 py-4 font-semibold text-navy-900 shadow-lg shadow-gold-500/25 transition hover:-translate-y-0.5 hover:brightness-105">
                Start Free — 14 Days, No Card
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="scroll-mt-24 bg-white px-6 py-20 md:py-28">
        <div className="mx-auto max-w-2xl">
          <Reveal>
            <h2 className="mb-12 text-center font-display text-2xl uppercase tracking-wide text-navy-900 sm:text-3xl">
              Questions
            </h2>
          </Reveal>
          <div className="divide-y divide-cream-dark border-y border-cream-dark">
            {FAQS.map((f,i)=>(
              <div key={f.q}>
                <button
                  onClick={()=>setOpenFaq(openFaq===i?null:i)}
                  aria-expanded={openFaq===i}
                  className="flex w-full items-center justify-between gap-4 py-5 text-left transition hover:opacity-70"
                >
                  <span className="font-display text-base text-navy-900 sm:text-lg">{f.q}</span>
                  <span className={`shrink-0 text-gold-500 transition-transform duration-200 ${openFaq===i?'rotate-180':''}`} aria-hidden="true">▼</span>
                </button>
                {openFaq===i && (
                  <p className="animate-fade-in pb-5 text-sm font-light leading-relaxed text-navy-600">{f.a}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="bg-navy-900 px-6 py-24 text-center md:py-32">
        <Reveal>
          <h2 className="mx-auto mb-8 max-w-xl font-display text-2xl uppercase leading-snug tracking-wide text-white sm:text-3xl">
            Every person matters.<br/>Every visitor matters.<br/>Every Sunday matters.
          </h2>
          <p className="text-lg font-light text-white/60">Stop managing spreadsheets.</p>
          <p className="mb-10 text-lg font-light text-white/85">Start knowing your people.</p>
          <Link href="/signup" className="inline-block rounded-full bg-gold-500 px-9 py-4 font-semibold text-navy-900 shadow-lg shadow-gold-500/25 transition hover:-translate-y-0.5 hover:brightness-105">
            Start Your Free Trial →
          </Link>
          <p className="mt-6 text-sm text-white/40">No credit card · Ready in minutes</p>
          <p className="mt-1 text-sm text-white/40">Trusted by churches in Accra</p>
        </Reveal>
      </section>

      {/* ── FOOTER ── */}
      <footer className="bg-navy-950 px-6 py-14">
        <div className="mx-auto flex max-w-6xl flex-col gap-10 md:flex-row md:items-start md:justify-between">
          <div>
            <Wordmark dark={false} />
            <p className="mt-1.5 text-sm italic text-white/40">Together, we multiply.</p>
          </div>
          <div className="flex gap-12">
            <div className="space-y-2.5">
              {[['#features','Features'],['#pricing','Pricing'],['#faq','FAQ']].map(([href,label])=>(
                <a key={href} href={href} className="block text-sm text-white/45 transition-colors hover:text-gold-400">{label}</a>
              ))}
            </div>
            <div className="space-y-2.5">
              {['Privacy','Terms','Contact'].map(l=>(
                <a key={l} href="#" className="block text-sm text-white/45 transition-colors hover:text-gold-400">{l}</a>
              ))}
            </div>
          </div>
        </div>
        <div className="mx-auto mt-12 max-w-6xl border-t border-white/10 pt-6 text-sm text-white/30">
          © {new Date().getFullYear()} WeMotiply. Built for churches in Ghana.
        </div>
      </footer>
    </div>
  );
}
