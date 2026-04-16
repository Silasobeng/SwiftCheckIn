'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

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

export default function OwnerPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionData | null>(null);
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [resetOrgId, setResetOrgId] = useState<string | null>(null);
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

  const deleteOrg = async (orgId: string) => {
    if (!window.confirm('Delete this church completely? This cannot be undone.')) return;
    setBusy(`${orgId}:delete`);
    const res = await fetch(`/api/owner/orgs?orgId=${encodeURIComponent(orgId)}&confirm=DELETE`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) setError(data.error || 'Delete failed.');
    else { setMessage('Church deleted.'); await load(); }
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

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading owner dashboard...</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex justify-between items-center gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Developer Portal</h1>
            <p className="text-gray-500 text-sm">Platform owner view for managing churches.</p>
          </div>
          <div className="flex gap-3 items-center text-sm">
            <a href="/admin" className="text-indigo-600 hover:underline">Back to Church Admin</a>
            <button onClick={() => load()} className="btn btn-secondary">Refresh</button>
          </div>
        </div>

        {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>}
        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="card"><div className="text-3xl font-bold text-indigo-600">{stats.total}</div><div className="text-sm text-gray-500">Total churches</div></div>
          <div className="card"><div className="text-3xl font-bold text-emerald-600">{stats.active}</div><div className="text-sm text-gray-500">Active</div></div>
          <div className="card"><div className="text-3xl font-bold text-amber-600">{stats.trial}</div><div className="text-sm text-gray-500">Trial</div></div>
          <div className="card"><div className="text-3xl font-bold text-red-600">{stats.expired}</div><div className="text-sm text-gray-500">Expired</div></div>
        </div>

        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-3 pr-3">Church</th>
                <th className="py-3 pr-3">Admin</th>
                <th className="py-3 pr-3">Status</th>
                <th className="py-3 pr-3">Ends</th>
                <th className="py-3 pr-3">Counts</th>
                <th className="py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((org) => (
                <tr key={org.id} className="border-b last:border-0 align-top">
                  <td className="py-4 pr-3">
                    <div className="font-medium text-gray-900">{org.name}</div>
                    <div className="text-gray-500">/{org.slug}</div>
                  </td>
                  <td className="py-4 pr-3 text-gray-600">{org.admin_email}</td>
                  <td className="py-4 pr-3 capitalize">{org.subscription_status}</td>
                  <td className="py-4 pr-3">{org.subscription_end_date || '—'}</td>
                  <td className="py-4 pr-3 text-gray-600">P:{org.counts.people} · S:{org.counts.services} · C:{org.counts.checkins}</td>
                  <td className="py-4">
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => patchOrg(org.id, 'extend_30_days')} className="btn btn-secondary" disabled={busy === `${org.id}:extend_30_days`}>+30 days</button>
                      <button onClick={() => patchOrg(org.id, 'activate_annual')} className="btn btn-secondary" disabled={busy === `${org.id}:activate_annual`}>Annual</button>
                      <button onClick={() => patchOrg(org.id, 'mark_expired')} className="btn btn-danger" disabled={busy === `${org.id}:mark_expired`}>Expire</button>
                      <button onClick={() => { setResetOrgId(org.id); setConfirmText(''); }} className="btn btn-secondary">Reset data</button>
                      <button onClick={() => deleteOrg(org.id)} className="btn btn-danger" disabled={busy === `${org.id}:delete`}>Delete church</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {resetOrgId && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-6 w-full max-w-md space-y-4">
              <h2 className="text-xl font-semibold">Reset church data</h2>
              <p className="text-sm text-gray-600">This clears people, services, check-ins, and email logs for this church. Type <strong>I AM SURE</strong> to continue.</p>
              <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} className="input" placeholder="I AM SURE" />
              <div className="flex justify-end gap-3">
                <button className="btn btn-secondary" onClick={() => setResetOrgId(null)}>Cancel</button>
                <button className="btn btn-danger" disabled={confirmText !== 'I AM SURE' || busy === `${resetOrgId}:reset`} onClick={resetOrg}>Reset</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
