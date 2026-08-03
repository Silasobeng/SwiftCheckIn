'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

const FAQS = [
  { q:'Does our church need an IT person to set this up?', a:"No. Just create an account, add your church details, and you're ready in minutes. If you can open a website, you can run WeMotiply." },
  { q:'What if the internet goes down on Sunday?', a:"No problem — it still works. Check-ins are saved on the device and automatically sync when the internet comes back." },
  { q:'Do members need to download an app?', a:"No app needed. Members simply walk up to the tablet and check in. Nothing to install, nothing to sign up for." },
  { q:'How do birthday messages work?', a:"Fully automatic. Once you add a member's date of birth, the system sends a birthday message every year on that date. You never have to remember." },
  { q:'What if someone\'s name isn\'t on the tablet?', a:"They tap 'First Time' and register in under 30 seconds. Their details are saved and they'll appear on the tablet from that point on." },
  { q:'Can I track tithes and offerings?', a:"Yes. Record giving by type — tithe, offering, seed, pledge — and a receipt can be emailed automatically. Your monthly and yearly giving totals are right there in your dashboard." },
  { q:'Can I customise the messages?', a:"Yes, completely. You write your message in plain English — no coding, no technical knowledge required." },
  { q:'How do I pay, and what does it cost?', a:"GHS 150 a month, or GHS 1,500 a year — which works out to two months free. One plan, everything included. Pay by card or Mobile Money." },
];

/** Fades a section up into place the first time it scrolls into view, then
 *  leaves it alone. Reuses the project's existing fadeInUp keyframe (already
 *  shipped for the hero) rather than introducing a second motion language —
 *  the only thing new here is *when* it fires: on scroll, not just on mount,
 *  so the page still feels alive well past the first screen. */
