'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import {
  isFullscreenSupported, isStandaloneDisplay, requestFullscreen,
  exitFullscreen, getFullscreenElement, onFullscreenChange,
} from '@/lib/fullscreen';
import {
  getQueue, enqueueCheckin, removeFromQueue,
  cacheKioskData, getCachedKioskData, isNetworkError,
} from '@/lib/offlineQueue';
import { validatePersonIdentity } from '@/lib/personIdentity';

type Screen = 'loading' | 'closed' | 'welcome' | 'returning' | 'new' | 'success' | 'error';

interface KioskData {
  org: { id:string; name:string; tagline:string|null; logo_url?:string|null; cover_image_url?:string|null; brand_color?:string|null; kiosk_welcome_heading?:string|null; kiosk_welcome_subtext?:string|null };
  service: { id:string; title:string|null; date:string; time:string|null };
  people: { id:string; full_name:string; phone:string }[];
}

const IDLE_TIMEOUT = 60000;
const BLESSINGS = [
  { text:'The Lord bless you and keep you', ref:'Numbers 6:24' },
  { text:'This is the day the Lord has made', ref:'Psalm 118:24' },
  { text:'The joy of the Lord is your strength', ref:'Nehemiah 8:10' },
  { text:'Be still and know that I am God', ref:'Psalm 46:10' },
  { text:'I can do all things through Christ who strengthens me', ref:'Philippians 4:13' },
];

/**
 * Unlock dialog for whoever is running the tablet.
 *
 * Deliberately keyboard-free-friendly: a numeric-ish text field plus large
 * touch targets, because the kiosk is normally a tablet on a stand with no
 * keyboard attached. The code is verified server-side.
 */
