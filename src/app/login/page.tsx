'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import WhatsAppSupport from '@/components/WhatsAppSupport';

type Screen = 'login' | 'forgot' | 'forgot-sent';

// Scripture on growth and multiplication, rather than the product talking
// about itself. The person signing in here is a pastor or church secretary on
// a Sunday morning — the previous marketing lines ("Built with real churches,
// not for a demo") were addressed to a buyer, not to them, and read as filler
// once you'd seen them twice.
//
// Quoted from the King James Version, which is public domain. Modern
// translations (NIV, ESV, NLT) are under copyright and cannot be shipped in
// an app, however short the excerpt.
const VERSES = [
  { text:'And the Lord added to the church daily such as should be saved.', ref:'Acts 2:47' },
  { text:'I have planted, Apollos watered; but God gave the increase.',      ref:'1 Corinthians 3:6' },
  { text:'And the word of God increased; and the number of the disciples multiplied greatly.', ref:'Acts 6:7' },
  { text:'And so were the churches established in the faith, and increased in number daily.',  ref:'Acts 16:5' },
  { text:'The righteous shall flourish like the palm tree.',                 ref:'Psalm 92:12' },
  { text:'Be fruitful, and multiply, and replenish the earth.',              ref:'Genesis 1:28' },
];

// Congregation photography behind the verse. Files are optional by design: a
// missing image simply doesn't paint, leaving the navy panel exactly as it is
// today, so this can ship before the photos are finalised and nothing breaks.
const BACKDROPS = [
  '/congregation-1.jpg',
  '/congregation-2.jpg',
  '/congregation-3.jpg',
];

