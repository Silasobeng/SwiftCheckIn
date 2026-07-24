'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const token = searchParams.get('token');
  const email = searchParams.get('email');

  useEffect(() => {
    if (!token || !email) {
      setError('Invalid or missing reset link. Please request a new password reset.');
    }
  }, [token, email]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to reset password'); return; }
      setSuccess(true);
      setTimeout(() => router.push('/login'), 2000);
    } catch { setError('Something went wrong'); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight:'100vh', background:'#F8F4EE', display:'flex', alignItems:'center', justifyContent:'center', padding:'24px', fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ background:'#fff', border:'1px solid #E4DFD5', borderRadius:20, padding:'48px 44px', width:'100%', maxWidth:440, boxShadow:'0 10px 40px rgba(22,36,58,0.08)' }}>

        {/* Logo */}
        <Link href="/" style={{ display:'flex', alignItems:'center', gap:10, textDecoration:'none', marginBottom:36 }}>
          <div style={{ width:34,height:34,background:'#16243A',borderRadius:9,display:'flex',alignItems:'center',justifyContent:'center' }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8.5L6.5 12L13 5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <span style={{ fontFamily:"'Playfair Display',serif", fontSize:16, color:'#16243A' }}>SwiftEntryPro</span>
        </Link>

        {success ? (
          <div style={{ textAlign:'center' }}>
            <div style={{ width:64,height:64,background:'#EDF6F1',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 20px' }}>
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><path d="M5 14L11 20L23 8" stroke="#2E7D4E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <h2 style={{ fontFamily:"'Playfair Display',serif", fontSize:24, color:'#16243A', marginBottom:10 }}>Password reset!</h2>
            <p style={{ fontSize:14, color:'#7A6E60', fontWeight:300 }}>Taking you back to sign in…</p>
          </div>
        ) : (
          <>
            <h1 style={{ fontFamily:"'Playfair Display',serif", fontSize:28, color:'#16243A', marginBottom:8 }}>Set a new password</h1>
            <p style={{ fontSize:14, color:'#7A6E60', marginBottom:32, fontWeight:300 }}>Choose something you&apos;ll remember.</p>

            <form onSubmit={handleSubmit}>
              {/* Same alert treatment as the login and signup screens */}
              {error && (
                <div className="alert alert-error" style={{ marginBottom:20 }}>
                  <svg width="16" height="16" viewBox="0 0 14 14" fill="none" style={{flexShrink:0,marginTop:2}}><circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.3"/><path d="M7 4v3M7 9.5h.01" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                  <span>{error}</span>
                </div>
              )}

              <div style={{ marginBottom:18 }}>
                <label style={{ fontSize:12, fontWeight:500, color:'#7A6E60', letterSpacing:'0.06em', textTransform:'uppercase' as const, display:'block', marginBottom:8 }}>New Password</label>
                <input className="input" type="password" placeholder="At least 8 characters" value={password} onChange={e=>setPassword(e.target.value)} required minLength={8} autoFocus/>
              </div>

              <div style={{ marginBottom:24 }}>
                <label style={{ fontSize:12, fontWeight:500, color:'#7A6E60', letterSpacing:'0.06em', textTransform:'uppercase' as const, display:'block', marginBottom:8 }}>Confirm Password</label>
                <input className="input" type="password" placeholder="Repeat your password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} required/>
              </div>

              <button type="submit" disabled={loading} className="lp-cta"
                style={{ width:'100%', background:loading?'#B8A898':'#C97B1A', color:'#fff', border:'none', borderRadius:11, padding:'15px', fontFamily:"'DM Sans',sans-serif", fontSize:15, fontWeight:500, cursor:loading?'wait':'pointer' }}>
                {loading ? 'Resetting…' : 'Reset Password'}
              </button>
            </form>

            <div style={{ textAlign:'center', marginTop:20 }}>
              <Link href="/login" style={{ fontSize:13, color:'#C97B1A', textDecoration:'none' }}>← Back to sign in</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight:'100vh', background:'#F8F4EE', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{ width:32,height:32,border:'3px solid #E4DFD5',borderTopColor:'#C97B1A',borderRadius:'50%',animation:'spin 0.8s linear infinite' }}/>
      </div>
    }>
      <ResetPasswordForm />
    </Suspense>
  );
}