function ExitModal({ slug, canExitFullscreen, standalone, onCancel, onUnlocked }:{
  slug:string; canExitFullscreen:boolean; standalone:boolean;
  onCancel:()=>void; onUnlocked:()=>void;
}) {
  const [code, setCode]       = useState('');
  const [busy, setBusy]       = useState(false);
  const [err, setErr]         = useState('');

  const submit = async () => {
    setBusy(true); setErr('');
    try {
      const res  = await fetch('/api/kiosk/exit', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ slug, code }),
      });
      const json = await res.json();
      if (!res.ok) { setErr(json.error || 'Could not unlock.'); return; }
      onUnlocked();
    } catch {
      setErr('No connection. Check the tablet is online.');
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-navy-950/85 backdrop-blur-sm p-6"
      onClick={onCancel}>
      <div className="w-full max-w-sm rounded-3xl bg-white shadow-soft-xl p-8 animate-scale-in" onClick={e=>e.stopPropagation()}>
        <h3 className="text-xl font-bold text-navy-900 mb-2">Unlock this tablet</h3>
        <p className="text-navy-400 mb-5 text-sm leading-relaxed">
          {standalone
            ? 'Enter your kiosk code to leave check-in and open the dashboard.'
            : canExitFullscreen
              ? 'Enter your kiosk code to leave fullscreen and return to normal browsing.'
              : 'Enter your kiosk code to leave check-in.'}
        </p>

        {err && <div className="alert alert-error mb-4"><span>{err}</span></div>}

        <input
          className="input input-lg text-center tracking-[0.35em] font-semibold"
          value={code}
          onChange={e=>setCode(e.target.value)}
          onKeyDown={e=>{ if(e.key==='Enter' && code.trim() && !busy) submit(); }}
          placeholder="••••••"
          inputMode="text"
          autoComplete="off"
          autoFocus
          aria-label="Kiosk access code"
        />
        <p className="text-xs text-navy-400 mt-2.5 mb-5">
          Find this in your dashboard under <strong className="text-navy-700 font-medium">Settings → Kiosk access code</strong>.
        </p>

        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 btn btn-secondary">Cancel</button>
          <button onClick={submit} disabled={busy || !code.trim()} className="flex-1 btn btn-primary">
            {busy ? 'Checking…' : 'Unlock'}
          </button>
        </div>

        {standalone && (
          <p className="text-[11px] text-navy-400 mt-5 leading-relaxed text-center">
            This tablet opened check-in from its home screen, so the app fills the
            whole display. Unlocking opens the dashboard — use your device&apos;s
            home gesture to leave entirely.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Always-present escape hatch. Faint enough that a visitor scanning the screen
 * won't reach for it, findable by anyone who is actually looking. It is NOT
 * gated on fullscreen state — the devices most in need of an exit are the ones
 * where the Fullscreen API never engaged.
 */
function ExitHandle({ onActivate }:{ onActivate:()=>void }) {
  return (
    <button
      onClick={onActivate}
      aria-label="Unlock kiosk"
      className="fixed bottom-4 right-4 z-40 flex items-center justify-center rounded-full transition-all duration-200 hover:bg-white/20 active:scale-95"
      style={{ width:44, height:44, background:'rgba(255,255,255,0.09)', border:'1px solid rgba(255,255,255,0.14)' }}
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="rgba(255,255,255,0.5)" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
      </svg>
    </button>
  );
}

export default function KioskPage() {
  const params = useParams();
  const slug   = params.slug as string;
  const [screen, setScreen]             = useState<Screen>('loading');
  const [data, setData]                 = useState<KioskData|null>(null);
  const [error, setError]               = useState('');
  const [successName, setSuccessName]   = useState('');
  const [isFirstTime, setIsFirstTime]   = useState(false);
  const [alreadyCheckedIn, setAlreadyCheckedIn] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);
  const [exitTapCount, setExitTapCount] = useState(0);
  // Capability flags resolve after mount so server and client markup match.
  const [fsSupported, setFsSupported] = useState(false);
  const [standalone, setStandalone]   = useState(false);
  const [fsNotice, setFsNotice]       = useState('');
  const [newForm, setNewForm]           = useState({ full_name:'', phone:'', gender:'', email:'' });
  const [newErrors, setNewErrors]       = useState({ full_name:'', phone:'' });
  // Set when the server can't find a mail server for the typed email — a
  // soft "are you sure" rather than a hard block, so a real person with an
  // unusual domain is never stuck. Cleared the moment they edit the email.
  const [emailWarning, setEmailWarning] = useState('');
  const [search, setSearch]             = useState('');
  // isOffline reflects the last network attempt, not navigator.onLine — a
  // device can report "online" while still unable to reach this server, and
  // that false positive is exactly the case a kiosk needs covered.
  const [isOffline, setIsOffline]       = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [justQueued, setJustQueued]     = useState(false);
  const idleTimerRef    = useRef<NodeJS.Timeout|null>(null);
  const exitTapTimerRef = useRef<NodeJS.Timeout|null>(null);
  const blessing = useRef(BLESSINGS[Math.floor(Math.random()*BLESSINGS.length)]);

  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (!['welcome','success','loading','closed','error'].includes(screen)) {
      idleTimerRef.current = setTimeout(() => { setSearch(''); setNewForm({ full_name:'', phone:'', gender:'', email:'' }); setScreen('welcome'); }, IDLE_TIMEOUT);
    }
  }, [screen]);

  useEffect(() => {
    resetIdleTimer();
    const h = () => resetIdleTimer();
    window.addEventListener('touchstart',h); window.addEventListener('click',h); window.addEventListener('keydown',h);
    return () => { if(idleTimerRef.current) clearTimeout(idleTimerRef.current); window.removeEventListener('touchstart',h); window.removeEventListener('click',h); window.removeEventListener('keydown',h); };
  }, [resetIdleTimer]);

  // Detect what this particular tablet can actually do, once, on the client.
  useEffect(() => {
    setFsSupported(isFullscreenSupported());
    setStandalone(isStandaloneDisplay());
    setIsFullscreen(getFullscreenElement() !== null);
  }, []);

  useEffect(() => onFullscreenChange(() => setIsFullscreen(getFullscreenElement() !== null)), []);

  const enterFullscreen = async () => {
    const ok = await requestFullscreen();
    setIsFullscreen(getFullscreenElement() !== null);
    // Previously this failure was swallowed, so on browsers without the
    // Fullscreen API the button looked broken rather than unavailable.
    if (!ok) {
      setFsSupported(false);
      setFsNotice('This browser will not allow fullscreen. Check-in still works normally.');
      setTimeout(() => setFsNotice(''), 5000);
    }
  };

  /** Called once the access code has been accepted. */
  const handleUnlocked = async () => {
    setShowExitModal(false);
    setExitTapCount(0);
    const left = await exitFullscreen();
    setIsFullscreen(getFullscreenElement() !== null);
    // Home-screen installs cannot be exited by script, and a browser that
    // refused exitFullscreen leaves us nowhere useful — send them somewhere
    // they can actually act instead of appearing to do nothing.
    if (standalone || !left) window.location.href = '/admin';
  };

  const handleHiddenExitTap = () => {
    setExitTapCount(c => {
      const next = c+1;
      if(exitTapTimerRef.current) clearTimeout(exitTapTimerRef.current);
      exitTapTimerRef.current = setTimeout(() => setExitTapCount(0),1200);
      if(next >= 3) { setShowExitModal(true); return 0; }
      return next;
    });
  };

  const loadKiosk = useCallback(async () => {
    try {
      const res  = await fetch(`/api/kiosk?slug=${slug}`);
      const json = await res.json();
      if (!res.ok) {
        // A real answer from the server, not a connection failure — the kiosk
        // being closed or the subscription expiring is definitive and must
        // win over any cached "open" snapshot from earlier.
        if(json.code==='KIOSK_CLOSED'||json.code==='SERVICE_ENDED') { setData({ org:json.org, service:null as any, people:[] }); setScreen('closed'); }
        else { setError(json.error||'Failed to load'); setScreen('error'); }
        return;
      }
      cacheKioskData(slug, json);
      setIsOffline(false);
      setData(json); setScreen('welcome');
    } catch (err) {
      // The request never reached the server. Fall back to the last snapshot
      // this tablet saw while it still had a connection, so a dropped wifi
      // signal mid-service doesn't strand ushers on a loading spinner.
      if (isNetworkError(err)) {
        const cached = getCachedKioskData<KioskData>(slug);
        if (cached) { setData(cached); setIsOffline(true); setScreen('welcome'); return; }
      }
      setError('Failed to connect'); setScreen('error');
    }
  }, [slug]);

  useEffect(() => { loadKiosk(); }, [loadKiosk]);

  useEffect(() => { setPendingCount(getQueue(slug).length); }, [slug]);

  // Attempts every queued check-in against the real endpoint. Safe to call
  // repeatedly and safe to retry the same item: /api/kiosk looks an existing
  // person up by phone and upserts the check-in row, so a queued item that
  // lands twice creates nothing twice.
  const flushQueue = useCallback(async () => {
    const queue = getQueue(slug);
    if (queue.length === 0) return;
    let reachedServer = false;
    for (const item of queue) {
      try {
        const res = await fetch('/api/kiosk', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orgSlug: item.orgSlug, serviceId: item.serviceId, personId: item.personId, newPerson: item.newPerson }),
        });
        reachedServer = true;
        // Whether this landed as a fresh check-in or the server recognised it
        // as already done, the outcome is the same from here: it's on record,
        // so it comes off the local queue either way.
        if (res.ok || res.status < 500) removeFromQueue(slug, item.clientId);
      } catch (err) {
        if (isNetworkError(err)) break; // still offline — stop for now, try again later
      }
    }
    if (reachedServer) setIsOffline(false);
    setPendingCount(getQueue(slug).length);
  }, [slug]);

  useEffect(() => {
    const onOnline = () => flushQueue();
    window.addEventListener('online', onOnline);
    const interval = setInterval(flushQueue, 20000);
    return () => { window.removeEventListener('online', onOnline); clearInterval(interval); };
  }, [flushQueue]);

  const handleCheckin = async (personId?:string, newPerson?:typeof newForm, confirmEmailAnyway?:boolean) => {
    if(!data) return;
    try {
      const res  = await fetch('/api/kiosk', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ orgSlug:slug, serviceId:data.service.id, personId, newPerson, confirmEmailAnyway }) });
      const json = await res.json();
      if(!res.ok) {
        // A soft warning, not a hard failure — stays on the same form so
        // the email is right there to either fix or confirm, instead of
        // bouncing to a generic error screen for something this minor.
        if (json.error === 'EMAIL_UNVERIFIED') { setEmailWarning(json.message || "We couldn't find a mail server for this email."); return; }
        setError(json.error||'Check-in failed'); setScreen('error'); return;
      }
      setEmailWarning('');
      setJustQueued(false);
      setSuccessName(json.person.full_name); setIsFirstTime(json.isFirstTime); setAlreadyCheckedIn(json.alreadyCheckedIn||false); setScreen('success');
      setTimeout(() => { setSearch(''); setNewForm({ full_name:'', phone:'', gender:'', email:'' }); loadKiosk(); }, 4500);
    } catch (err) {
      if (!isNetworkError(err)) { setError('Check-in failed'); setScreen('error'); return; }
      // No connection right now — this still counts as checked in from the
      // usher's point of view. It queues locally and lands on the real record
      // the moment the network returns, rather than making a visitor stand
      // there while someone chases down a wifi router.
      const label = newPerson?.full_name || data.people.find(p => p.id === personId)?.full_name || 'You';
      enqueueCheckin(slug, { serviceId: data.service.id, personId, newPerson, personLabel: label });
      setIsOffline(true);
      setPendingCount(getQueue(slug).length);
      setJustQueued(true);
      setSuccessName(label); setIsFirstTime(!!newPerson); setAlreadyCheckedIn(false); setScreen('success');
      setTimeout(() => { setSearch(''); setNewForm({ full_name:'', phone:'', gender:'', email:'' }); setScreen('welcome'); }, 4500);
    }
  };

  const filteredPeople = data?.people.filter(p => p.full_name.toLowerCase().includes(search.toLowerCase()) || p.phone.includes(search)) || [];

  // The org's brand colour drives the kiosk backdrop — the Settings page
  // promises exactly this ("Colors the screen your visitors check in on")
  // and shows a live preview of it.
  const brand = /^#[0-9a-fA-F]{6}$/.test(data?.org.brand_color || '') ? data!.org.brand_color! : '#0e2033';
  const darkBg = data?.org.cover_image_url
    ? { backgroundImage:`linear-gradient(rgba(7,21,38,0.82),rgba(7,21,38,0.92)),url(${data.org.cover_image_url})`, backgroundSize:'cover', backgroundPosition:'center' }
    : { background:`linear-gradient(160deg,${brand} 0%,#060d18 100%)` };

  // One escape hatch, rendered identically on every kiosk screen. Two ways in:
  // the visible corner handle, and the legacy 3-tap corner for anyone already
  // trained on it. Neither depends on fullscreen having engaged.
  const kioskChrome = (
    <>
      {showExitModal && (
        <ExitModal
          slug={slug}
          canExitFullscreen={isFullscreen}
          standalone={standalone}
          onCancel={() => { setShowExitModal(false); setExitTapCount(0); }}
          onUnlocked={handleUnlocked}
        />
      )}
      <button aria-label="Unlock kiosk" onClick={handleHiddenExitTap}
        className="fixed left-0 top-0 h-16 w-16 opacity-0 z-40" />
      <ExitHandle onActivate={() => setShowExitModal(true)} />
      {/* Quiet status, not an alarm — a dropped connection on a kiosk is
          routine, not an incident. Only pendingCount matters to an usher;
          isOffline alone (queue empty, still unconfirmed) stays silent. */}
      {pendingCount > 0 && (
        <div className="fixed bottom-4 left-4 z-40 flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-medium"
          style={{ background:'rgba(255,255,255,.09)', border:'1px solid rgba(255,255,255,.14)', color:'rgba(255,255,255,.65)' }}>
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background:'#f5c842' }} />
          {pendingCount} {pendingCount === 1 ? 'check-in' : 'check-ins'} saving — will sync when back online
        </div>
      )}
      {fsNotice && (
        <div className="fixed bottom-20 right-4 z-40 max-w-xs rounded-xl px-4 py-3 text-sm"
          style={{ background:'rgba(255,255,255,0.12)', border:'1px solid rgba(255,255,255,0.18)', color:'rgba(255,255,255,0.85)' }}>
          {fsNotice}
        </div>
      )}
    </>
  );

  const glowTop = { position:'absolute' as const, top:'-80px', left:'50%', transform:'translateX(-50%)', width:'700px', height:'500px', background:'radial-gradient(ellipse at center top,rgba(212,160,23,.14) 0%,transparent 65%)', pointerEvents:'none' as const };
  const vignette = { position:'absolute' as const, inset:0, background:'radial-gradient(ellipse at center,transparent 40%,rgba(3,7,13,.55) 100%)', pointerEvents:'none' as const };

  /* LOADING */
  if(screen==='loading') return (
    <div className="min-h-screen flex items-center justify-center" style={{ background:'linear-gradient(160deg,#0e2033 0%,#060d18 100%)' }}>
      <div className="text-center">
        <div className="w-14 h-14 border-4 border-t-transparent rounded-full animate-spin mx-auto mb-5" style={{ borderColor:'#f5c842', borderTopColor:'transparent' }}/>
        <p className="text-white/40 tracking-wide">Getting things ready…</p>
      </div>
    </div>
  );

  /* ERROR */
  if(screen==='error') return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center" style={{ background:'linear-gradient(160deg,#0e2033 0%,#060d18 100%)' }}>
      {/* A failed load is the state most likely to strand someone in a locked
          fullscreen tablet, so the unlock has to be reachable from here too. */}
      {kioskChrome}
      <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mb-6 animate-scale-in">
        <svg className="w-10 h-10 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/></svg>
      </div>
      <h1 className="text-3xl font-bold text-white mb-3">Something went wrong</h1>
      <p className="text-white/40 mb-8 max-w-sm">{error}</p>
      <button onClick={loadKiosk} className="btn btn-primary btn-lg">Try Again</button>
    </div>
  );

  /* CLOSED */
  if(screen==='closed') return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center relative overflow-hidden" style={darkBg}>
      {kioskChrome}
      <div style={glowTop}/><div style={vignette}/>
      <div className="animate-fade-in relative z-10">
        {data?.org.logo_url && <img src={data.org.logo_url} alt="logo" className="w-20 h-20 rounded-2xl object-cover mx-auto mb-6" style={{ boxShadow:'0 8px 24px rgba(0,0,0,.3)' }}/>}
        <h1 className="text-4xl font-bold text-white mb-3" style={{ fontFamily:'var(--font-serif)' }}>{data?.org.name}</h1>
        <p className="text-white/40 text-lg mb-12">Check-in is currently closed</p>
        <div className="rounded-2xl p-8 max-w-md" style={{ background:'rgba(255,255,255,.07)', border:'1px solid rgba(255,255,255,.1)' }}>
          <p className="text-white/82 italic text-lg" style={{ fontFamily:'var(--font-serif)' }}>"{blessing.current.text}"</p>
          <p className="text-sm mt-3" style={{ color:'#f5c842' }}>— {blessing.current.ref}</p>
        </div>
      </div>
    </div>
  );

  /* SUCCESS */
  if(screen==='success') return (
    <div className={`min-h-screen flex flex-col items-center justify-center p-8 text-center relative overflow-hidden ${alreadyCheckedIn ? 'bg-navy-900' : ''}`} style={alreadyCheckedIn ? {} : { background:'radial-gradient(ellipse at center,#0e2918 0%,#060d18 70%)' }}>
      {/* The success screen used to omit the exit chrome entirely, leaving a
          ~4.5s window on every check-in with no way out of the kiosk. */}
      {kioskChrome}
      {/* Rings */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {[300,500,720].map((size,i) => (
          <div key={size} className="absolute rounded-full" style={{ width:size, height:size, border:'1px solid rgba(16,185,129,.15)', animation:`ringOut 2.4s ease-out ${i*0.2}s both` }}/>
        ))}
      </div>
      <div className="relative z-10 flex flex-col items-center">
        <div className="w-32 h-32 rounded-full flex items-center justify-center mb-8 animate-check-bounce" style={{ background: alreadyCheckedIn ? 'linear-gradient(135deg,#1e3a5f,#2a5280)' : 'linear-gradient(135deg,#059669,#10b981)', boxShadow: alreadyCheckedIn ? 'none' : '0 8px 40px rgba(16,185,129,.4)' }}>
          <svg className="w-14 h-14 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
        </div>
        <h1 className="text-5xl sm:text-6xl font-bold text-white mb-3 animate-fade-in-up" style={{ fontFamily:'var(--font-serif)', animationDelay:'0.15s', opacity:0 }}>
          {alreadyCheckedIn ? 'Already in!' : isFirstTime ? 'Welcome!' : 'Welcome back!'}
        </h1>
        <p className="text-3xl sm:text-4xl text-white/80 font-medium mb-10 animate-fade-in-up" style={{ animationDelay:'0.25s', opacity:0 }}>{successName}</p>
        <div className="rounded-2xl p-7 max-w-sm animate-fade-in-up" style={{ animationDelay:'0.4s', opacity:0, background:'rgba(255,255,255,.1)', border:'1px solid rgba(255,255,255,.12)' }}>
          {alreadyCheckedIn
            ? <p className="text-white text-lg">You&apos;re already checked in — enjoy the service.</p>
            : <><p className="text-white italic text-base leading-relaxed" style={{ fontFamily:'var(--font-serif)' }}>"{blessing.current.text}"</p><p className="text-white/45 text-sm mt-2">— {blessing.current.ref}</p></>
          }
        </div>
        {justQueued && (
          <p className="text-xs mt-4" style={{ color:'rgba(255,255,255,.4)' }}>
            No connection right now — you&apos;re still checked in, this will save the moment the network returns.
          </p>
        )}
      </div>
    </div>
  );

  /* WELCOME */
  if(screen==='welcome') return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center relative overflow-hidden" style={darkBg}>
      {kioskChrome}
      <div style={glowTop}/><div style={vignette}/>

      {/* Only offered where the browser can actually deliver it — on iPhone
          Safari and home-screen installs this button could never work. */}
      {!isFullscreen && fsSupported && !standalone && (
        <button onClick={enterFullscreen} className="absolute top-5 right-5 z-20 flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all backdrop-blur-sm hover:bg-white/[0.16] hover:text-white" style={{ background:'rgba(255,255,255,.08)', border:'1px solid rgba(255,255,255,.12)', color:'rgba(255,255,255,.6)' }}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15"/></svg>
          Fullscreen
        </button>
      )}

      {/* Service chip */}
      {data?.service && (
        <div className="absolute top-5 left-5 z-20 text-xs font-medium" style={{ color:'rgba(255,255,255,.45)' }}>
          {data.service.title} &nbsp;·&nbsp; {new Date(data.service.date).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})}
        </div>
      )}

      <div className="relative z-10 w-full max-w-lg">
        {data?.org.logo_url && (
          <div className="animate-fade-in mb-7" style={{ opacity:0 }}>
            <img src={data.org.logo_url} alt="logo" className="w-20 h-20 rounded-2xl object-cover mx-auto" style={{ boxShadow:'0 8px 24px rgba(0,0,0,.3)', border:'1px solid rgba(255,255,255,.1)' }}/>
          </div>
        )}

        {/* Gold rule */}
        <div className="mx-auto mb-7" style={{ width:48, height:2, borderRadius:1, background:'linear-gradient(90deg,transparent,#d4a017,transparent)' }}/>

        <h1 className="text-5xl sm:text-6xl font-bold text-white leading-tight mb-4 animate-fade-in-up" style={{ fontFamily:'var(--font-serif)', animationDelay:'0.05s', opacity:0 }}>
          {data?.org.kiosk_welcome_heading || 'Welcome to Church'}
        </h1>
        <p className="text-white/55 text-xl mb-12 animate-fade-in-up" style={{ animationDelay:'0.15s', opacity:0 }}>
          {data?.org.kiosk_welcome_subtext || "We're glad you're here"}
        </p>

        {/* Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 w-full animate-fade-in-up" style={{ animationDelay:'0.25s', opacity:0 }}>
          {/* Returning */}
          <button
            onClick={() => { if(!isFullscreen) enterFullscreen(); setScreen('returning'); }}
            className="group relative flex flex-col items-center justify-center gap-4 rounded-3xl px-6 py-10 text-white transition-all duration-300 active:scale-[.97] hover:-translate-y-1 hover:brightness-105"
            style={{ background:'linear-gradient(145deg,#059669,#10b981)', boxShadow:'0 4px 24px rgba(16,185,129,.35)' }}
          >
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center transition-all" style={{ background:'rgba(0,0,0,.15)' }}>
              <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0"/></svg>
            </div>
            <div>
              <div className="text-xl font-extrabold uppercase tracking-wider leading-none">Returning</div>
              <div className="text-white/55 text-sm mt-2">Search for your name</div>
            </div>
            <svg className="absolute bottom-4 right-5 w-5 h-5 text-white/30 group-hover:text-white/60 transition-all group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
          </button>

          {/* First Time */}
          <button
            onClick={() => { if(!isFullscreen) enterFullscreen(); setScreen('new'); }}
            className="group relative flex flex-col items-center justify-center gap-4 rounded-3xl px-6 py-10 text-navy-900 transition-all duration-300 active:scale-[.97] hover:-translate-y-1 hover:brightness-105"
            style={{ background:'linear-gradient(145deg,#e8aa18,#d4900a)', boxShadow:'0 4px 24px rgba(212,144,10,.45)' }}
          >
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background:'rgba(0,0,0,.12)' }}>
              <svg className="w-7 h-7 text-navy-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109"/></svg>
            </div>
            <div>
              <div className="text-xl font-extrabold uppercase tracking-wider leading-none">First Time</div>
              <div className="text-navy-900/50 text-sm mt-2">Fill in a quick form</div>
            </div>
            <svg className="absolute bottom-4 right-5 w-5 h-5 text-navy-900/30 group-hover:text-navy-900/60 transition-all group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
          </button>
        </div>

        {/* Scripture */}
        <p className="mt-11 animate-fade-in" style={{ animationDelay:'0.4s', opacity:0, fontFamily:'var(--font-serif)', fontStyle:'italic', fontSize:'clamp(14px,1.6vw,17px)', color:'rgba(255,255,255,.65)', lineHeight:1.6 }}>
          "{blessing.current.text}" <span style={{ fontStyle:'normal', fontFamily:'var(--font-sans)', fontSize:'0.82em', color:'rgba(212,160,23,.8)', marginLeft:8 }}>— {blessing.current.ref}</span>
        </p>
      </div>
    </div>
  );

  /* RETURNING */
  if(screen==='returning') return (
    <div className="min-h-screen flex flex-col p-6 sm:p-10 relative overflow-hidden" style={darkBg}>
      {kioskChrome}
      <div style={glowTop}/><div style={vignette}/>

      <button onClick={() => { setSearch(''); setScreen('welcome'); }} className="flex items-center gap-2 text-sm font-medium mb-8 self-start transition-colors relative z-10" style={{ color:'rgba(255,255,255,.55)' }}>
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
        Back
      </button>

      <div className="flex-1 flex flex-col items-center justify-start max-w-lg mx-auto w-full relative z-10">
        <div className="text-center mb-10 animate-fade-in-up" style={{ opacity:0 }}>
          <h2 className="text-4xl sm:text-5xl font-bold text-white mb-2" style={{ fontFamily:'var(--font-serif)' }}>Welcome back!</h2>
          <p className="text-white/50 text-lg">Search for your name below</p>
        </div>

        <div className="w-full mb-5 animate-fade-in-up" style={{ animationDelay:'0.1s', opacity:0 }}>
          <input
            type="text" placeholder="Type your name or phone number…"
            value={search} onChange={e => setSearch(e.target.value)}
            className="input-dark input-lg"
            autoFocus
          />
        </div>

        <div className="w-full animate-fade-in-up" style={{ animationDelay:'0.2s', opacity:0 }}>
          {search.length < 1 ? (
            <p className="text-center py-16 text-white/40 text-lg">Start typing to find your name</p>
          ) : filteredPeople.length === 0 ? (
            <div className="rounded-2xl p-8 text-center" style={{ background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.1)' }}>
              <p className="text-white/55 mb-4">No one found for "<span className="text-white font-medium">{search}</span>"</p>
              <button onClick={() => { setNewForm({...newForm, full_name:search}); setScreen('new'); }} className="inline-flex items-center gap-2 font-semibold text-sm transition-colors" style={{ color:'#f5c842' }}>
                Register as a new visitor →
              </button>
            </div>
          ) : (
            <div className="rounded-2xl overflow-hidden" style={{ background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.09)' }}>
              {filteredPeople.map((p,i) => (
                <button key={p.id} onClick={() => handleCheckin(p.id)}
                  className="w-full text-left px-6 py-5 flex items-center gap-4 transition-all group animate-fade-in-up hover:bg-white/[0.07] active:bg-white/[0.11]"
                  style={{ borderBottom: i===filteredPeople.length-1 ? 'none' : '1px solid rgba(255,255,255,.06)', animationDelay:`${i*0.04}s`, opacity:0 }}
                >
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center font-bold text-sm flex-shrink-0" style={{ background:'rgba(255,255,255,.1)', color:'rgba(255,255,255,.7)' }}>
                    {p.full_name.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-white text-lg group-hover:text-yellow-300 transition-colors">{p.full_name}</div>
                    <div className="text-white/45 text-sm mt-0.5">{p.phone}</div>
                  </div>
                  <svg className="w-5 h-5 text-white/20 group-hover:text-white/50 transition-all group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  /* NEW VISITOR */
  if(screen==='new') return (
    <div className="min-h-screen flex flex-col p-6 sm:p-10 relative overflow-hidden" style={darkBg}>
      {kioskChrome}
      <div style={glowTop}/><div style={vignette}/>

      <button onClick={() => { setNewForm({ full_name:'', phone:'', gender:'', email:'' }); setNewErrors({ full_name:'', phone:'' }); setScreen('welcome'); }} className="flex items-center gap-2 text-sm font-medium mb-8 self-start transition-colors relative z-10" style={{ color:'rgba(255,255,255,.55)' }}>
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
        Back
      </button>

      <div className="flex-1 flex flex-col items-center justify-start max-w-md mx-auto w-full relative z-10">
        <div className="text-center mb-8 animate-fade-in-up" style={{ opacity:0 }}>
          <div className="w-12 h-12 rounded-full border border-white/15 mx-auto mb-4 flex items-center justify-center text-white/70"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="3"/><path d="M5.5 20c.7-4 2.8-6 6.5-6s5.8 2 6.5 6"/></svg></div>
          <h2 className="text-4xl sm:text-5xl font-bold text-white mb-2" style={{ fontFamily:'var(--font-serif)' }}>Nice to meet you!</h2>
          <p className="text-white/45">Just a few quick details and you&apos;re in</p>
        </div>

        <div className="w-full rounded-2xl p-7 space-y-5 animate-fade-in-up" style={{ animationDelay:'0.1s', opacity:0, background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.1)' }}>

          <div>
            <label className="block text-xs font-bold uppercase tracking-widest mb-2" style={{ color:'rgba(255,255,255,.5)' }}>Full Name <span className="text-red-400">*</span></label>
            <input type="text" className={`input-dark input-lg ${newErrors.full_name ? 'has-error' : ''}`}
              placeholder="Your full name" value={newForm.full_name}
              onChange={e => { setNewForm({...newForm, full_name:e.target.value}); if(e.target.value.trim()) setNewErrors(p=>({...p,full_name:''})); }}
              autoFocus />
            {newErrors.full_name && <p className="text-red-400 text-sm mt-1.5">{newErrors.full_name}</p>}
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-widest mb-2" style={{ color:'rgba(255,255,255,.5)' }}>Phone Number <span className="text-red-400">*</span></label>
            <input type="tel" className={`input-dark input-lg ${newErrors.phone ? 'has-error' : ''}`}
              placeholder="0244 123 456" value={newForm.phone}
              onChange={e => { setNewForm({...newForm, phone:e.target.value}); if(e.target.value.trim()) setNewErrors(p=>({...p,phone:''})); }} />
            {newErrors.phone && <p className="text-red-400 text-sm mt-1.5">{newErrors.phone}</p>}
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-widest mb-3" style={{ color:'rgba(255,255,255,.5)' }}>Gender</label>
            <div className="grid grid-cols-2 gap-3">
              {(['male','female'] as const).map(g => (
                <label key={g} className={`flex items-center justify-center gap-2.5 p-4 rounded-xl border-2 cursor-pointer transition-all select-none ${newForm.gender===g ? 'border-yellow-400 bg-yellow-400/15 text-white' : 'border-white/15 text-white/50'}`}>
                  <input type="radio" name="gender" value={g} checked={newForm.gender===g} onChange={e => setNewForm({...newForm, gender:e.target.value})} className="sr-only"/>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="3"/><path d="M5.5 20c.7-4 2.8-6 6.5-6s5.8 2 6.5 6"/></svg>
                  <span className="font-semibold capitalize">{g}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-widest mb-2" style={{ color:'rgba(255,255,255,.5)' }}>
              Email address <span className="font-normal normal-case text-white/30 tracking-normal text-xs">(optional)</span>
            </label>
            {/* Soft, explicit permission to skip rather than a field that
                just sits there implying it should be filled — the point is
                removing the felt pressure to type something under pressure,
                not the option to give a real one. */}
            <input type="email" className="input-dark input-lg" placeholder="Skip this if you don't have one" value={newForm.email}
              onChange={e => { setNewForm({...newForm, email:e.target.value}); if(emailWarning) setEmailWarning(''); }}/>
            {emailWarning && (
              <div className="mt-2.5 rounded-xl px-4 py-3 text-sm" style={{ background:'rgba(232,170,24,.12)', border:'1px solid rgba(232,170,24,.35)', color:'rgba(255,255,255,.85)' }}>
                {emailWarning}
                <button type="button" onClick={() => handleCheckin(undefined, newForm, true)} className="block mt-1.5 font-bold underline" style={{ color:'#f5c842' }}>
                  Check in without sending email
                </button>
              </div>
            )}
          </div>

          <button
            onClick={() => {
              const errors = { full_name:'', phone:'' };
              const identityError = validatePersonIdentity(newForm.full_name, newForm.phone);
              if(!newForm.full_name.trim()) errors.full_name = 'Please enter your full name';
              else if(identityError === 'Enter a name that includes letters') errors.full_name = identityError;
              if(!newForm.phone.trim()) errors.phone = 'Please enter your phone number';
              else if(identityError === 'Enter a valid phone number') errors.phone = identityError;
              if(errors.full_name || errors.phone) { setNewErrors(errors); return; }
              handleCheckin(undefined, newForm);
            }}
            className="w-full py-4 rounded-2xl font-bold text-navy-900 text-lg flex items-center justify-center gap-2 transition-all mt-2 hover:brightness-105 active:scale-[.98]"
            style={{ background:'linear-gradient(135deg,#e8aa18,#d4900a)', boxShadow:'0 4px 20px rgba(212,144,10,.4)' }}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
            Check In
          </button>
        </div>
      </div>
    </div>
  );

  return null;
}