function Reveal({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); obs.disconnect(); }
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={ref} className={`${visible ? 'animate-fade-in-up' : ''} ${className}`} style={{ opacity: visible ? undefined : 0, animationDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

export default function LandingPage() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openFaq, setOpenFaq]       = useState<number|null>(null);
  // A viewer who has told their OS they don't want motion gets the still
  // poster instead of the loop — a stated preference, not a guess.
  const [allowMotion, setAllowMotion] = useState(true);
  // Starts false, only ever flipped true by the matchMedia check below.
  // Tailwind's `hidden md:flex` only sets display:none — it doesn't stop
  // React from mounting a <video>, and a mounted <video autoPlay> starts
  // fetching regardless of its own CSS visibility. Confirmed by watching the
  // network panel: hero-bg.mp4 was still requested on a cold load at a 375px
  // viewport with only a CSS class guarding it. The video element itself
  // must not exist in the DOM until this is genuinely true. The poster JPG
  // is a different story — at 31KB it's cheap enough to serve on every
  // viewport as the actual hero background, mobile included.
  const [showHeroVideo, setShowHeroVideo] = useState(false);

  useEffect(() => {
    fetch('/api/auth/session').then(r=>r.json()).then(d=>setIsLoggedIn(d.authenticated)).catch(()=>{});
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    setShowHeroVideo(mq.matches);
    const onChange = () => setShowHeroVideo(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setAllowMotion(!mq.matches);
    const onChange = () => setAllowMotion(!mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return (
    <div className="min-h-screen overflow-x-hidden" style={{ fontFamily:"'DM Sans', sans-serif", background:'#F8F4EE', color:'#1C2A3A' }}>

      {/* ── NAV ── */}
      <header style={{ position:'sticky', top:0, zIndex:100, background:'rgba(248,244,238,0.94)', backdropFilter:'blur(12px)', borderBottom:'1px solid rgba(180,160,120,0.15)' }}>
        <div style={{ maxWidth:1160, margin:'0 auto', padding:'0 28px', height:68, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <Link href="/" style={{ display:'flex', alignItems:'center', gap:10, textDecoration:'none' }}>
            <div style={{ width:36, height:36, background:'#16243A', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3 9.5L7 13.5L15 5" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <span style={{ fontFamily:"'Playfair Display', serif", fontSize:18, color:'#16243A' }}>WeMotiply</span>
          </Link>
          <nav style={{ alignItems:'center', gap:28 }} className="hidden md:flex">
            {[['#why','Why Us'],['#how','How It Works'],['#pricing','Pricing'],['#faq','FAQ']].map(([h,l])=>(
              <a key={h} href={h} className="lp-link" style={{ fontSize:14, color:'#7A6E60', textDecoration:'none' }}>{l}</a>
            ))}
            {isLoggedIn
              ? <Link href="/admin" className="lp-cta" style={{ background:'#C97B1A', color:'#fff', padding:'10px 22px', borderRadius:999, fontSize:14, textDecoration:'none', fontWeight:500 }}>Dashboard →</Link>
              : <><Link href="/login" className="lp-link" style={{ fontSize:14, color:'#7A6E60', textDecoration:'none', marginRight:8 }}>Sign in</Link>
                 <Link href="/signup" className="lp-cta lp-cta-navy" style={{ background:'#16243A', color:'#fff', padding:'10px 22px', borderRadius:999, fontSize:14, textDecoration:'none', fontWeight:500 }}>Start Free Trial</Link></>
            }
          </nav>
          <button onClick={()=>setMobileOpen(o=>!o)} style={{ background:'none', border:'none', cursor:'pointer', padding:8 }} className="md:hidden">
            <div style={{ width:22, display:'flex', flexDirection:'column', gap:5 }}>
              <span style={{ height:2, background:'#16243A', borderRadius:1, transition:'all .3s', transform: mobileOpen?'rotate(45deg) translateY(7px)':'none', display:'block' }}/>
              <span style={{ height:2, background:'#16243A', borderRadius:1, transition:'all .3s', opacity: mobileOpen?0:1, display:'block' }}/>
              <span style={{ height:2, background:'#16243A', borderRadius:1, transition:'all .3s', transform: mobileOpen?'rotate(-45deg) translateY(-7px)':'none', display:'block' }}/>
            </div>
          </button>
        </div>
        {mobileOpen && (
          <div style={{ borderTop:'1px solid #E4DFD5', background:'#F8F4EE', padding:'16px 28px' }}>
            {[['#why','Why Us'],['#how','How It Works'],['#pricing','Pricing'],['#faq','FAQ']].map(([h,l])=>(
              <a key={h} href={h} onClick={()=>setMobileOpen(false)} style={{ display:'block', padding:'10px 0', color:'#16243A', textDecoration:'none', fontSize:15 }}>{l}</a>
            ))}
            {isLoggedIn ? (
              <Link href="/admin" onClick={()=>setMobileOpen(false)} style={{ display:'block', marginTop:12, background:'#C97B1A', color:'#fff', padding:'12px 20px', borderRadius:999, textAlign:'center', textDecoration:'none', fontSize:14, fontWeight:500 }}>Go to Dashboard →</Link>
            ) : (
              <>
                <Link href="/signup" onClick={()=>setMobileOpen(false)} style={{ display:'block', marginTop:12, background:'#16243A', color:'#fff', padding:'12px 20px', borderRadius:999, textAlign:'center', textDecoration:'none', fontSize:14, fontWeight:500 }}>Start Free Trial</Link>
                <Link href="/login" onClick={()=>setMobileOpen(false)} style={{ display:'block', marginTop:10, padding:'10px 20px', color:'#7A6E60', textAlign:'center', textDecoration:'none', fontSize:14 }}>Sign in</Link>
              </>
            )}
          </div>
        )}
      </header>

      {/* ── HERO — full-bleed footage, text directly on top ── */}
      {/* The poster photo is the hero background on every viewport, mobile
          included — 31KB, cheap enough to just always show. The looping
          video plays on top of that same still, only once showHeroVideo (a
          real min-width check, not a CSS class) confirms this isn't a phone
          on mobile data. Because the poster is literally the video's first
          frame, there's no flash of different content when the video takes
          over — it just starts moving. */}
      <section style={{ position:'relative', minHeight:'clamp(560px,88vh,860px)', display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <div style={{ position:'absolute', inset:0 }}>
          <div style={{ position:'absolute', inset:0, backgroundImage:'url(/hero-poster.jpg)', backgroundSize:'cover', backgroundPosition:'center' }} />
          {showHeroVideo && allowMotion && (
            <video autoPlay muted loop playsInline poster="/hero-poster.jpg" aria-hidden="true"
              style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover' }}>
              <source src="/hero-bg.mp4" type="video/mp4" />
            </video>
          )}
          <div style={{ position:'absolute', inset:0, background:'linear-gradient(180deg,rgba(11,20,32,0.5) 0%,rgba(11,20,32,0.68) 55%,rgba(9,16,26,0.92) 100%)' }} />
        </div>

        <div style={{ position:'relative', zIndex:2, flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', textAlign:'center', padding:'110px 24px 70px' }}>
          <div className="animate-fade-in-up" style={{ maxWidth:760 }}>
            <div style={{ display:'inline-flex', alignItems:'center', gap:8, background:'rgba(255,255,255,0.1)', border:'1px solid rgba(255,255,255,0.18)', borderRadius:999, padding:'7px 18px', fontSize:13, color:'#F0D9B5', fontWeight:500, marginBottom:30, backdropFilter:'blur(6px)' }}>
              <span style={{ width:6, height:6, borderRadius:'50%', background:'#F0A832', display:'inline-block', animation:'pulseSoft 2s infinite' }}/>
              Now piloting with churches in Accra
            </div>
            <h1 style={{ fontFamily:"'Playfair Display', serif", fontSize:'clamp(38px,6vw,68px)', lineHeight:1.08, color:'#fff', letterSpacing:'-0.02em', marginBottom:24, textWrap:'balance' as any }}>
              Know your congregation.<br/><em style={{ fontStyle:'italic', color:'#F0A832' }}>Every Sunday.</em>
            </h1>
            <p style={{ fontSize:'clamp(16px,1.8vw,19px)', color:'rgba(255,255,255,0.72)', lineHeight:1.7, marginBottom:40, maxWidth:560, marginLeft:'auto', marginRight:'auto', fontWeight:300 }}>
              WeMotiply makes check-in effortless — so you spend less time taking attendance and more time knowing your people.
            </p>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:14, flexWrap:'wrap', marginBottom:28 }}>
              <Link href="/signup" className="lp-cta" style={{ background:'#C97B1A', color:'#fff', padding:'16px 34px', borderRadius:999, fontSize:15, fontWeight:600, textDecoration:'none', transition:'all .2s', display:'inline-flex', alignItems:'center', gap:8, boxShadow:'0 10px 30px rgba(201,123,26,0.35)' }}>
                Start free for 14 days →
              </Link>
              <a href="#how" style={{ background:'rgba(255,255,255,0.1)', border:'1px solid rgba(255,255,255,0.3)', color:'#fff', padding:'16px 30px', borderRadius:999, fontSize:15, fontWeight:500, textDecoration:'none', display:'inline-flex', alignItems:'center', gap:8, backdropFilter:'blur(6px)', transition:'all .2s' }} className="lp-cta-ghost-dark">
                See how it works
              </a>
            </div>
            <p style={{ fontSize:13, color:'rgba(255,255,255,0.5)' }}>No credit card needed · Set up in minutes · Works even where wifi doesn&apos;t</p>
          </div>
        </div>
      </section>

      {/* ── PAIN ── */}
      <section id="why" style={{ background:'#16243A', padding:`var(--section-y) 28px` }}>
        <div style={{ maxWidth:1100, margin:'0 auto' }}>
          <Reveal>
            <div style={{ fontSize:11, letterSpacing:'0.15em', textTransform:'uppercase', color:'rgba(201,123,26,0.8)', fontWeight:500, marginBottom:14 }}>The problem</div>
            <h2 style={{ fontFamily:"'Playfair Display',serif", fontSize:'clamp(28px,3.5vw,42px)', color:'#fff', lineHeight:1.2, marginBottom:16 }}>Sound familiar?</h2>
            <p style={{ fontSize:16, color:'rgba(255,255,255,0.5)', fontWeight:300, maxWidth:520, marginBottom:56 }}>Most churches are still doing attendance on paper, or with tools never designed for them.</p>
          </Reveal>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))', gap:24 }}>
            {[
              {q:'"I have no idea if we\'re growing or shrinking."', a:'Paper registers disappear. Spreadsheets never get updated. You have no real picture of your congregation.'},
              {q:'"A member hasn\'t come in weeks and nobody noticed."', a:'Without a system, people slip away quietly. By the time someone realises, it\'s too late to reach out.'},
              {q:'"Check-in on Sunday morning is chaos."', a:'Long queues, illegible handwriting, lost visitors. First impressions matter.'},
            ].map((p,i)=>(
              <Reveal key={i} delay={i*100}>
                <div style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:16, padding:28, height:'100%' }} className="card-hover">
                  <div style={{ fontFamily:"'Playfair Display',serif", fontSize:18, color:'rgba(255,255,255,0.9)', lineHeight:1.4, marginBottom:14 }}>{p.q}</div>
                  <div style={{ fontSize:14, color:'rgba(255,255,255,0.4)', lineHeight:1.7, fontWeight:300 }}>{p.a}</div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── SEE IT IN ACTION ── */}
      {/* The kiosk mockup used to live inside the hero. It reads better here,
          right after the problem is named — this is the moment the page
          answers "okay, so what does this actually look like." */}
      <section style={{ background:'#EDE7DC', padding:`var(--section-y) 28px` }}>
        <div style={{ maxWidth:900, margin:'0 auto', textAlign:'center' }}>
          <Reveal>
            <div style={{ fontSize:11, letterSpacing:'0.15em', textTransform:'uppercase', color:'#C97B1A', fontWeight:500, marginBottom:14 }}>See it in action</div>
            <h2 style={{ fontFamily:"'Playfair Display',serif", fontSize:'clamp(26px,3.2vw,40px)', color:'#16243A', lineHeight:1.2, marginBottom:48 }}>This is what your entrance looks like now.</h2>
          </Reveal>
          <Reveal delay={120}>
            <div style={{ background:'#16243A', borderRadius:24, padding:'40px 36px', width:'min(340px,100%)', margin:'0 auto', boxShadow:'0 40px 80px rgba(22,36,58,0.28)', border:'1px solid rgba(255,255,255,0.08)' }} className="card-hover">
              <div style={{ width:52,height:52,background:'#C97B1A',borderRadius:16,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 18px' }}>
                <svg width="26" height="26" viewBox="0 0 26 26" fill="none"><path d="M5 13.5L10.5 19L21 8" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <div style={{ fontFamily:"'Playfair Display',serif", fontSize:22, color:'#fff', textAlign:'center', marginBottom:6 }}>Grace Chapel</div>
              <div style={{ fontSize:13, color:'rgba(255,255,255,0.45)', textAlign:'center', marginBottom:24 }}>We&apos;re so glad you&apos;re here</div>
              {[{bg:'#2E7D4E',label:'I\'ve been here before',sub:'Search your name — 5 seconds'},{bg:'#C97B1A',label:'This is my first time',sub:'Quick 30-second welcome form'}].map((o,i)=>(
                <div key={i} style={{ background:o.bg, borderRadius:12, padding:'16px 18px', marginBottom:i===0?10:0, display:'flex', alignItems:'center', gap:12 }}>
                  <div style={{ width:36,height:36,background:'rgba(255,255,255,0.15)',borderRadius:10,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">{i===0?<><circle cx="8" cy="6" r="3" stroke="white" strokeWidth="1.3"/><path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="white" strokeWidth="1.3"/></>:<path d="M8 3v10M3 8h10" stroke="white" strokeWidth="1.6" strokeLinecap="round"/>}</svg>
                  </div>
                  <div>
                    <div style={{ fontSize:13, fontWeight:500, color:'#fff', textTransform:'uppercase', letterSpacing:'0.04em' }}>{o.label}</div>
                    <div style={{ fontSize:12, color:'rgba(255,255,255,0.55)', marginTop:2 }}>{o.sub}</div>
                  </div>
                </div>
              ))}
              <div style={{ textAlign:'center', fontSize:12, color:'rgba(255,255,255,0.25)', marginTop:18 }}>Sunday Morning Service · Today</div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section style={{ background:'#F8F4EE', padding:`var(--section-y) 28px` }}>
        <div style={{ maxWidth:1100, margin:'0 auto' }}>
          <Reveal>
            <div style={{ fontSize:11, letterSpacing:'0.15em', textTransform:'uppercase', color:'#C97B1A', fontWeight:500, marginBottom:14 }}>What you get</div>
            <h2 style={{ fontFamily:"'Playfair Display',serif", fontSize:'clamp(28px,3.5vw,42px)', color:'#16243A', lineHeight:1.2, marginBottom:60 }}>Everything your church needs.<br/><em style={{ fontStyle:'italic', color:'#C97B1A' }}>Nothing it doesn&apos;t.</em></h2>
          </Reveal>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))', gap:24 }}>
            {[
              {icon:'✅',bg:'#EDF6F1',title:'Instant check-in kiosk',desc:'A beautiful screen at your entrance. Members find their name in seconds. First-timers fill a quick form. No training needed.'},
              {icon:'📧',bg:'#FDF3E0',title:'Automatic caring emails',desc:'Welcome emails, birthday greetings, and "we miss you" messages — sent automatically with each person\'s name. Set once, runs forever.'},
              {icon:'💰',bg:'#EEF2F8',title:'Giving, tracked properly',desc:'Record tithes, offerings, seed and pledges by type. Automatic receipts. Your monthly and yearly totals, always up to date.'},
              {icon:'📊',bg:'#FDF3E0',title:'Real attendance analytics',desc:'Month-over-month and year-over-year comparisons, not just a headline number. See growth, decline and everything in between at a glance.'},
              {icon:'🧾',bg:'#EDF6F1',title:'Downloadable service reports',desc:'A proper spreadsheet after every service — who attended, who was absent, giving by type — ready to open in Excel.'},
              {icon:'⚡',bg:'#EEF2F8',title:'Works even offline',desc:'Poor wifi at your venue? Check-in keeps working on the device and syncs the moment connection returns.'},
            ].map((f,i)=>(
              <Reveal key={i} delay={(i%3)*100}>
                <div style={{ background:'#fff', border:'1px solid #E4DFD5', borderRadius:18, padding:'32px 28px', transition:'all .2s', height:'100%' }} className="card-hover">
                  <div style={{ width:48,height:48,borderRadius:14,background:f.bg,display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,marginBottom:20 }}>{f.icon}</div>
                  <div style={{ fontFamily:"'Playfair Display',serif", fontSize:18, color:'#16243A', marginBottom:10 }}>{f.title}</div>
                  <div style={{ fontSize:14, color:'#7A6E60', lineHeight:1.75, fontWeight:300 }}>{f.desc}</div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how" style={{ background:'#EDE7DC', padding:`var(--section-y) 28px` }}>
        <div style={{ maxWidth:1100, margin:'0 auto' }}>
          <Reveal>
            <div style={{ fontSize:11, letterSpacing:'0.15em', textTransform:'uppercase', color:'#C97B1A', fontWeight:500, marginBottom:14 }}>How it works</div>
            <h2 style={{ fontFamily:"'Playfair Display',serif", fontSize:'clamp(28px,3.5vw,42px)', color:'#16243A', lineHeight:1.2, marginBottom:64 }}>Up and running<br/><em style={{ fontStyle:'italic', color:'#C97B1A' }}>in minutes.</em></h2>
          </Reveal>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:32 }}>
            {[
              {n:'1',title:'Sign up',desc:'Create your account and enter your church name. Takes two minutes.'},
              {n:'2',title:'Open the kiosk',desc:'Open the kiosk screen on any tablet or phone at your entrance.'},
              {n:'3',title:'People check in',desc:'Members tap their name. New visitors fill a 30-second form.'},
              {n:'4',title:'We handle the rest',desc:'Emails go out automatically. Your dashboard updates in real time.'},
            ].map((s,i)=>(
              <Reveal key={i} delay={i*100}>
                <div style={{ textAlign:'center' }}>
                  <div style={{ width:56,height:56,borderRadius:'50%',background:'#fff',border:'2px solid #E4DFD5',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 20px',fontFamily:"'Playfair Display',serif",fontSize:20,color:'#C97B1A' }}>{s.n}</div>
                  <div style={{ fontFamily:"'Playfair Display',serif", fontSize:16, color:'#16243A', marginBottom:10 }}>{s.title}</div>
                  <div style={{ fontSize:13, color:'#7A6E60', lineHeight:1.7, fontWeight:300 }}>{s.desc}</div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── BUILT WITH REAL CHURCHES ── */}
      {/* This replaces a testimonials section that quoted three invented
          pastors at three invented churches. Two real pilot churches exist
          right now, with no collected quotes yet — inventing ones to fill
          this space would be a lie with a named victim's job title attached
          to it. This says what's actually true instead: real churches shaped
          what got built, in the order they actually asked for it. Swap this
          for real testimonials the moment pilot feedback is in. */}
      <section style={{ background:'#fff', padding:`var(--section-y) 28px` }}>
        <div style={{ maxWidth:900, margin:'0 auto', textAlign:'center' }}>
          <Reveal>
            <div style={{ fontSize:11, letterSpacing:'0.15em', textTransform:'uppercase', color:'#C97B1A', fontWeight:500, marginBottom:14 }}>How this gets built</div>
            <h2 style={{ fontFamily:"'Playfair Display',serif", fontSize:'clamp(26px,3.2vw,38px)', color:'#16243A', lineHeight:1.25, marginBottom:20 }}>
              Built with real churches, not for a demo.
            </h2>
            <p style={{ fontSize:16, color:'#7A6E60', fontWeight:300, lineHeight:1.85, maxWidth:640, margin:'0 auto' }}>
              Every feature here — offline check-in, giving by type, automatic follow-up for members who&apos;ve gone quiet — came from a real church asking for it. WeMotiply is currently piloting with churches in Accra, and what they ask for next is what gets built next.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" style={{ background:'#F8F4EE', padding:`var(--section-y) 28px` }}>
        <div style={{ maxWidth:820, margin:'0 auto' }}>
          <Reveal>
            <div style={{ fontSize:11, letterSpacing:'0.15em', textTransform:'uppercase', color:'#C97B1A', fontWeight:500, marginBottom:14 }}>Pricing</div>
            <h2 style={{ fontFamily:"'Playfair Display',serif", fontSize:'clamp(28px,3.5vw,42px)', color:'#16243A', marginBottom:8 }}>One price. Everything included.</h2>
            <p style={{ fontSize:16, color:'#7A6E60', fontWeight:300, marginBottom:48 }}>No tiers, no per-member charges, no feature walls. Every church gets the whole platform.</p>
          </Reveal>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))', gap:20, marginBottom:40 }}>
            <Reveal>
              <div style={{ background:'#fff', border:'1px solid #E4DFD5', borderRadius:20, padding:'32px 30px', height:'100%' }} className="card-hover">
                <div style={{ fontSize:12, letterSpacing:'0.08em', textTransform:'uppercase', color:'#A89D8E', fontWeight:600, marginBottom:14 }}>Monthly</div>
                <div style={{ fontFamily:"'Playfair Display',serif", fontSize:42, color:'#16243A', lineHeight:1, marginBottom:6 }}>GHS 150<span style={{ fontSize:16, color:'#7A6E60', fontWeight:400 }}> / month</span></div>
                <div style={{ fontSize:13, color:'#7A6E60', marginBottom:28 }}>Billed monthly. Cancel any time.</div>
                <Link href="/signup" style={{ display:'block', textAlign:'center', padding:'14px', borderRadius:999, fontSize:14, fontWeight:500, textDecoration:'none', color:'#16243A', border:'1px solid #E4DFD5' }} className="lp-cta-ghost">
                  Start free trial
                </Link>
              </div>
            </Reveal>
            <Reveal delay={100}>
              <div style={{ position:'relative', background:'linear-gradient(180deg,#FDF3E0,#fff 65%)', border:'1px solid rgba(201,123,26,0.4)', borderRadius:20, padding:'32px 30px', boxShadow:'0 24px 60px rgba(201,123,26,0.12)', height:'100%' }} className="card-hover">
                <div style={{ position:'absolute', top:0, left:'50%', transform:'translate(-50%,-50%)', background:'#C97B1A', color:'#fff', fontSize:11, letterSpacing:'0.1em', textTransform:'uppercase', fontWeight:500, padding:'6px 16px', borderRadius:999, whiteSpace:'nowrap' }}>Save GHS 300</div>
                <div style={{ fontSize:12, letterSpacing:'0.08em', textTransform:'uppercase', color:'#7A4A0E', fontWeight:600, marginBottom:14 }}>Annual</div>
                <div style={{ fontFamily:"'Playfair Display',serif", fontSize:42, color:'#16243A', lineHeight:1, marginBottom:6 }}>GHS 1,500<span style={{ fontSize:16, color:'#7A6E60', fontWeight:400 }}> / year</span></div>
                <div style={{ fontSize:13, color:'#7A6E60', marginBottom:28 }}>About two months free versus paying monthly.</div>
                <Link href="/signup" className="lp-cta" style={{ display:'block', textAlign:'center', padding:'14px', borderRadius:999, fontSize:14, fontWeight:500, textDecoration:'none', background:'#C97B1A', color:'#fff' }}>
                  Start free trial
                </Link>
              </div>
            </Reveal>
          </div>

          <Reveal delay={200}>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:14 }}>
              {['Unlimited check-ins & people','Kiosk works offline','Giving tracking & receipts','Automatic emails','Analytics & reports','Multi-branch friendly'].map((f,i)=>(
                <div key={i} style={{ display:'flex', gap:9, fontSize:14, color:'#7A6E60', fontWeight:300 }}>
                  <span style={{ color:'#2E7D4E', flexShrink:0 }}>✓</span>{f}
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" style={{ background:'#EDE7DC', padding:`var(--section-y) 28px` }}>
        <div style={{ maxWidth:720, margin:'0 auto' }}>
          <Reveal>
            <h2 style={{ fontFamily:"'Playfair Display',serif", fontSize:'clamp(28px,3.5vw,42px)', color:'#16243A', marginBottom:48, textAlign:'center' }}>Common questions.</h2>
          </Reveal>
          {FAQS.map((f,i)=>(
            <div key={i} style={{ borderBottom:'1px solid #E4DFD5' }}>
              <button onClick={()=>setOpenFaq(openFaq===i?null:i)} className="lp-faq" aria-expanded={openFaq===i} style={{ width:'100%', display:'flex', justifyContent:'space-between', alignItems:'center', padding:'20px 0', background:'none', border:'none', cursor:'pointer', textAlign:'left' }}>
                <span style={{ fontSize:16, color:'#16243A', fontFamily:"'Playfair Display',serif" }}>{f.q}</span>
                <span style={{ fontSize:20, color:'#C97B1A', marginLeft:16, flexShrink:0, transform: openFaq===i?'rotate(45deg)':'none', transition:'transform .2s' }}>+</span>
              </button>
              {openFaq===i && <div className="animate-fade-in" style={{ paddingBottom:20, fontSize:14, color:'#7A6E60', lineHeight:1.75, fontWeight:300, maxWidth:620 }}>{f.a}</div>}
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{ background:'#16243A', padding:`calc(var(--section-y) * 1.2) 28px`, textAlign:'center' }}>
        <Reveal>
          <h2 style={{ fontFamily:"'Playfair Display',serif", fontSize:'clamp(28px,3.5vw,44px)', color:'#fff', maxWidth:600, margin:'0 auto 16px', lineHeight:1.2 }}>Your congregation deserves<br/><em style={{ fontStyle:'italic', color:'#F0A832' }}>to feel seen.</em></h2>
          <p style={{ fontSize:16, color:'rgba(255,255,255,0.5)', maxWidth:420, margin:'0 auto 40px', lineHeight:1.75, fontWeight:300 }}>Start your 14-day free trial today. No credit card needed. Setup in minutes.</p>
          <Link href="/signup" className="lp-cta" style={{ display:'inline-block', background:'#C97B1A', color:'#fff', padding:'17px 38px', borderRadius:999, fontSize:16, fontWeight:600, textDecoration:'none', transition:'all .2s', boxShadow:'0 10px 30px rgba(201,123,26,0.3)' }}>
            Start your free trial →
          </Link>
          <div style={{ fontSize:13, color:'rgba(255,255,255,0.3)', marginTop:20 }}>No credit card · Cancel any time · Setup in 5 minutes</div>
        </Reveal>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ background:'#0F1A2C', padding:'48px 28px', display:'flex', flexWrap:'wrap', alignItems:'center', justifyContent:'space-between', gap:20 }}>
        <div>
          <div style={{ fontFamily:"'Playfair Display',serif", fontSize:18, color:'rgba(255,255,255,0.5)' }}>WeMotiply</div>
          <div style={{ fontSize:12, color:'rgba(255,255,255,0.3)', marginTop:2, fontStyle:'italic' }}>Together, we multiply.</div>
        </div>
        <div style={{ display:'flex', gap:24, flexWrap:'wrap' }}>
          {['Privacy','Terms','Contact'].map(l=><a key={l} href="#" className="lp-link" style={{ fontSize:13, color:'rgba(255,255,255,0.3)', textDecoration:'none', transition:'color .2s' }}>{l}</a>)}
        </div>
        <span style={{ fontSize:12, color:'rgba(255,255,255,0.2)' }}>© {new Date().getFullYear()} WeMotiply</span>
      </footer>
    </div>
  );
}
