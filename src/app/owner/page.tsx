'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type OrgRow = {
  id: string;
  name: string;
  slug: string;
  admin_email: string;
  subscription_status: string;
  subscription_end_date: string | null;
  created_at: string;
  counts: { people: number; services: number; checkins: number };
};

type SessionData = {
  adminEmail: string;
  orgName: string;
};

const STATUS_BADGE: Record<string, string> = {
  active: 'badge-success',
  trial: 'badge-gold',
  expired: 'badge-danger',
  cancelled: 'badge-navy',
};

export default function OwnerPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionData | null>(null);
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [resetOrgId, setResetOrgId] = useState<string | null>(null);
  const [deleteOrgId, setDeleteOrgId] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState('');

  const load = async () => {
    setError(null);
    const [sessionRes, orgRes] = await Promise.all([
      fetch('/api/auth/session', { cache: 'no-store' }),
      fetch('/api/owner/orgs', { cache: 'no-store' }),
    ]);
    const sessionData = await sessionRes.json();
    if (!sessionData.authenticated) {
      router.push('/login');
      return;
    }
    setSession(sessionData.session);
    const orgData = await orgRes.json();
    if (!orgRes.ok) {
      setError(orgData.error || 'Could not load owner dashboard.');
    } else {
      setOrgs(orgData.orgs || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    load().catch(() => {
      setError('Could not load owner dashboard.');
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!message && !error) return;
    const id = window.setTimeout(() => {
      setMessage(null);
      setError(null);
    }, 4000);
    return () => window.clearTimeout(id);
  }, [message, error]);

  const stats = useMemo(() => ({
    total: orgs.length,
    active: orgs.filter((o) => o.subscription_status === 'active').length,
    trial: orgs.filter((o) => o.subscription_status === 'trial').length,
    expired: orgs.filter((o) => o.subscription_status === 'expired').length,
  }), [orgs]);

  const patchOrg = async (orgId: string, action: string) => {
    setBusy(`${orgId}:${action}`);
    setMessage(null); setError(null);
    const res = await fetch('/api/owner/orgs', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orgId, action }) });
    const data = await res.json();
    if (!res.ok) setError(data.error || 'Update failed.');
    else { setMessage('Church updated.'); await load(); }
    setBusy(null);
  };

  const deleteOrg = async () => {
    if (!deleteOrgId) return;
    setBusy(`${deleteOrgId}:delete`);
    const res = await fetch(`/api/owner/orgs?orgId=${encodeURIComponent(deleteOrgId)}&confirm=DELETE`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) setError(data.error || 'Delete failed.');
    else { setMessage('Church deleted.'); setDeleteOrgId(null); setConfirmText(''); await load(); }
    setBusy(null);
  };

  const resetOrg = async () => {
    if (!resetOrgId) return;
    setBusy(`${resetOrgId}:reset`);
    const res = await fetch('/api/owner/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orgId: resetOrgId, confirmation: confirmText }) });
    const data = await res.json();
    if (!res.ok) setError(data.error || 'Reset failed.');
    else { setMessage('Church data reset.'); setResetOrgId(null); setConfirmText(''); await load(); }
    setBusy(null);
  };

  if (loading) return (
    <div style={{ minHeight:'100vh', background:'#F8F4EE', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ width:44, height:44, border:'3px solid #E4DFD5', borderTopColor:'#C97B1A', borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto 16px' }} />
        <p style={{ color:'#7A6E60', fontSize:14 }}>Loading…</p>
      </div>
    </div>
  );

  const targetOrg = orgs.find((o) => o.id === (resetOrgId || deleteOrgId));

  return (
    <div style={{ minHeight:'100vh', background:'#F8F4EE' }}>

      {/* Header */}
      <header className="bg-white border-b border-navy-100 px-4 sm:px-6 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto h-[68px] flex justify-between items-center gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div style={{ width:36, height:36, background:'#16243A', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <svg style={{ width:16, height:16, color:'#F0A832' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            </div>
            <div className="min-w-0">
              <h1 className="font-semibold text-navy-900 leading-tight">Developer Portal</h1>
              <p className="text-xs text-navy-500 truncate">{session?.adminEmail}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={() => load()} className="btn btn-ghost btn-icon" title="Refresh" aria-label="Refresh">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            </button>
            <Link href="/admin" className="btn btn-secondary text-sm">Church Admin</Link>
          </div>
        </div>
      </header>

      <div className="toast-stack" aria-live="polite">
        {message && <div className="alert alert-success"><span>{message}</span></div>}
        {error && <div className="alert alert-error"><span>{error}</span></div>}
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-7 sm:py-9">

        <div style={{ marginBottom:28 }}>
          <h2 style={{ fontFamily:"'Playfair Display',serif", fontSize:26, color:'#16243A', fontWeight:400, marginBottom:4 }}>Every church on the platform</h2>
          <p style={{ fontSize:14, color:'#7A6E60', fontWeight:300 }}>Manage subscriptions, reset data, and remove accounts.</p>
        </div>

        {/* Stat cards */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:14, marginBottom:24 }}>
          {[
            { label:'Total churches', value:stats.total,   color:'#16243A' },
            { label:'Active',         value:stats.active,  color:'#2E7D4E' },
            { label:'On trial',       value:stats.trial,   color:'#C97B1A' },
            { label:'Expired',        value:stats.expired, color:'#B23B3B' },
          ].map(({ label, value, color }) => (
            <div key={label} className="panel card-hover" style={{ padding:'22px 24px' }}>
              <div style={{ fontFamily:"'Playfair Display',serif", fontSize:34, color, lineHeight:1, marginBottom:6 }}>{value}</div>
              <div style={{ fontSize:13, color:'#7A6E60', fontWeight:300 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Church table */}
        <div className="card p-0 overflow-hidden">
          {orgs.length === 0 ? (
            <div style={{ textAlign:'center', padding:'60px 20px' }}>
              <div style={{ fontSize:40, marginBottom:14, opacity:0.3 }}>⛪</div>
              <div style={{ fontFamily:"'Playfair Display',serif", fontSize:18, color:'#16243A', marginBottom:8 }}>No churches yet</div>
              <div style={{ fontSize:14, color:'#A89D8E', fontWeight:300 }}>Accounts appear here as soon as someone signs up.</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr className="bg-cream">
                  <th className="table-header">Church</th>
                  <th className="table-header hidden md:table-cell">Admin</th>
                  <th className="table-header">Status</th>
                  <th className="table-header hidden sm:table-cell">Ends</th>
                  <th className="table-header hidden lg:table-cell">Activity</th>
                  <th className="table-header text-right">Actions</th>
                </tr></thead>
                <tbody>
                  {orgs.map((org) => (
                    <tr key={org.id} className="table-row align-top">
                      <td className="table-cell">
                        <div className="font-medium text-navy-900 text-sm">{org.name}</div>
                        <div style={{ fontSize:12, color:'#A89D8E' }}>/{org.slug}</div>
                      </td>
                      <td className="table-cell hidden md:table-cell text-navy-500 text-sm">{org.admin_email}</td>
                      <td className="table-cell">
                        <span className={`badge text-[11px] capitalize ${STATUS_BADGE[org.subscription_status] || 'badge-navy'}`}>{org.subscription_status}</span>
                      </td>
                      <td className="table-cell hidden sm:table-cell text-navy-500 text-sm">{org.subscription_end_date || '—'}</td>
                      <td className="table-cell hidden lg:table-cell" style={{ fontSize:12, color:'#7A6E60', fontWeight:300, whiteSpace:'nowrap' }}>
                        {org.counts.people} people · {org.counts.services} services · {org.counts.checkins} check-ins
                      </td>
                      <td className="table-cell">
                        <div className="flex flex-wrap gap-2 justify-end">
                          <button onClick={() => patchOrg(org.id, 'extend_30_days')} className="btn btn-secondary text-xs py-1.5 px-3" disabled={busy === `${org.id}:extend_30_days`}>+30 days</button>
                          <button onClick={() => patchOrg(org.id, 'activate_annual')} className="btn btn-secondary text-xs py-1.5 px-3" disabled={busy === `${org.id}:activate_annual`}>Annual</button>
                          <button onClick={() => patchOrg(org.id, 'mark_expired')} className="btn btn-secondary text-xs py-1.5 px-3" disabled={busy === `${org.id}:mark_expired`}>Expire</button>
                          <button onClick={() => { setResetOrgId(org.id); setDeleteOrgId(null); setConfirmText(''); }} className="btn btn-ghost text-xs py-1.5 px-3">Reset data</button>
                          <button onClick={() => { setDeleteOrgId(org.id); setResetOrgId(null); setConfirmText(''); }} className="btn btn-ghost text-xs py-1.5 px-3 text-red-500">Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Destructive-action confirmation — one dialog for both reset and delete
          so the two flows feel the same and both require typing to confirm. */}
      {(resetOrgId || deleteOrgId) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => { setResetOrgId(null); setDeleteOrgId(null); setConfirmText(''); }}>
          <div className="absolute inset-0 bg-navy-900/60 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-soft-xl w-full max-w-md animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="px-7 pt-7 pb-5">
              <div style={{ width:44, height:44, borderRadius:12, background:'#FDECEA', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:16 }}>
                <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
              </div>
              <h2 style={{ fontFamily:"'Playfair Display',serif", fontSize:20, color:'#16243A', marginBottom:8 }}>
                {deleteOrgId ? 'Delete this church?' : 'Reset church data?'}
              </h2>
              <p style={{ fontSize:14, color:'#7A6E60', fontWeight:300, lineHeight:1.7, marginBottom:6 }}>
                {deleteOrgId
                  ? <>This permanently removes <strong style={{ color:'#16243A', fontWeight:500 }}>{targetOrg?.name}</strong> and everything in it. It cannot be undone.</>
                  : <>This clears people, services, check-ins and email logs for <strong style={{ color:'#16243A', fontWeight:500 }}>{targetOrg?.name}</strong>. The account itself stays.</>}
              </p>
              <p style={{ fontSize:13, color:'#7A6E60', fontWeight:300, marginBottom:10 }}>
                Type <strong style={{ color:'#16243A', fontWeight:500 }}>{deleteOrgId ? 'DELETE' : 'I AM SURE'}</strong> to confirm.
              </p>
              <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} className="input" placeholder={deleteOrgId ? 'DELETE' : 'I AM SURE'} autoFocus />
            </div>
            <div className="px-7 pb-7 flex gap-3">
              <button className="btn btn-secondary flex-1" onClick={() => { setResetOrgId(null); setDeleteOrgId(null); setConfirmText(''); }}>Cancel</button>
              <button className="btn btn-danger flex-1"
                disabled={confirmText !== (deleteOrgId ? 'DELETE' : 'I AM SURE') || busy !== null}
                onClick={deleteOrgId ? deleteOrg : resetOrg}>
                {busy ? 'Working…' : deleteOrgId ? 'Delete church' : 'Reset data'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
