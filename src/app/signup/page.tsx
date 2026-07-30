'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function SignupPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ churchName:'', adminName:'', email:'', phone:'', password:'', confirmPassword:'' });
  const set = (k:string) => (e:React.ChangeEvent<HTMLInputElement>) => setForm(p=>({...p,[k]:e.target.value}));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    if (form.password !== form.confirmPassword) { setError('Passwords do not match'); return; }
    if (form.password.length < 8) { setError('Password must be at least 8 characters'); return; }
    setLoading(true);
    try {
      // Take the timezone from the browser rather than asking for it. A church
      // that never opens Settings would otherwise sit on UTC forever, and every
      // "today" and "this month" in their reports would quietly be someone
      // else's day. They can still change it in Settings.
      let timezone = '';
      try { timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { /* keep empty; server falls back to UTC */ }

      const res = await fetch('/api/auth/signup', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ ...form, timezone }) });
      const data = await res.json();
      if (!res.ok) { setError(data.error||'Signup failed'); return; }
      router.push('/admin');
    } catch { setError('Something went wrong'); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight:'100vh', display:'grid', gridTemplateColumns:'1fr 1fr', fontFamily:"'DM Sans',sans-serif" }} className="!grid-cols-1 md:!grid-cols-2">

      {/* LEFT */}
      <div style={{ background:'#16243A', padding:'52px', flexDirection:'column', justifyContent:'space-between', minHeight:'100vh' }} className="hidden md:flex">
        <Link href="/" style={{ display:'flex', alignItems:'center', gap:10, textDecoration:'none' }}>
          <div style={{ width:36,height:36,background:'#C97B1A',borderRadius:10,display:'flex',alignItems:'center',justifyContent:'center' }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3 9.5L7 13.5L15 5" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <span style={{ fontFamily:"'Playfair Display',serif", fontSize:18, color:'#fff' }}>SwiftEntryPro</span>
        </Link>

        <div>
          <h2 style={{ fontFamily:"'Playfair Display',serif", fontSize:30, color:'#fff', lineHeight:1.35, marginBottom:40 }}>
            Your church.<br/><em style={{ fontStyle:'italic', color:'#F0A832' }}>Organised, cared for,<br/>and growing.</em>
          </h2>
          {[
            {icon:'✅',bg:'rgba(46,125,78,0.2)',title:'Check-in kiosk ready in minutes',desc:'Works on any tablet. No training needed for your ushers.'},
            {icon:'📧',bg:'rgba(201,123,26,0.2)',title:'Emails that send themselves',desc:'Welcome, birthday, and "we miss you" — all automatic.'},
            {icon:'📊',bg:'rgba(255,255,255,0.08)',title:'See your congregation clearly',desc:"Know who's growing, who's new, who needs a call."},
          ].map((f,i)=>(
            <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:14, marginBottom:22 }}>
              <div style={{ width:36,height:36,borderRadius:10,background:f.bg,display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,flexShrink:0,marginTop:2 }}>{f.icon}</div>
              <div>
                <div style={{ fontSize:15, color:'#fff', marginBottom:3, fontWeight:500 }}>{f.title}</div>
                <div style={{ fontSize:13, color:'rgba(255,255,255,0.4)', fontWeight:300, lineHeight:1.6 }}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ background:'rgba(255,255,255,0.05)', borderRadius:12, padding:'18px 20px', fontSize:13, color:'rgba(255,255,255,0.4)', fontWeight:300 }}>
          <strong style={{ color:'#F0A832' }}>120+ churches</strong> across Africa use SwiftEntryPro every Sunday. 14-day free trial. No credit card needed.
        </div>
      </div>

      {/* RIGHT */}
      <div className="px-6 py-12 sm:px-10 md:px-14" style={{ background:'#F8F4EE', display:'flex', flexDirection:'column', justifyContent:'center', overflowY:'auto' }}>
        <div style={{ maxWidth:420, width:'100%', margin:'0 auto' }}>

          <Link href="/" style={{ alignItems:'center', gap:10, textDecoration:'none', marginBottom:36 }} className="flex md:hidden">
            <div style={{ width:32,height:32,background:'#16243A',borderRadius:9,display:'flex',alignItems:'center',justifyContent:'center' }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8.5L6.5 12L13 5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <span style={{ fontFamily:"'Playfair Display',serif", fontSize:16, color:'#16243A' }}>SwiftEntryPro</span>
          </Link>

          <h2 style={{ fontFamily:"'Playfair Display',serif", fontSize:28, color:'#16243A', marginBottom:6 }}>Start your free trial</h2>
          <p style={{ fontSize:14, color:'#7A6E60', marginBottom:32, fontWeight:300 }}>No credit card needed. Up and running in 5 minutes.</p>

          <form onSubmit={handleSubmit}>
            {error && <div className="alert alert-error" style={{ marginBottom:20 }}>{error}</div>}

            <div style={{ marginBottom:18 }}>
              <label style={{ fontSize:12, fontWeight:500, color:'#7A6E60', letterSpacing:'0.06em', textTransform:'uppercase', display:'block', marginBottom:8 }}>Your Church Name</label>
              <input className="input" type="text" placeholder="e.g. Grace Community Church" value={form.churchName} onChange={set('churchName')} required/>
            </div>
            <div style={{ marginBottom:18 }}>
              <label style={{ fontSize:12, fontWeight:500, color:'#7A6E60', letterSpacing:'0.06em', textTransform:'uppercase', display:'block', marginBottom:8 }}>Your Name</label>
              <input className="input" type="text" placeholder="e.g. Pastor John" value={form.adminName} onChange={set('adminName')} required/>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap:14, marginBottom:18 }}>
              <div>
                <label style={{ fontSize:12, fontWeight:500, color:'#7A6E60', letterSpacing:'0.06em', textTransform:'uppercase', display:'block', marginBottom:8 }}>Email</label>
                <input className="input" type="email" placeholder="you@church.org" value={form.email} onChange={set('email')} required/>
              </div>
              <div>
                <label style={{ fontSize:12, fontWeight:500, color:'#7A6E60', letterSpacing:'0.06em', textTransform:'uppercase', display:'block', marginBottom:8 }}>Phone <span style={{ textTransform:'none', letterSpacing:0, fontWeight:300, color:'#A89D8E' }}>(optional)</span></label>
                <input className="input" type="tel" placeholder="0244 123 456" value={form.phone} onChange={set('phone')}/>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap:14, marginBottom:24 }}>
              <div>
                <label style={{ fontSize:12, fontWeight:500, color:'#7A6E60', letterSpacing:'0.06em', textTransform:'uppercase', display:'block', marginBottom:8 }}>Password</label>
                <input className="input" type="password" placeholder="8+ characters" value={form.password} onChange={set('password')} required/>
              </div>
              <div>
                <label style={{ fontSize:12, fontWeight:500, color:'#7A6E60', letterSpacing:'0.06em', textTransform:'uppercase', display:'block', marginBottom:8 }}>Confirm</label>
                <input className="input" type="password" placeholder="Repeat password" value={form.confirmPassword} onChange={set('confirmPassword')} required/>
              </div>
            </div>

            <button type="submit" disabled={loading} className="lp-cta" style={{ width:'100%', background:'#C97B1A', color:'#fff', border:'none', borderRadius:11, padding:'15px', fontFamily:"'DM Sans',sans-serif", fontSize:15, fontWeight:500, cursor:loading?'wait':'pointer', transition:'all .2s' }}>
              {loading ? 'Creating account…' : 'Start Free Trial →'}
            </button>
          </form>

          <div style={{ fontSize:12, color:'#A89D8E', textAlign:'center', marginTop:14, lineHeight:1.6 }}>
            By signing up you agree to our <a href="#" style={{ color:'#C97B1A' }}>Terms of Service</a> and <a href="#" style={{ color:'#C97B1A' }}>Privacy Policy</a>
          </div>
          <div style={{ fontSize:14, color:'#7A6E60', textAlign:'center', marginTop:16 }}>
            Already have an account? <Link href="/login" style={{ color:'#C97B1A', textDecoration:'none', fontWeight:500 }}>Sign in →</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
