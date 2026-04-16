'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type Screen = 'login' | 'forgot' | 'forgot-sent';

const QUOTES = [
  { text:'"Every person who walks through your door deserves to feel known."', attr:'The heart behind SwiftEntryPro' },
  { text:'"We used to lose visitor details every Sunday. Now every first-timer gets a welcome email automatically."', attr:'Senior Pastor, Tema' },
  { text:'"Setup was genuinely 5 minutes. Even our oldest usher figured it out immediately."', attr:'Admin Secretary, Kumasi' },
];

export default function LoginPage() {
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ email:'', password:'' });
  const [resetEmail, setResetEmail] = useState('');
  const [quoteIdx, setQuoteIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setQuoteIdx(i=>(i+1)%QUOTES.length), 5000);
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

  const q = QUOTES[quoteIdx];

  return (
    <div style={{ minHeight:'100vh', display:'grid', gridTemplateColumns:'1fr 1fr', fontFamily:"'DM Sans',sans-serif" }} className="!grid-cols-1 md:!grid-cols-2">

      {/* LEFT */}
      <div style={{ background:'#16243A', padding:'56px 52px', display:'flex', flexDirection:'column', justifyContent:'space-between', minHeight:'100vh' }} className="hidden md:flex">
        <Link href="/" style={{ display:'flex', alignItems:'center', gap:10, textDecoration:'none' }}>
          <div style={{ width:36,height:36,background:'#C97B1A',borderRadius:10,display:'flex',alignItems:'center',justifyContent:'center' }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3 9.5L7 13.5L15 5" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <span style={{ fontFamily:"'Playfair Display',serif", fontSize:18, color:'#fff' }}>SwiftEntryPro</span>
        </Link>

        <div>
          <div style={{ fontFamily:"'Playfair Display',serif", fontSize:28, color:'#fff', lineHeight:1.45, fontStyle:'italic', marginBottom:16, transition:'all .4s' }}>
            {q.text}
          </div>
          <div style={{ fontSize:14, color:'rgba(255,255,255,0.35)', fontWeight:300 }}>{q.attr}</div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:1, background:'rgba(255,255,255,0.08)', borderRadius:12, overflow:'hidden' }}>
          {[{v:'5 min',l:'Setup time'},{v:'100%',l:'Works offline'},{v:'Auto',l:'Birthday emails'}].map((s,i)=>(
            <div key={i} style={{ background:'rgba(255,255,255,0.04)', padding:20, textAlign:'center' }}>
              <div style={{ fontFamily:"'Playfair Display',serif", fontSize:22, color:'#F0A832', marginBottom:4 }}>{s.v}</div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.35)', fontWeight:300 }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT */}
      <div style={{ background:'#F8F4EE', padding:'56px 64px', display:'flex', flexDirection:'column', justifyContent:'center', minHeight:'100vh' }}>
        <div style={{ maxWidth:400, width:'100%', margin:'0 auto' }}>

          {/* Mobile logo */}
          <Link href="/" style={{ display:'flex', alignItems:'center', gap:10, textDecoration:'none', marginBottom:40 }} className="md:hidden">
            <div style={{ width:32,height:32,background:'#16243A',borderRadius:9,display:'flex',alignItems:'center',justifyContent:'center' }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8.5L6.5 12L13 5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <span style={{ fontFamily:"'Playfair Display',serif", fontSize:16, color:'#16243A' }}>SwiftEntryPro</span>
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
              <button type="submit" disabled={loading} style={{ width:'100%', marginTop:24, background:'#C97B1A', color:'#fff', border:'none', borderRadius:11, padding:'15px', fontFamily:"'DM Sans',sans-serif", fontSize:15, fontWeight:500, cursor:loading?'wait':'pointer', transition:'all .2s', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
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
              <button type="submit" disabled={loading} style={{ width:'100%', background:'#16243A', color:'#fff', border:'none', borderRadius:11, padding:'15px', fontFamily:"'DM Sans',sans-serif", fontSize:15, fontWeight:500, cursor:loading?'wait':'pointer' }}>
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
          </>}

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