export default function LoginPage() {
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ email:'', password:'' });
  const [resetEmail, setResetEmail] = useState('');
  const [verseIdx, setVerseIdx] = useState(0);

  // 7s rather than 5s: a verse takes longer to actually read than a
  // three-word slogan did, and the crossfade needs room to breathe.
  useEffect(() => {
    const id = setInterval(() => setVerseIdx(i=>(i+1)%VERSES.length), 7000);
    return () => clearInterval(id);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const res = await fetch('/api/auth/login', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(form) });
      const data = await res.json();
      if (!res.ok) { setError(data.error||'Login failed'); return; }
      router.push('/admin');
    } catch { setError('Something went wrong'); }
    finally { setLoading(false); }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ email:resetEmail }) });
      const data = await res.json();
      if (!res.ok) { setError(data.error||'Failed to send reset email'); return; }
      setScreen('forgot-sent');
    } catch { setError('Something went wrong'); }
    finally { setLoading(false); }
  };

  const verse = VERSES[verseIdx];
  // Photos rotate slower than the verses so the two never change in lockstep,
  // which would read as one abrupt "slide" transition rather than a calm
  // backdrop with words over it.
  const backdropIdx = Math.floor(verseIdx / 2) % BACKDROPS.length;

  return (
    <div style={{ minHeight:'100vh', display:'grid', gridTemplateColumns:'1fr 1fr', fontFamily:"'DM Sans',sans-serif" }} className="!grid-cols-1 md:!grid-cols-2">

      {/* LEFT */}
      <div style={{ background:'#16243A', padding:'56px 52px', flexDirection:'column', justifyContent:'space-between', minHeight:'100vh', position:'relative', overflow:'hidden' }} className="hidden md:flex">

        {/* Backdrop layers. Every image is mounted and only opacity changes,
            so the crossfade is a real dissolve rather than one image being
            swapped out from under the other. */}
        {BACKDROPS.map((src, i) => (
          <div
            key={src}
            aria-hidden
            className="login-backdrop"
            style={{
              position:'absolute', inset:0,
              backgroundImage:`url(${src})`, backgroundSize:'cover', backgroundPosition:'center',
              opacity: i === backdropIdx ? 1 : 0,
              transition:'opacity 1.6s ease-in-out',
            }}
          />
        ))}
        {/* Scrim. The verse sits on top of photography that could be bright
            anywhere, so legibility can't depend on the picture behaving —
            this guarantees contrast regardless of which image is showing. */}
        <div aria-hidden style={{
          position:'absolute', inset:0,
          background:'linear-gradient(180deg, rgba(22,36,58,0.92) 0%, rgba(22,36,58,0.74) 45%, rgba(22,36,58,0.94) 100%)',
        }} />

        <Link href="/" style={{ display:'flex', alignItems:'center', textDecoration:'none', position:'relative', zIndex:1 }}>
          <img src="/wemotiply-logo.jpg" alt="WeMotiply" style={{ height:52, width:'auto', borderRadius:8 }} />
        </Link>

        {/* keyed so each rotation actually crossfades rather than snapping */}
        <div key={verseIdx} className="animate-fade-in" style={{ position:'relative', zIndex:1 }}>
          <div style={{ fontFamily:"'Playfair Display',serif", fontSize:28, color:'#fff', lineHeight:1.5, fontStyle:'italic', marginBottom:18, textShadow:'0 1px 12px rgba(0,0,0,0.35)' }}>
            &ldquo;{verse.text}&rdquo;
          </div>
          <div style={{ fontSize:13, color:'#F0A832', fontWeight:500, letterSpacing:'0.08em', textTransform:'uppercase' }}>{verse.ref}</div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:1, background:'rgba(255,255,255,0.14)', borderRadius:12, overflow:'hidden', position:'relative', zIndex:1, backdropFilter:'blur(2px)' }}>
          {[{v:'5 min',l:'Setup time'},{v:'100%',l:'Works offline'},{v:'Smart',l:'Attendance'}].map((s,i)=>(
            <div key={i} style={{ background:'rgba(22,36,58,0.55)', padding:20, textAlign:'center' }}>
              <div style={{ fontFamily:"'Playfair Display',serif", fontSize:22, color:'#F0A832', marginBottom:4 }}>{s.v}</div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.35)', fontWeight:300 }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT */}
      <div className="px-6 py-12 sm:px-10 md:px-16 md:py-14" style={{ background:'#F8F4EE', display:'flex', flexDirection:'column', justifyContent:'center', minHeight:'100vh' }}>
        <div style={{ maxWidth:400, width:'100%', margin:'0 auto' }}>

          {/* Mobile logo */}
          <Link href="/" style={{ alignItems:'center', gap:10, textDecoration:'none', marginBottom:40 }} className="flex md:hidden">
            <div style={{ width:32,height:32,background:'#16243A',borderRadius:9,display:'flex',alignItems:'center',justifyContent:'center' }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8.5L6.5 12L13 5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <span style={{ fontFamily:"'Playfair Display',serif", fontSize:16, color:'#16243A' }}>WeMotiply</span>
          </Link>

          {screen === 'login' && <>
            <div style={{ fontSize:11, letterSpacing:'0.15em', textTransform:'uppercase', color:'#C97B1A', fontWeight:500, marginBottom:14 }}>Welcome back</div>
            <h1 style={{ fontFamily:"'Playfair Display',serif", fontSize:34, color:'#16243A', lineHeight:1.2, marginBottom:8 }}>Sign in to your<br/>dashboard</h1>
            <p style={{ fontSize:14, color:'#7A6E60', marginBottom:36, fontWeight:300 }}>Good to see you again. Your congregation is waiting.</p>

            <form onSubmit={handleLogin}>
              {error && <div className="alert alert-error" style={{ marginBottom:20 }}>{error}</div>}
              <div style={{ marginBottom:18 }}>
                <label style={{ fontSize:12, fontWeight:500, color:'#7A6E60', letterSpacing:'0.06em', textTransform:'uppercase', display:'block', marginBottom:8 }}>Email address</label>
                <input className="input" type="email" placeholder="you@church.org" value={form.email} onChange={e=>setForm(p=>({...p,email:e.target.value}))} required autoFocus/>
              </div>
              <div style={{ marginBottom:8 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                  <label style={{ fontSize:12, fontWeight:500, color:'#7A6E60', letterSpacing:'0.06em', textTransform:'uppercase' }}>Password</label>
                  <button type="button" onClick={()=>setScreen('forgot')} style={{ fontSize:13, color:'#C97B1A', background:'none', border:'none', cursor:'pointer' }}>Forgot password?</button>
                </div>
                <input className="input" type="password" placeholder="••••••••••" value={form.password} onChange={e=>setForm(p=>({...p,password:e.target.value}))} required/>
              </div>
              <button type="submit" disabled={loading} className="lp-cta" style={{ width:'100%', marginTop:24, background:'#C97B1A', color:'#fff', border:'none', borderRadius:11, padding:'15px', fontFamily:"'DM Sans',sans-serif", fontSize:15, fontWeight:500, cursor:loading?'wait':'pointer', transition:'all .2s', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                {loading ? 'Signing in…' : <>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8.5L6.5 12L13 5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Sign In
                </>}
              </button>
            </form>
            <div style={{ fontSize:14, color:'#7A6E60', textAlign:'center', marginTop:24 }}>
              No account? <Link href="/signup" style={{ color:'#C97B1A', textDecoration:'none', fontWeight:500 }}>Start your 14-day free trial →</Link>
            </div>
          </>}

          {screen === 'forgot' && <>
            <button onClick={()=>setScreen('login')} style={{ display:'flex', alignItems:'center', gap:6, background:'none', border:'none', cursor:'pointer', color:'#7A6E60', fontSize:14, marginBottom:32, padding:0 }}>
              ← Back to sign in
            </button>
            <h1 style={{ fontFamily:"'Playfair Display',serif", fontSize:30, color:'#16243A', marginBottom:8 }}>Reset your password</h1>
            <p style={{ fontSize:14, color:'#7A6E60', marginBottom:36, fontWeight:300 }}>Enter your email and we&apos;ll send you a reset link.</p>
            <form onSubmit={handleForgot}>
              {error && <div className="alert alert-error" style={{ marginBottom:20 }}>{error}</div>}
              <div style={{ marginBottom:20 }}>
                <label style={{ fontSize:12, fontWeight:500, color:'#7A6E60', letterSpacing:'0.06em', textTransform:'uppercase', display:'block', marginBottom:8 }}>Email address</label>
                <input className="input" type="email" placeholder="you@church.org" value={resetEmail} onChange={e=>setResetEmail(e.target.value)} required/>
              </div>
              <button type="submit" disabled={loading} className="lp-cta lp-cta-navy" style={{ width:'100%', background:'#16243A', color:'#fff', border:'none', borderRadius:11, padding:'15px', fontFamily:"'DM Sans',sans-serif", fontSize:15, fontWeight:500, cursor:loading?'wait':'pointer' }}>
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
          </>}

          {/* Someone who can't get in can't reach anything else in the app,
              so this is the one screen where support has to be reachable. */}
          <WhatsAppSupport context="signing in to my WeMotiply account" />

          {screen === 'forgot-sent' && <>
            <div style={{ textAlign:'center', paddingTop:40 }}>
              <div style={{ width:64,height:64,background:'#EDF6F1',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 20px' }}>
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><path d="M5 14L11 20L23 8" stroke="#2E7D4E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <h2 style={{ fontFamily:"'Playfair Display',serif", fontSize:24, color:'#16243A', marginBottom:12 }}>Check your email</h2>
              <p style={{ fontSize:14, color:'#7A6E60', lineHeight:1.7, marginBottom:28, fontWeight:300 }}>We&apos;ve sent a password reset link to <strong style={{ color:'#16243A' }}>{resetEmail}</strong>. Check your inbox and follow the instructions.</p>
              <button onClick={()=>setScreen('login')} style={{ background:'#16243A', color:'#fff', border:'none', borderRadius:11, padding:'12px 28px', fontFamily:"'DM Sans',sans-serif", fontSize:14, fontWeight:500, cursor:'pointer' }}>Back to sign in</button>
            </div>
          </>}
        </div>
      </div>
    </div>
  );
}
