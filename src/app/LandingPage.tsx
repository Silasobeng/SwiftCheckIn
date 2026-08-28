'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import type { LandingImages } from '@/lib/pexels';
import WhatsAppSupport from '@/components/WhatsAppSupport';

const DENOMINATIONS = ['Pentecostal', 'Methodist', 'Presbyterian', 'Anglican', 'Baptist', 'Charismatic', 'Evangelical', 'Non-Denominational'];

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

function Reveal({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); obs.disconnect(); }
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    obs.observe(el);
    const failsafe = window.setTimeout(() => { setVisible(true); obs.disconnect(); }, 2500);
    return () => { window.clearTimeout(failsafe); obs.disconnect(); };
  }, []);

  return (
    <div ref={ref} className={`${visible ? 'animate-fade-in-up' : 'opacity-0'} ${className}`} style={{ animationDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

function Check({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M4 10.5L8 14.5L16 5.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

type FeatureIconVariant = 'tablet'|'addPerson'|'calendar'|'mail'|'giving'|'chart'|'offline';

function FeatureIcon({ variant, className = 'w-4 h-4' }: { variant: FeatureIconVariant; className?: string }) {
  const c = { stroke: 'currentColor', fill: 'none', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const g: Record<FeatureIconVariant, React.ReactNode> = {
    tablet:    <><rect x="6" y="3" width="12" height="18" rx="2" {...c} /><path d="M9 8l2.2 2.2L15 6" {...c} /></>,
    addPerson: <><circle cx="10" cy="8.3" r="3.3" {...c} /><path d="M4 19c0-3.6 2.7-6.3 6-6.3s6 2.7 6 6.3" {...c} /><path d="M18 8v4M16 10h4" {...c} /></>,
    calendar:  <><rect x="4" y="5.5" width="16" height="14.5" rx="2" {...c} /><path d="M4 10h16M8 3.5v3M16 3.5v3" {...c} /><path d="M8.5 14l1.6 1.6L13.5 12" {...c} /></>,
    mail:      <><rect x="3.5" y="5.5" width="17" height="13" rx="2" {...c} /><path d="M4.5 7l7.5 6 7.5-6" {...c} /></>,
    giving:    <><path d="M12 6.2c-1-1.4-2.7-2-4.2-1.3C6 5.7 5.3 8 6.3 9.7c1 1.7 3.6 3.9 5.7 5.4 2.1-1.5 4.7-3.7 5.7-5.4 1-1.7.3-4-1.5-4.8-1.5-.7-3.2-.1-4.2 1.3z" {...c} /><path d="M5 19h14" {...c} /></>,
    chart:     <><path d="M4 20V10M9.5 20V5M15 20v-7M20 20V8" {...c} /></>,
    offline:   <><path d="M4 9.5C7 6.7 10 5.4 13.4 5.7M20 9.5a12.9 12.9 0 00-3-2.2M7.2 13.2a8.6 8.6 0 019.6 0M10.3 16.6a3.9 3.9 0 013.4 0" {...c} /><path d="M3.5 4.5l17 15" {...c} /></>,
  };
  return <svg className={className} viewBox="0 0 24 24" aria-hidden="true">{g[variant]}</svg>;
}

const CAPABILITIES: { icon: FeatureIconVariant; label: string; desc: string }[] = [
  { icon: 'tablet',    label: 'Check-In Kiosk',          desc: 'Members tap in within seconds on any tablet. No app, no paper, no queue — just a smooth Sunday entrance.' },
  { icon: 'addPerson', label: 'Visitor Welcome',          desc: 'First-timers fill a simple 30-second form. Their details land straight in your records, ready for follow-up.' },
  { icon: 'calendar',  label: 'Attendance Tracking',      desc: 'Know who came, who\'s been missing, and who to call — every Sunday, organised and at a glance.' },
  { icon: 'mail',      label: 'Automated Emails',         desc: 'Welcome messages, birthday greetings, and gentle "we miss you" emails — written by you, sent automatically.' },
  { icon: 'offline',   label: 'Automated SMS',            desc: 'For members without email, WeMotiply sends the same care as a text message — so no one is left out.' },
  { icon: 'giving',    label: 'Giving Records',           desc: 'Record tithes, offerings, seeds, and pledges by type. Send a digital receipt the moment a gift is received.' },
  { icon: 'chart',     label: 'Growth Insights',          desc: 'See who\'s attending consistently, who\'s starting to drift, and how giving is trending — all in your dashboard.' },
  { icon: 'addPerson', label: 'Cell Groups & Departments', desc: 'Organise members into fellowships, cells, or departments. Track attendance and absentees by group.' },
  { icon: 'offline',   label: 'Works Without Internet',   desc: 'No wifi on Sunday? No problem. Every check-in is saved on the device and syncs the moment you\'re back online.' },
];

export default function LandingPage({ images }: { images: LandingImages }) {
  const [isLoggedIn, setIsLoggedIn]   = useState(false);
  const [mobileOpen, setMobileOpen]   = useState(false);
  const [scrolled, setScrolled]       = useState(false);
  const [allowMotion, setAllowMotion] = useState(true);
  const [showHeroVideo, setShowHeroVideo] = useState(false);
  const [selectedCap, setSelectedCap] = useState(0);
  const [annual, setAnnual] = useState(false);

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

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const navSolid = scrolled || mobileOpen;

  return (
    <div className="min-h-screen overflow-x-hidden bg-cream font-sans text-navy-900">

      {/* NAV */}
      <header className={`fixed top-0 inset-x-0 z-50 transition-colors duration-300 ${navSolid ? 'bg-white/95 backdrop-blur-md border-b border-cream-dark' : 'bg-transparent'}`}>
        <div className="mx-auto flex h-20 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center leading-none">
            <img
              src="/wemotiply-logo.jpg"
              alt="WeMotiply"
              className="h-14 w-auto"
              style={{ borderRadius: 8, background: '#fff', padding: navSolid ? 0 : '2px 6px' }}
            />
          </Link>

          <nav className="hidden items-center gap-8 md:flex">
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
            {isLoggedIn ? (
              <Link href="/admin" onClick={()=>setMobileOpen(false)} className="block rounded-full bg-gold-500 py-3 text-center font-semibold text-navy-900">Dashboard →</Link>
            ) : (
              <>
                <Link href="/signup" onClick={()=>setMobileOpen(false)} className="block rounded-full bg-gold-500 py-3 text-center font-semibold text-navy-900">Start Free →</Link>
                <Link href="/login" onClick={()=>setMobileOpen(false)} className="mt-2 block py-3 text-center text-navy-600">Sign in</Link>
              </>
            )}
          </div>
        )}
      </header>

      {/* HERO */}
      <section className="relative flex min-h-[82vh] items-center justify-center overflow-hidden">
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
            WeMotiply is church management software that helps you welcome visitors, know your members, record tithes and offerings, follow up with care, and understand your church&apos;s growth — while giving you the insights to grow a healthier church.
          </p>

          <div className="mb-10 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
            <Link href="/signup" className="w-full rounded-full bg-gold-500 px-8 py-4 text-center font-semibold text-navy-900 shadow-lg shadow-gold-500/25 transition hover:-translate-y-0.5 hover:brightness-105 sm:w-auto">
              Start Free →
            </Link>
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

      {/* CAPABILITIES — flat navy, same palette as the hero without the
          brightness risk of footage bleeding through behind the cards.
          The crowd photo sits as a contained side accent, not a full-bleed
          background, so it never threatens the cards' legibility. */}
      <section className="relative bg-navy-900 px-6 py-20 md:py-24">

        <div className="relative z-10 mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-14">
          <Reveal className="hidden lg:block">
            <div className="relative h-[520px] overflow-hidden rounded-2xl">
              <img
                src="/congregation-bw.jpg"
                alt="A large congregation gathered at a night service"
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-navy-900 via-navy-900/10 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-7">
                <p className="font-display text-lg italic text-white/90">Every face in the crowd is a name worth knowing.</p>
              </div>
            </div>
          </Reveal>

          <Reveal>
            <p className="mb-8 text-center text-xs font-semibold uppercase tracking-[0.18em] text-gold-400 lg:text-left">What WeMotiply offers</p>
            <div className="mx-auto max-w-3xl lg:mx-0 lg:max-w-none">
              {/* Card grid */}
              <div className="grid grid-cols-3 gap-3 lg:grid-cols-3 lg:gap-3">
                {CAPABILITIES.map((c, i) => {
                  const active = selectedCap === i;
                  const photo = i === 3 ? images.emailImg : i === 4 ? images.smsImg : null;
                  return (
                    <button
                      key={c.label}
                      onClick={() => setSelectedCap(i)}
                      className={`group relative flex flex-col items-center gap-2 overflow-hidden rounded-xl border px-3 py-5 text-center backdrop-blur-sm transition-all duration-200 ${
                        active
                          ? 'border-gold-400 bg-white/95 shadow-lg shadow-black/20'
                          : 'border-white/20 bg-white/10 hover:border-gold-400/50 hover:bg-white/[0.16]'
                      }`}
                    >
                      {/* photo accent strip for email + sms */}
                      {photo && !active && (
                        <div className="absolute inset-x-0 top-0 h-12 overflow-hidden opacity-25">
                          <img src={photo.url} alt="" className="w-full h-full object-cover" aria-hidden="true" />
                        </div>
                      )}
                      <span className={`relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${active ? 'bg-gold-500 text-white' : 'bg-white/15 text-gold-300'}`}>
                        <FeatureIcon variant={c.icon} className="w-4 h-4" />
                      </span>
                      <span className={`relative text-xs font-medium leading-snug ${active ? 'text-navy-900' : 'text-white'}`}>{c.label}</span>
                      {/* "more" indicator */}
                      <span className={`relative flex gap-0.5 transition-opacity ${active ? 'opacity-0' : 'opacity-60 group-hover:opacity-90'}`} aria-hidden="true">
                        {[0,1,2].map(d => <span key={d} className="block h-1 w-1 rounded-full bg-white" />)}
                      </span>
                      {active && <span className="relative block h-0.5 w-6 rounded-full bg-gold-400" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>

              {/* Description panel */}
              <div className="mt-4 rounded-xl border border-white/15 bg-white/[0.07] px-6 py-5 backdrop-blur-sm">
                <p className="mb-1 text-sm font-semibold text-white">{CAPABILITIES[selectedCap].label}</p>
                <p className="text-sm font-light leading-relaxed text-white/60">{CAPABILITIES[selectedCap].desc}</p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* PRICING */}
      <section className="bg-navy-900 px-6 py-14">
        <Reveal>
          <div className="mx-auto max-w-xl">
            <p className="mb-6 text-center text-xs font-semibold uppercase tracking-[0.18em] text-gold-500">Pricing</p>

            {/* Monthly / Annual toggle */}
            <div className="mb-8 flex items-center justify-center gap-4">
              <span className={`text-sm transition-colors ${!annual ? 'text-white font-medium' : 'text-white/40'}`}>Monthly</span>
              <button
                onClick={() => setAnnual(a => !a)}
                aria-label="Toggle billing period"
                className={`relative h-6 w-11 rounded-full transition-colors ${annual ? 'bg-gold-500' : 'bg-white/20'}`}
              >
                <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${annual ? 'translate-x-5' : ''}`} />
              </button>
              <span className={`text-sm transition-colors ${annual ? 'text-white font-medium' : 'text-white/40'}`}>
                Annual <span className="ml-1 rounded-full bg-gold-500/20 px-2 py-0.5 text-[10px] font-semibold text-gold-400">Save GHS 178</span>
              </span>
            </div>

            {/* Price display */}
            <div className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
              <div className="mb-1 font-display text-5xl text-white">
                GHS {annual ? '890' : '89'}
              </div>
              <div className="text-sm text-white/40">
                {annual ? 'per year — about GHS 74/month' : 'per month'}
              </div>
              <ul className="mt-6 space-y-2 text-left">
                {['Unlimited members','Unlimited attendance','Unlimited giving records','Automated follow-up emails','Full analytics & insights'].map(f => (
                  <li key={f} className="flex items-center gap-3 text-sm font-light text-white/70">
                    <Check className="w-4 h-4 shrink-0 text-gold-400" />
                    {f}
                  </li>
                ))}
              </ul>
              <p className="mt-5 border-t border-white/10 pt-4 text-xs font-light leading-relaxed text-white/35">
                SMS follow-ups are pay-as-you-go, topped up separately — for members who don&apos;t have an email address.
              </p>
            </div>

            <div className="text-center">
              <Link href="/signup" className="inline-block rounded-full bg-gold-500 px-10 py-4 font-semibold text-navy-900 shadow-lg shadow-gold-500/20 transition hover:brightness-105">
                Start Free — 14 Days, No Card
              </Link>
              <p className="mt-3 text-xs text-white/30">Switch plans any time. Cancel any time.</p>
            </div>
          </div>
        </Reveal>
      </section>

      {/* FOOTER */}
      <footer className="bg-navy-950 px-6 py-14">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <span className="font-display text-xl leading-none">
              <span className="text-gold-500">We</span>
              <span className="text-white">Motiply</span>
            </span>
            <p className="mt-1.5 text-sm italic text-white/40">Together, we multiply.</p>
          </div>
          <Link href="/signup" className="inline-block rounded-full bg-gold-500 px-7 py-3 text-sm font-semibold text-navy-900 transition hover:brightness-105 self-start md:self-auto">
            Start Free →
          </Link>
        </div>
        <div className="mx-auto mt-10 max-w-6xl border-t border-white/10 pt-6 text-sm text-white/30">
          © {new Date().getFullYear()} WeMotiply. Every soul matters. Every Sunday counts.
        </div>
      </footer>

      <WhatsAppSupport context="signing up for WeMotiply" />
    </div>
  );
}
