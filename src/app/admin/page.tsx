'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Service, Person, Checkin, AppSettings, EmailTemplate, Giving, GivingType, PaymentMethod, Organization, Group, GroupCategory, PersonGroup } from '@/types';
import { calculateAge, getAgeGroup, getGreeting } from '@/lib/utils';
import { tzFormatter, timeFormatter, monthKeyOf, dayKeyOf, prevMonthKey, monthRangeLabel, yearKeyOf, yearRangeLabel } from '@/lib/monthWindow';
import { StackedTrend, RankedBars, OrdinalBars, SplitBar, SingleTrend } from '@/components/Charts';
import WhatsAppSupport from '@/components/WhatsAppSupport';

type Tab = 'dashboard' | 'services' | 'people' | 'giving' | 'analytics' | 'emails' | 'settings';

// Hoisted to module scope because it's now drawn in two places — the desktop
// tab strip and the mobile hamburger menu — rather than recreated inline in
// whichever one happened to render first.
const TAB_ICONS: Record<Tab, JSX.Element> = {
  dashboard: <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>,
  services: <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>,
  people: <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-4a4 4 0 10-4-4 4 4 0 004 4zm6 0a4 4 0 10-4-4"/>,
  giving: <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .672-3 1.5S10.343 11 12 11s3 .672 3 1.5-1.343 1.5-3 1.5m0-6V6m0 8v1.5m0-9.5a9 9 0 100 18 9 9 0 000-18z"/>,
  analytics: <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2"/>,
  emails: <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>,
  settings: <><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></>,
};
const TAB_ORDER: Tab[] = ['dashboard','services','people','giving','analytics','emails','settings'];

// Module scope, not component scope: this is a static map, and re-creating it
// each render would make it a fresh object every time — defeating the
// useMemo that lists it as a dependency.
const GIVING_TYPE_LABELS: Record<GivingType,string> = { tithe:'Tithe', offering:'Offering', seed:'Seed', pledge:'Pledge', other:'Other' };

// Timezones a church using this is plausibly in. A full IANA list is ~600 rows
// and unusable in a dropdown; the API validates whatever is sent against the
// platform's own zone database, so this list is a convenience, not the guard.
const TIMEZONES = [
  { value: 'Africa/Accra',        label: 'Accra — Ghana (GMT)' },
  { value: 'Africa/Lagos',        label: 'Lagos — Nigeria (GMT+1)' },
  { value: 'Africa/Abidjan',      label: 'Abidjan — Côte d’Ivoire (GMT)' },
  { value: 'Africa/Nairobi',      label: 'Nairobi — Kenya (GMT+3)' },
  { value: 'Africa/Johannesburg', label: 'Johannesburg — South Africa (GMT+2)' },
  { value: 'Africa/Cairo',        label: 'Cairo — Egypt (GMT+2)' },
  { value: 'Europe/London',       label: 'London — United Kingdom' },
  { value: 'America/New_York',    label: 'New York — US Eastern' },
  { value: 'America/Chicago',     label: 'Chicago — US Central' },
  { value: 'America/Los_Angeles', label: 'Los Angeles — US Pacific' },
  { value: 'America/Toronto',     label: 'Toronto — Canada Eastern' },
  { value: 'Asia/Dubai',          label: 'Dubai — UAE (GMT+4)' },
  { value: 'Australia/Sydney',    label: 'Sydney — Australia Eastern' },
  { value: 'UTC',                 label: 'UTC' },
];

// Age bands in age order — the ordinal ramp is only meaningful if the rows are
// rendered in the scale's own order, never sorted by count. Must stay in step
// with getAgeGroup() in lib/utils.
const AGE_BANDS = ['Under 20', '20-29', '30-39', '40-49', '50-59', '60+'];

interface SessionData {
  orgId: string; orgName: string; orgSlug: string; adminEmail: string;
  subscriptionStatus: string; subscriptionEndDate: string | null; isSubscriptionActive: boolean;
}

const EMPTY_TEMPLATES: Record<'welcome'|'birthday'|'missed', {subject:string;body:string}> = {
  welcome:  { subject: 'Welcome to {ORG_NAME}!',         body: 'We are so glad you joined us today!\n\nWe look forward to seeing you again soon.' },
  birthday: { subject: 'Happy Birthday from {ORG_NAME}!', body: 'Wishing you a blessed and joyful birthday! May this new year of your life be filled with God\'s grace and favour.' },
  missed:   { subject: 'We Miss You!',                    body: 'We noticed you have missed the last couple of gatherings. We hope everything is well with you.\n\nWe would love to see you again soon!' },
};

/* ─── Edit Person Modal ─────────────────────────────────────────────────── */

function EditPersonModal({ person, categories, groups, personGroupIds, onClose, onSaved }: { person: Person; categories: GroupCategory[]; groups: Group[]; personGroupIds: string[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    full_name: person.full_name || '', phone: person.phone || '', email: person.email || '',
    gender: person.gender || '', date_of_birth: person.date_of_birth || '', role: person.role || 'visitor',
    occupation: person.occupation || '', company: person.company || '',
    location: person.location || '', how_found_us: person.how_found_us || '', notes: person.notes || '',
  });
  // One slot per category — a person can hold at most one group within any
  // given category (one Cell Group, one Department) but one across each.
  const [groupByCategory, setGroupByCategory] = useState<Record<string,string>>(() => {
    const map: Record<string,string> = {};
    for (const gid of personGroupIds) {
      const g = groups.find(x=>x.id===gid);
      if (g) map[g.category_id] = g.id;
    }
    return map;
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string|null>(null);
  const set = (k:string) => (e:React.ChangeEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>) => setForm(p=>({...p,[k]:e.target.value}));

  const handleSave = async () => {
    setSaving(true); setErr(null);
    try {
      const res = await fetch('/api/people', { method:'PATCH', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ personId: person.id, updates: { ...form,
          email: form.email.trim()||null, date_of_birth: form.date_of_birth||null,
          gender: form.gender||null, occupation: form.occupation.trim()||null,
          company: form.company.trim()||null, location: form.location.trim()||null,
          how_found_us: form.how_found_us.trim()||null, notes: form.notes.trim()||null,
        }})});
      const data = await res.json();
      if (!res.ok) { setErr(data.error||'Could not save.'); return; }

      const groupIds = Object.values(groupByCategory).filter(Boolean);
      const gRes = await fetch('/api/people-groups', { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ personId: person.id, groupIds }) });
      if (!gRes.ok) { const gData = await gRes.json(); setErr(gData.error||'Profile saved, but groups could not be updated.'); return; }

      onSaved(); onClose();
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-navy-900/60 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto animate-scale-in" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-navy-100 sticky top-0 bg-white rounded-t-2xl z-10">
          <div>
            <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:20,color:'#16243A',fontWeight:400}}>Edit Profile</h2>
            <p style={{fontSize:13,color:'#A89D8E',fontWeight:300,marginTop:2}}>{person.full_name}</p>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-icon text-navy-400">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {err && <div className="alert alert-error"><span>{err}</span></div>}

          <fieldset>
            <legend className="text-[11px] font-bold uppercase tracking-widest text-navy-400 mb-3">Core Info</legend>
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-navy-700 mb-1.5">Full Name</label><input className="input" value={form.full_name} onChange={set('full_name')} /></div>
                <div><label className="block text-sm font-medium text-navy-700 mb-1.5">Phone</label><input className="input" value={form.phone} onChange={set('phone')} /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-navy-700 mb-1.5">Role</label>
                  <select className="select" value={form.role} onChange={set('role')}>
                    <option value="visitor">Visitor</option>
                    <option value="member">Member</option>
                    <option value="leader">Leader</option>
                  </select>
                </div>
                <div><label className="block text-sm font-medium text-navy-700 mb-1.5">Gender</label>
                  <select className="select" value={form.gender} onChange={set('gender')}>
                    <option value="">Not set</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>
              </div>
              {categories.length === 0 ? (
                <p className="text-xs text-navy-400">No fields set up yet — add one under Settings.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {categories.map(cat => {
                    const catGroups = groups.filter(g=>g.category_id===cat.id);
                    return (
                      <div key={cat.id}>
                        <label className="block text-sm font-medium text-navy-700 mb-1.5">{cat.name}</label>
                        <select className="select" value={groupByCategory[cat.id]||''}
                          onChange={e=>setGroupByCategory(m=>({...m,[cat.id]:e.target.value}))}>
                          <option value="">Not assigned</option>
                          {catGroups.map(g=>(<option key={g.id} value={g.id}>{g.name}</option>))}
                        </select>
                        {catGroups.length===0 && <p className="text-xs text-navy-400 mt-1.5">No {cat.name.toLowerCase()}s yet.</p>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-[11px] font-bold uppercase tracking-widest text-navy-400 mb-3">Contact & Birthday</legend>
            <div className="space-y-3">
              <div><label className="block text-sm font-medium text-navy-700 mb-1.5">Email Address</label>
                <input className="input" type="email" value={form.email} onChange={set('email')} placeholder="e.g. name@gmail.com" />
              </div>
              <div>
                <label className="block text-sm font-medium text-navy-700 mb-1.5">
                  Date of Birth
                  <span className="ml-2 text-[11px] font-normal text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Needed for birthday emails</span>
                </label>
                <input className="input" type="date" value={form.date_of_birth} onChange={set('date_of_birth')} />
                {form.date_of_birth && <p className="text-xs text-navy-400 mt-1.5">Age: {calculateAge(form.date_of_birth)} years</p>}
              </div>
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-[11px] font-bold uppercase tracking-widest text-navy-400 mb-3">Background</legend>
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-navy-700 mb-1.5">Occupation</label><input className="input" value={form.occupation} onChange={set('occupation')} placeholder="e.g. Teacher" /></div>
                <div><label className="block text-sm font-medium text-navy-700 mb-1.5">Company</label><input className="input" value={form.company} onChange={set('company')} placeholder="e.g. Vodafone" /></div>
              </div>
              <div><label className="block text-sm font-medium text-navy-700 mb-1.5">Neighbourhood / Location</label><input className="input" value={form.location} onChange={set('location')} placeholder="e.g. East Legon" /></div>
              <div>
                <label className="block text-sm font-medium text-navy-700 mb-1.5">How They Found Us</label>
                <select className="select" value={form.how_found_us} onChange={set('how_found_us')}>
                  <option value="">Select one…</option>
                  <option value="Friend or family">Friend or family</option>
                  <option value="Social media">Social media</option>
                  <option value="Walked past / neighbourhood">Walked past / neighbourhood</option>
                  <option value="Online search">Online search</option>
                  <option value="Invited by member">Invited by member</option>
                  <option value="Flyer or poster">Flyer or poster</option>
                  <option value="Event or programme">Event or programme</option>
                  <option value="Radio or TV">Radio or TV</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-[11px] font-bold uppercase tracking-widest text-navy-400 mb-3">Notes</legend>
            <textarea className="textarea" value={form.notes} onChange={set('notes')} placeholder="Private admin notes…" rows={3} />
          </fieldset>
        </div>

        <div className="px-6 py-4 border-t border-navy-100 flex gap-3 sticky bottom-0 bg-white rounded-b-2xl">
          <button onClick={onClose} className="btn btn-secondary flex-1">Cancel</button>
          <button onClick={handleSave} className="btn btn-primary flex-1" disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Page ─────────────────────────────────────────────────────────── */

export default function AdminPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionData|null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [services, setServices] = useState<Service[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [settings, setSettings] = useState<AppSettings|null>(null);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [savingTemplate, setSavingTemplate] = useState<string|null>(null);
  const [sendingCustom, setSendingCustom] = useState(false);
  const [message, setMessage] = useState<string|null>(null);
  const [error, setError] = useState<string|null>(null);
  const [customEmail, setCustomEmail] = useState({audience:'all',subject:'',message:''});
  const [editingPerson, setEditingPerson]     = useState<Person|null>(null);
  const [serviceFormOpen, setServiceFormOpen] = useState(false);
  const [editingService, setEditingService]   = useState<Service|null>(null);
  const [serviceForm, setServiceForm]         = useState({
    title:'', service_date:'', service_time:'', theme:'', scripture:'', message:''
  });
  const [savingService, setSavingService]     = useState(false);
  const [sendingReportId, setSendingReportId] = useState<string|null>(null);
  const [reportService, setReportService] = useState<Service|null>(null);
  const [reportRecipient, setReportRecipient] = useState('');
  // Code-gated delete: one modal reused for services, people and giving.
  const [deleteTarget, setDeleteTarget] = useState<{kind:'services'|'people'|'giving'|'groups'|'group-categories'; id:string; label:string}|null>(null);
  const [deleteCode, setDeleteCode] = useState('');
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [peopleSearch, setPeopleSearch] = useState('');
  const [peopleRoleFilter, setPeopleRoleFilter] = useState<'all'|'member'|'leader'|'visitor'>('all');
  const [peopleGroupFilter, setPeopleGroupFilter] = useState<string>('all');
  // Rendering every matching row unconditionally was fine for a few dozen
  // people and got visibly heavy for a church with a few hundred — every
  // row is a full <tr> with several cells, buttons, and inline styles, and
  // the whole table gets reconciled every 8s poll while the kiosk is open.
  // Paginated purely on the client: the full list still comes from one
  // fetch (Dashboard/Analytics need the whole congregation for their
  // stats), only what's painted to the DOM is capped.
  const [peoplePage, setPeoplePage] = useState(1);
  const PEOPLE_PAGE_SIZE = 50;
  const [selectedPersonIds, setSelectedPersonIds] = useState<Set<string>>(new Set());
  const [bulkAssignGroupId, setBulkAssignGroupId] = useState('');
  const [bulkAssigning, setBulkAssigning] = useState(false);
  const [infoService, setInfoService] = useState<Service|null>(null);
  const [infoTab, setInfoTab] = useState<'summary'|'attendance'|'followup'|'giving'>('summary');
  const [presentFilter, setPresentFilter] = useState<'all'|'leader'|'member'|'firsttime'|'returning'>('all');
  // Quick "was so-and-so here today" lookup, independent of which info tab
  // is open — searches both present and absent (members/leaders) so it
  // gives a real verdict either way, not just "not found in this list."
  const [presentSearch, setPresentSearch] = useState('');
  const [absentGroupCategoryId, setAbsentGroupCategoryId] = useState<string>('');
  const [giving, setGiving] = useState<Giving[]>([]);
  const [givingFormOpen, setGivingFormOpen] = useState(false);
  const [savingGiving, setSavingGiving] = useState(false);
  const [sendingReceiptId, setSendingReceiptId] = useState<string|null>(null);
  const [givingPersonQuery, setGivingPersonQuery] = useState('');
  const [givingForm, setGivingForm] = useState({
    person_id: '', giver_name: '', giver_email: '', amount: '',
    giving_type: 'offering' as GivingType, giving_type_other: '',
    payment_method: 'cash' as PaymentMethod, notes: '',
  });
  const [branding, setBranding] = useState({
  org_name: '',
  tagline:'', host_names:'', address:'', phone:'', email:'', logo_url:'', cover_image_url:'', brand_color:'#102a43', kiosk_welcome_heading:'', kiosk_welcome_subtext:'', timezone:'' });
  const [smsSettings, setSmsSettings] = useState({ sms_welcome_enabled: false, sms_birthday_enabled: false, sms_missed_enabled: false, sms_credits: 0, sms_sender_id: '' });
  const [savingSms, setSavingSms] = useState(false);
  // Separate from smsSettings.sms_sender_id, which tracks whatever's
  // currently typed in the field (saved or not). This tracks what's
  // actually in the database — the one that matters for "who will this
  // send as," since typing a name and forgetting to hit Save is exactly
  // the trap that made it look like the whole feature was broken.
  const [savedSenderId, setSavedSenderId] = useState('');
  const [smsTopupAmount, setSmsTopupAmount] = useState('');
  const [toppingUp, setToppingUp] = useState(false);
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [broadcastFilter, setBroadcastFilter] = useState('all');
  // Hand-picked recipients for the 'specific' filter — a church texting just
  // a few volunteers or leaders shouldn't have to make a permanent Group
  // first just to reach them once.
  const [specificRecipientIds, setSpecificRecipientIds] = useState<Set<string>>(new Set());
  const [specificSearch, setSpecificSearch] = useState('');
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState<{ delivered: number; failed: number; credits_used: number } | null>(null);
  const [broadcasts, setBroadcasts] = useState<import('@/types').SmsBroadcast[]>([]);
  const [smsUsage, setSmsUsage] = useState<Record<string, number>>({});
  const [categories, setCategories] = useState<GroupCategory[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [personGroups, setPersonGroups] = useState<PersonGroup[]>([]);
  const [groupForm, setGroupForm] = useState<{editingId:string|null; categoryId:string; name:string; leader_person_id:string}>({editingId:null, categoryId:'', name:'', leader_person_id:''});
  const [newCategoryName, setNewCategoryName] = useState('');
  const [savingCategory, setSavingCategory] = useState(false);
  const [seedingDepartments, setSeedingDepartments] = useState(false);
  const [savingGroup, setSavingGroup] = useState(false);
  const [savingBranding, setSavingBranding] = useState(false);
  const [uploading, setUploading] = useState<'logo'|'cover'|null>(null);
  // The church's own timezone drives "this month / today", not the device clock.
  const [orgTimezone, setOrgTimezone] = useState('Africa/Accra');
  const [kioskCode, setKioskCode] = useState('');
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date|null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [savingKioskCode, setSavingKioskCode] = useState(false);

  useEffect(() => {
    fetch('/api/auth/session').then(r=>r.json()).then(d=>{ if(!d.authenticated) router.push('/login'); else { setSession(d.session); setLoading(false); } }).catch(()=>router.push('/login'));
  }, [router]);

  // Billing checkout state and the ?billing=success|failed round trip from
  // Paystack's redirect. Read once on mount, then the URL is cleaned so a
  // page refresh doesn't replay the same toast.
  const [billingBusy, setBillingBusy] = useState<'monthly'|'annual'|null>(null);
  const [billingError, setBillingError] = useState('');
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const billing = params.get('billing');
    if (billing === 'success') { setMessage('Payment received — subscription active.'); router.replace('/admin'); }
    else if (billing === 'failed') { setError('Payment did not go through. No charge was made — try again.'); router.replace('/admin'); }
  }, [router]);

  // The ?tab=settings&topup=success|failed round trip from an SMS top-up
  // checkout — same idea as billing above, plus actually landing on the
  // Settings tab, since that's the only place the credit balance is shown
  // and a church had no way to tell a top-up went through before this.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('tab') === 'settings') setTab('settings');
    const topup = params.get('topup');
    if (topup === 'success') {
      const credits = params.get('credits');
      setMessage(credits ? `Payment received — ${credits} SMS credits added.` : 'Payment received — your SMS balance has been updated.');
      router.replace('/admin?tab=settings');
    } else if (topup === 'failed') {
      setError('SMS top-up did not go through. No charge was made — try again.');
      router.replace('/admin?tab=settings');
    }
  }, [router]);

  // Whole days until the trial ends, in the church's own timezone — comparing
  // date keys rather than subtracting timestamps, so "ends tomorrow" doesn't
  // flip to "ends today" purely because it's late in the evening.
  const trialDaysLeft = useMemo(() => {
    if (!session?.subscriptionEndDate) return null;
    const end = new Date(`${session.subscriptionEndDate}T00:00:00Z`).getTime();
    const todayKey = dayKeyOf(tzFormatter(orgTimezone), new Date());
    const start = new Date(`${todayKey}T00:00:00Z`).getTime();
    if (Number.isNaN(end) || Number.isNaN(start)) return null;
    return Math.round((end - start) / (24*60*60*1000));
  }, [session?.subscriptionEndDate, orgTimezone]);

  const startCheckout = async (plan: 'monthly'|'annual') => {
    setBillingBusy(plan); setBillingError('');
    try {
      const res = await fetch('/api/billing/checkout', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ plan }) });
      const data = await res.json();
      if (!res.ok || !data.authorization_url) { setBillingError(data.error || 'Could not start checkout.'); setBillingBusy(null); return; }
      window.location.href = data.authorization_url;
    } catch {
      setBillingError('Could not reach the payment service. Check your connection.');
      setBillingBusy(null);
    }
  };

  const loadData = useCallback(async (opts?: { background?: boolean }) => {
    if (!session) return;
    const background = opts?.background === true;
    if (!background) setError(null);

    const safeFetch = async <T,>(url: string, fallback: T): Promise<T> => {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) return fallback;
        return await res.json();
      } catch {
        return fallback;
      }
    };

    const [sD, pD, cD, stD, tD, gD, grD, catD, pgD] = await Promise.all([
      safeFetch('/api/services', { services: [] }),
      safeFetch('/api/people', { people: [] }),
      safeFetch('/api/checkin', { checkins: [] }),
      safeFetch<{settings: (AppSettings & {organization?: Organization}) | null}>('/api/settings', { settings: null }),
      safeFetch('/api/email/templates', { templates: [] }),
      safeFetch('/api/giving', { giving: [] }),
      safeFetch('/api/groups', { groups: [] }),
      safeFetch('/api/group-categories', { categories: [] }),
      safeFetch('/api/people-groups', { memberships: [] }),
    ]);

    // Live data always refreshes.
    setServices(sD.services||[]); setPeople(pD.people||[]); setCheckins(cD.checkins||[]); setSettings(stD.settings||null); setTemplates(tD.templates||[]); setGiving(gD.giving||[]); setGroups(grD.groups||[]); setCategories(catD.categories||[]); setPersonGroups(pgD.memberships||[]);
    if (stD.settings?.organization?.timezone) setOrgTimezone(stD.settings.organization.timezone);
    setLastUpdatedAt(new Date());

    // Form-bound fields are only (re)seeded on a foreground load. A background
    // poll must never overwrite what the admin is mid-way through typing in
    // Settings, nor flash a connection error on a transient hiccup.
    if (!background) {
      setKioskCode(stD.settings?.kiosk_access_code || '');
      const org = stD.settings?.organization;
      if (org) {
        setBranding({
          org_name: org.name || '',
          tagline:org.tagline||'', host_names:org.host_names||'', address:org.address||'', phone:org.phone||'', email:org.email||'', logo_url:org.logo_url||'', cover_image_url:org.cover_image_url||'', brand_color:org.brand_color||'#102a43', kiosk_welcome_heading:org.kiosk_welcome_heading||'', kiosk_welcome_subtext:org.kiosk_welcome_subtext||'', timezone:org.timezone||'' });
        setSmsSettings({
          sms_welcome_enabled:  org.sms_welcome_enabled  ?? false,
          sms_birthday_enabled: org.sms_birthday_enabled ?? false,
          sms_missed_enabled:   org.sms_missed_enabled   ?? false,
          sms_credits:          org.sms_credits          ?? 0,
          sms_sender_id:        org.sms_sender_id        ?? '',
        });
        setSavedSenderId(org.sms_sender_id ?? '');
      }
      if (!stD.settings) setError('Some dashboard data could not be refreshed — check your connection.');
    }
  }, [session]);

  // The fast 8s poll only needs to catch what kiosk activity actually
  // changes — new check-ins, new walk-up registrations, and whether someone
  // closed the kiosk from another device. Templates, giving, groups, and
  // categories only change from inside Settings/People/Giving, never from
  // the kiosk, so refetching them every 8 seconds was nine round-trips to
  // Supabase for work that needed three.
  const loadLiveData = useCallback(async () => {
    if (!session) return;
    const safeFetch = async <T,>(url: string, fallback: T): Promise<T> => {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) return fallback;
        return await res.json();
      } catch {
        return fallback;
      }
    };
    const [cD, stD, pD] = await Promise.all([
      safeFetch('/api/checkin', { checkins: [] }),
      safeFetch<{settings: (AppSettings & {organization?: Organization}) | null}>('/api/settings', { settings: null }),
      safeFetch('/api/people', { people: [] }),
    ]);
    setCheckins(cD.checkins || []);
    setPeople(pD.people || []);
    if (stD.settings) setSettings(stD.settings);
    setLastUpdatedAt(new Date());
  }, [session]);

  useEffect(() => { if (session) loadData(); }, [session,loadData]);
  // Faster while check-in is actually open — that's the moment someone is
  // watching this screen and wants to see a number move — and paused
  // whenever the tab isn't visible, so a browser left open overnight doesn't
  // spend the next 12 hours quietly polling. Coming back to the tab triggers
  // an immediate refresh rather than waiting out the interval.
  useEffect(() => {
    if (!session) return;
    const kioskOpen = settings?.kiosk_open === true;
    const intervalMs = kioskOpen ? 8000 : 30000;
    const poll = kioskOpen ? loadLiveData : () => loadData({background:true});
    let id: number|null = null;
    const start = () => { if (id===null) id = window.setInterval(poll, intervalMs); };
    const stop = () => { if (id!==null) { window.clearInterval(id); id = null; } };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') { poll(); start(); }
      else stop();
    };
    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => { stop(); document.removeEventListener('visibilitychange', onVisibility); };
  }, [session, settings?.kiosk_open, loadData, loadLiveData]);
  // A light second-hand for "Updated Xs ago" — visual only, never fetches.
  useEffect(() => {
    if (!session) return;
    const id = window.setInterval(()=>setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [session]);
  useEffect(() => { if (!message&&!error) return; const id=window.setTimeout(()=>{setMessage(null);setError(null);},4000); return ()=>window.clearTimeout(id); }, [message,error]);

  const handleLogout = async () => { await fetch('/api/auth/logout',{method:'POST'}); router.push('/login'); };

  const toggleKiosk = async () => {
    if (!settings) return; setMessage(null); setError(null);
    const res=await fetch('/api/settings',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({kiosk_open:!settings.kiosk_open})});
    const data=await res.json(); if(!res.ok){setError(data.error||'Could not update.');return;} setMessage(settings.kiosk_open?'Check-in closed.':'Check-in opened.'); loadData();
  };

  const openNewService = () => {
    const today = new Date().toISOString().split('T')[0];
    setEditingService(null);
    setServiceForm({ title:'Sunday Service', service_date:today, service_time:'', theme:'', scripture:'', message:'' });
    setServiceFormOpen(true);
  };

  const openEditService = (s: Service) => {
    setEditingService(s);
    setServiceForm({
      title:        s.title        || '',
      service_date: s.service_date || '',
      service_time: s.service_time || '',
      theme:        s.theme        || '',
      scripture:    s.scripture    || '',
      message:      s.message      || '',
    });
    setServiceFormOpen(true);
  };

  const saveService = async () => {
    if (!serviceForm.title.trim() || !serviceForm.service_date) {
      setError('Service name and date are required.'); return;
    }
    setSavingService(true); setMessage(null); setError(null);
    try {
      if (editingService) {
        // Update existing
        const res = await fetch('/api/services', {
          method:'PATCH', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ serviceId: editingService.id, updates: {
            title:        serviceForm.title.trim(),
            service_date: serviceForm.service_date,
            service_time: serviceForm.service_time || null,
            theme:        serviceForm.theme.trim()    || null,
            scripture:    serviceForm.scripture.trim()|| null,
            message:      serviceForm.message.trim()  || null,
          }})
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error||'Could not save.'); return; }
        setMessage('Service updated.');
      } else {
        // Create new
        const res = await fetch('/api/services', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({
            title:        serviceForm.title.trim(),
            service_date: serviceForm.service_date,
            service_time: serviceForm.service_time || null,
            theme:        serviceForm.theme.trim()    || null,
            scripture:    serviceForm.scripture.trim()|| null,
            message:      serviceForm.message.trim()  || null,
          })
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error||'Could not create.'); return; }
        setMessage('Service created and set as active.');
      }
      setServiceFormOpen(false);
      loadData();
    } finally { setSavingService(false); }
  };

  const setActiveService = async (id:string) => {
    setMessage(null); setError(null);
    const res=await fetch('/api/services',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({serviceId:id,setActive:true})});
    const data=await res.json(); if(!res.ok){setError(data.error||'Could not activate.');return;} setMessage('Current service updated.'); loadData();
  };

  const openReportModal = (s: Service) => {
    // Prefill with the last address used on this browser, else the account email.
    const remembered = typeof window !== 'undefined' ? window.localStorage.getItem('swiftcheckin_report_email') : null;
    setReportRecipient(remembered || session?.adminEmail || '');
    setReportService(s);
  };

  const sendReport = async () => {
    if (!reportService) return;
    const recipient = reportRecipient.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) { setError('Enter a valid email address.'); return; }
    setSendingReportId(reportService.id); setMessage(null); setError(null);
    try {
      const res = await fetch(`/api/services/${reportService.id}/email-report`, {
        method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ recipient }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error||'Could not send report.'); return; }
      if (typeof window !== 'undefined') window.localStorage.setItem('swiftcheckin_report_email', recipient);
      setMessage(`Report sent to ${data.recipient} — ${data.count} present, ${data.absent} absent.`);
      setReportService(null);
    } finally { setSendingReportId(null); }
  };

  const saveTemplate = async (type:'welcome'|'birthday'|'missed', subject:string, body:string) => {
    setSavingTemplate(type); setMessage(null); setError(null);
    try {
      const res=await fetch('/api/email/templates',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({templateType:type,subject,body})});
      const data=await res.json(); if(!res.ok){setError(data.error||'Could not save.');return;} setMessage(`${type.charAt(0).toUpperCase()+type.slice(1)} template saved.`); loadData();
    } finally { setSavingTemplate(null); }
  };

  const sendCustomEmail = async () => {
    setSendingCustom(true); setMessage(null); setError(null);
    try {
      const res=await fetch('/api/email/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(customEmail)});
      const data=await res.json(); if(!res.ok){setError(data.error||'Could not send.');return;} setMessage(`Email sent. ${data.sent} delivered, ${data.failed} failed.`); setCustomEmail({audience:'all',subject:'',message:''});
    } finally { setSendingCustom(false); }
  };

  const saveBranding = async () => {
    setSavingBranding(true); setMessage(null); setError(null);
    try {
      const res=await fetch('/api/settings',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(branding)});
      const data=await res.json(); if(!res.ok){setError(data.error||'Could not save.');return;} setMessage('Settings saved.'); loadData();
    } finally { setSavingBranding(false); }
  };

  const saveSmsSettings = async () => {
    setSavingSms(true); setMessage(null); setError(null);
    try {
      const res = await fetch('/api/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(smsSettings) });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Could not save SMS settings.'); return; }
      setSavedSenderId(smsSettings.sms_sender_id);
      setMessage('SMS settings saved.');
    } finally { setSavingSms(false); }
  };

  const loadBroadcasts = async () => {
    try {
      const res = await fetch('/api/sms/broadcast');
      const data = await res.json();
      if (res.ok) setBroadcasts(data.broadcasts || []);
    } catch { /* non-critical */ }
    try {
      const res = await fetch('/api/sms/usage');
      const data = await res.json();
      if (res.ok) setSmsUsage(data.usage || {});
    } catch { /* non-critical */ }
  };

  const sendBroadcast = async () => {
    if (!broadcastMsg.trim()) { setError('Message is required.'); return; }

    const groupId = broadcastFilter.startsWith('group:') ? broadcastFilter.slice(6) : '';
    const estimatedRecipients = broadcastFilter === 'specific'
      ? activePeople.filter(p => specificRecipientIds.has(p.id) && p.phone && !p.sms_opted_out).length
      : activePeople.filter(person => {
          if (!person.phone || person.sms_opted_out) return false;
          if (broadcastFilter === 'members') return person.role === 'member';
          if (broadcastFilter === 'visitors') return person.role === 'visitor';
          if (groupId) return personGroups.some(m => m.person_id === person.id && m.group_id === groupId);
          return true;
        }).length;
    const parts = broadcastMsg.length <= 160 ? 1 : Math.ceil(broadcastMsg.length / 153);
    const estimatedCredits = estimatedRecipients * parts;

    if (broadcastFilter === 'specific' && specificRecipientIds.size === 0) { setError('Select at least one recipient.'); return; }
    if (!estimatedRecipients) { setError('No SMS recipients match this audience.'); return; }
    if (!window.confirm('Send this message to ' + estimatedRecipients + ' people? It will use ' + estimatedCredits + ' SMS credit' + (estimatedCredits === 1 ? '' : 's') + '.')) return;

    setBroadcastSending(true); setBroadcastResult(null); setError(null);
    try {
      const res = await fetch('/api/sms/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: broadcastMsg,
          recipient_filter: broadcastFilter,
          ...(broadcastFilter === 'specific' ? { person_ids: Array.from(specificRecipientIds) } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Broadcast failed.'); return; }
      setBroadcastResult(data);
      setBroadcastMsg('');
      setSpecificRecipientIds(new Set());
      setSmsSettings(s => ({ ...s, sms_credits: s.sms_credits - (data.credits_used || 0) }));
      await loadBroadcasts();
    } finally { setBroadcastSending(false); }
  };

  const initSmsTopup = async () => {
    const amount = parseFloat(smsTopupAmount);
    if (!amount || amount < 5) { setError('Minimum top-up is 5 GHC.'); return; }
    setToppingUp(true); setMessage(null); setError(null);
    try {
      const res  = await fetch('/api/sms/topup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amountGhc: amount }) });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Could not start top-up.'); return; }
      window.location.href = data.authorizationUrl;
    } finally { setToppingUp(false); }
  };

  const saveGroup = async () => {
    const name = groupForm.name.trim();
    if (!name) { setError('Enter a name.'); return; }
    if (!groupForm.categoryId) { setError('Choose a category.'); return; }
    setSavingGroup(true); setMessage(null); setError(null);
    try {
      const leader_person_id = groupForm.leader_person_id || null;
      const res = groupForm.editingId
        ? await fetch('/api/groups', { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ groupId: groupForm.editingId, name, leader_person_id }) })
        : await fetch('/api/groups', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name, categoryId: groupForm.categoryId, leader_person_id }) });
      const data = await res.json();
      if (!res.ok) { setError(data.error||'Could not save.'); return; }
      setMessage(groupForm.editingId ? 'Group updated.' : 'Group added.');
      setGroupForm({ editingId:null, categoryId:groupForm.categoryId, name:'', leader_person_id:'' });
      loadData();
    } finally { setSavingGroup(false); }
  };

  const saveCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) { setError('Enter a name.'); return; }
    setSavingCategory(true); setMessage(null); setError(null);
    try {
      const res = await fetch('/api/group-categories', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name }) });
      const data = await res.json();
      if (!res.ok) { setError(data.error||'Could not save.'); return; }
      setMessage('Category added.');
      setNewCategoryName('');
      loadData();
    } finally { setSavingCategory(false); }
  };

  // Departments repeat across almost every church (Choir, Ushering,
  // Protocol...) in a way cell group names never do, so this is the one
  // place a starter set earns its keep — a one-click head start, not
  // something forced on anyone. Everything it creates is then just an
  // ordinary category and groups, freely renamed or deleted afterward.
  const seedDefaultDepartments = async () => {
    setSeedingDepartments(true); setMessage(null); setError(null);
    try {
      let categoryId = categories.find(c=>c.name.toLowerCase()==='department')?.id;
      if (!categoryId) {
        const res = await fetch('/api/group-categories', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name:'Department' }) });
        const data = await res.json();
        if (!res.ok) { setError(data.error||'Could not create the Department category.'); return; }
        categoryId = data.category.id;
      }

      const defaults = ['Choir', 'Ushering', 'Protocol', 'Media', 'Prayer Team', "Children's Ministry", 'Welfare', 'Security'];
      const existingNames = new Set(groups.filter(g=>g.category_id===categoryId).map(g=>g.name.toLowerCase()));
      const toAdd = defaults.filter(name=>!existingNames.has(name.toLowerCase()));

      let added = 0;
      for (const name of toAdd) {
        const res = await fetch('/api/groups', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name, categoryId }) });
        if (res.ok) added++;
      }

      setMessage(added>0 ? `Added ${added} department${added===1?'':'s'} — rename or delete any you don't use.` : 'You already have all of these.');
      loadData();
    } finally { setSeedingDepartments(false); }
  };

  // Assigning a whole congregation to their real cell groups one edit-form
  // at a time doesn't scale — this lets a filtered, selected batch of people
  // get put into a group in one action. Each person's existing membership in
  // any OTHER category is kept; only their slot in the target group's own
  // category is replaced, same "one per category" rule the edit form follows.
  const bulkAssignToGroup = async () => {
    if (!bulkAssignGroupId || selectedPersonIds.size===0) return;
    const targetGroup = groups.find(g=>g.id===bulkAssignGroupId);
    if (!targetGroup) return;
    setBulkAssigning(true); setMessage(null); setError(null);
    try {
      const ids = Array.from(selectedPersonIds);
      let failed = 0;
      for (const personId of ids) {
        const current = groupsByPersonId[personId]||[];
        const newGroupIds = [
          ...current.filter(g=>g.category_id!==targetGroup.category_id).map(g=>g.id),
          targetGroup.id,
        ];
        const res = await fetch('/api/people-groups', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ personId, groupIds: newGroupIds }) });
        if (!res.ok) failed++;
      }
      setMessage(failed>0 ? `Assigned ${ids.length-failed} of ${ids.length} — ${failed} failed.` : `Assigned ${ids.length} ${ids.length===1?'person':'people'} to ${targetGroup.name}.`);
      setSelectedPersonIds(new Set());
      setBulkAssignGroupId('');
      loadData();
    } finally { setBulkAssigning(false); }
  };

  const saveKioskCode = async () => {
    const code = kioskCode.trim();
    if (code.length > 0 && (code.length < 4 || code.length > 12)) {
      setError('Kiosk code must be 4 to 12 characters.'); return;
    }
    if (code.length > 0 && !/^[a-zA-Z0-9]+$/.test(code)) {
      setError('Kiosk code can only contain letters and numbers.'); return;
    }
    if (code.length === 0 && !window.confirm('Leave this empty? Anyone will be able to unlock the tablet without a code.')) return;

    setSavingKioskCode(true); setMessage(null); setError(null);
    try {
      const res = await fetch('/api/settings',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({kiosk_access_code:code})});
      const data = await res.json();
      if (!res.ok) { setError(data.error||'Could not save the kiosk code.'); return; }
      setMessage(code ? 'Kiosk code updated.' : 'Kiosk code removed.');
      loadData();
    } finally { setSavingKioskCode(false); }
  };

  const uploadBrandingImage = async (kind:'logo'|'cover', file:File|null) => {
    if (!file) return; setUploading(kind); setMessage(null); setError(null);
    try {
      const fd=new FormData(); fd.append('file',file); fd.append('kind',kind);
      const res=await fetch('/api/upload/branding',{method:'POST',body:fd});
      const data=await res.json(); if(!res.ok){setError(data.error||'Upload failed.');return;}
      setBranding(p=>({...p,...(kind==='logo'?{logo_url:data.url}:{cover_image_url:data.url})}));
      setMessage(kind==='logo'?'Logo uploaded. Click Save to keep it.':'Background uploaded. Click Save to keep it.');
    } finally { setUploading(null); }
  };

  const templateMap = useMemo(() => {
    const m={...EMPTY_TEMPLATES};
    for(const t of templates){ if(t.template_type in m) m[t.template_type as 'welcome'|'birthday'|'missed']={subject:t.subject,body:t.body}; }
    return m;
  }, [templates]);

  const [draftTemplates, setDraftTemplates] = useState(EMPTY_TEMPLATES);
  const [expandedTemplate, setExpandedTemplate] = useState<'welcome'|'birthday'|'missed'|null>(null);
  useEffect(() => { setDraftTemplates(templateMap); }, [templateMap]);

  // Everything below this point was plain `const`, recomputed from scratch on
  // every render — including the once-a-second re-render from the "updated Xs
  // ago" clock tick, which has nothing to do with people/checkins/giving. That
  // meant every filter/reduce/sort pass over the full congregation ran 60
  // times a minute regardless of which tab was even open. Now memoized on the
  // data that actually changes it, so the clock tick costs a diff, not a
  // full re-scan of the church.
  const activePeople = useMemo(() => people.filter(p=>!p.archived), [people]);
  // personId -> the Group rows they belong to (across every category). Built
  // once here from the flat membership list rather than re-joined everywhere
  // it's needed.
  const groupsByPersonId = useMemo(() => {
    const map: Record<string, Group[]> = {};
    for (const m of personGroups) {
      const g = groups.find(x=>x.id===m.group_id);
      if (!g) continue;
      (map[m.person_id] ||= []).push(g);
    }
    return map;
  }, [personGroups, groups]);
  const visitors = useMemo(() => activePeople.filter(p=>p.role==='visitor'), [activePeople]);
  const members = useMemo(() => activePeople.filter(p=>p.role!=='visitor'), [activePeople]);
  const activeService = useMemo(() => services.find(s=>s.is_active)||null, [services]);

  // All "today / this month / last month" figures are reckoned in the church's
  // own timezone (see monthWindow), not the device clock, so they roll over
  // correctly and bucket UTC-stored timestamps into the right local month.
  const tzFmt = useMemo(()=>tzFormatter(orgTimezone), [orgTimezone]);
  // Cheap O(1) date formatting — left unmemoized on purpose so the day/month
  // boundary itself stays correct without needing its own tick.
  const today = dayKeyOf(tzFmt, new Date());
  const currentMonthKey = monthKeyOf(tzFmt, new Date());
  const lastMonthKey = prevMonthKey(currentMonthKey);
  const monthOf = (iso?: string|null) => iso ? monthKeyOf(tzFmt, iso) : '';
  const todayCheckins = useMemo(() => checkins.filter(c=>c.checked_in_at && dayKeyOf(tzFmt, c.checked_in_at)===today), [checkins, tzFmt, today]);
  const currentMonthCheckins = useMemo(() => checkins.filter(c=>monthOf(c.checked_in_at)===currentMonthKey), [checkins, tzFmt, currentMonthKey]);
  const lastMonthCheckins = useMemo(() => checkins.filter(c=>monthOf(c.checked_in_at)===lastMonthKey), [checkins, tzFmt, lastMonthKey]);
  const currentMonthUnique = useMemo(() => new Set(currentMonthCheckins.map(c=>c.person_id)).size, [currentMonthCheckins]);
  const ageGroups = useMemo(() => activePeople.reduce<Record<string,number>>((a,p)=>{ if(!p.date_of_birth) return a; const g=getAgeGroup(calculateAge(p.date_of_birth)); a[g]=(a[g]||0)+1; return a; },{}), [activePeople]);
  const genderCounts = useMemo(() => activePeople.reduce<Record<string,number>>((a,p)=>{ const k=p.gender||'not set'; a[k]=(a[k]||0)+1; return a; },{}), [activePeople]);
  const topLocations = useMemo(() => Object.entries(activePeople.reduce<Record<string,number>>((a,p)=>{ if(!p.location?.trim()) return a; a[p.location.trim()]=(a[p.location.trim()]||0)+1; return a; },{})).sort((a,b)=>b[1]-a[1]).slice(0,5), [activePeople]);
  const topOccupations = useMemo(() => Object.entries(activePeople.reduce<Record<string,number>>((a,p)=>{ if(!p.occupation?.trim()) return a; a[p.occupation.trim()]=(a[p.occupation.trim()]||0)+1; return a; },{})).sort((a,b)=>b[1]-a[1]).slice(0,5), [activePeople]);
  const howFoundUs = useMemo(() => Object.entries(activePeople.reduce<Record<string,number>>((a,p)=>{ if(!p.how_found_us?.trim()) return a; a[p.how_found_us.trim()]=(a[p.how_found_us.trim()]||0)+1; return a; },{})).sort((a,b)=>b[1]-a[1]).slice(0,5), [activePeople]);
  // Retention: of last month's first-timers, how many came back at all this month.
  // Must be measured per PERSON, not per check-in — otherwise someone who
  // attended three times this month counted as 300%, producing impossible
  // rates like 316%.
  const lastMonthFirstTimers = useMemo(() => new Set(
    checkins.filter(c=>c.is_first_time && monthOf(c.checked_in_at)===lastMonthKey).map(c=>c.person_id)
  ), [checkins, tzFmt, lastMonthKey]);
  const currentMonthAttenderIds = useMemo(() => new Set(currentMonthCheckins.map(c=>c.person_id)), [currentMonthCheckins]);
  const retained = useMemo(() => Array.from(lastMonthFirstTimers).filter(id=>currentMonthAttenderIds.has(id)).length, [lastMonthFirstTimers, currentMonthAttenderIds]);
  const retentionRate = lastMonthFirstTimers.size > 0 ? Math.round((retained / lastMonthFirstTimers.size) * 100) : null;
  // Visitor -> member conversion. There's no role-history table, so this is
  // read off the CURRENT role rather than an audited "became a member on
  // date X" — someone promoted and later demoted would misreport. The 60-day
  // floor exists so a visitor from last week (who hasn't had a chance to be
  // promoted yet) doesn't drag the rate down; only people who've had real
  // time to move through assimilation are counted.
  const CONVERSION_WINDOW_DAYS = 60;
  const conversionCohort = useMemo(() => {
    const cutoff = Date.now() - CONVERSION_WINDOW_DAYS*24*60*60*1000;
    return activePeople.filter(p => {
      const joinedRaw = p.first_attendance_date || p.created_at;
      if (!joinedRaw) return false;
      const joined = new Date(joinedRaw).getTime();
      return !Number.isNaN(joined) && joined <= cutoff;
    });
  }, [activePeople]);
  const convertedCount = useMemo(() => conversionCohort.filter(p=>p.role!=='visitor').length, [conversionCohort]);
  const conversionRate = conversionCohort.length > 0 ? Math.round((convertedCount / conversionCohort.length) * 100) : null;
  // Top attenders
  const topAttenders = useMemo(() => [...activePeople].sort((a,b)=>(b.total_checkins||0)-(a.total_checkins||0)).slice(0,5), [activePeople]);
  // Split each month into returning vs first-time so the trend answers the
  // question a pastor actually asks — "are we growing, or are the same people
  // just coming back?" A single total bar cannot tell those apart.
  const monthlyTrend = useMemo(() => Object.entries(
    checkins.reduce<Record<string,{returning:number;firstTime:number}>>((a,c)=>{
      const d=monthOf(c.checked_in_at); if(!d) return a;
      if(!a[d]) a[d]={returning:0,firstTime:0};
      if(c.is_first_time) a[d].firstTime++; else a[d].returning++;
      return a;
    },{})
  ).sort((a,b)=>a[0].localeCompare(b[0])).slice(-6), [checkins, tzFmt]);
  // Attendance activity (above) answers "are people showing up" — this
  // answers the different question "is the church actually bigger than it
  // was." Cumulative count of people whose first visit falls on or before
  // each month, so the line only goes up when someone genuinely new joins.
  // Approximation, not an audited headcount: it reads off who is active
  // TODAY, so a person archived since a past month vanishes from that month
  // too rather than showing as a later departure. Good enough to see the
  // shape of growth; not a substitute for the retention rate beside it.
  const congregationGrowth = useMemo(() => {
    const months: string[] = [];
    let cursor = currentMonthKey;
    for (let i = 0; i < 6; i++) { months.unshift(cursor); cursor = prevMonthKey(cursor); }
    const joinMonths = activePeople
      .map(p => p.first_attendance_date || p.created_at)
      .filter(Boolean)
      .map(d => monthKeyOf(tzFmt, d as string))
      .sort();
    return months.map(m => ({
      label: formatMonth(m),
      value: joinMonths.filter(jm => jm <= m).length,
    }));
  }, [activePeople, tzFmt, currentMonthKey]);
  const missingBirthdayCount = useMemo(() => activePeople.filter(p=>!p.date_of_birth).length, [activePeople]);
  const missingEmailCount = useMemo(() => activePeople.filter(p=>!p.email).length, [activePeople]);
  const firstTimersThisMonth = useMemo(() => currentMonthCheckins.filter(c=>c.is_first_time).length, [currentMonthCheckins]);
  const returningThisMonth = currentMonthCheckins.length-firstTimersThisMonth;
  const peopleRoleCounts = useMemo(() => ({
    all: activePeople.length,
    member: activePeople.filter(p=>p.role==='member').length,
    leader: activePeople.filter(p=>p.role==='leader').length,
    visitor: activePeople.filter(p=>p.role==='visitor').length,
  }), [activePeople]);
  const filteredPeople = useMemo(() => {
    const q=peopleSearch.trim().toLowerCase();
    return activePeople.filter(p=>
      (peopleRoleFilter==='all' || p.role===peopleRoleFilter) &&
      (peopleGroupFilter==='all' || (groupsByPersonId[p.id]||[]).some(g=>g.category_id===peopleGroupFilter)) &&
      (!q || p.full_name.toLowerCase().includes(q)||p.phone?.includes(q)||p.email?.toLowerCase().includes(q))
    );
  }, [activePeople,peopleSearch,peopleRoleFilter,peopleGroupFilter,groupsByPersonId]);
  // A stale page number after narrowing a filter would either show an empty
  // page that still has matches on page 1, or (once someone is deep in a
  // long list) silently render nothing at all.
  useEffect(() => { setPeoplePage(1); }, [peopleSearch, peopleRoleFilter, peopleGroupFilter]);
  const peopleTotalPages = Math.max(1, Math.ceil(filteredPeople.length / PEOPLE_PAGE_SIZE));
  const pagedPeople = useMemo(
    () => filteredPeople.slice((peoplePage-1)*PEOPLE_PAGE_SIZE, peoplePage*PEOPLE_PAGE_SIZE),
    [filteredPeople, peoplePage]
  );


  const givingPersonMatches = useMemo(() => {
    const q = givingPersonQuery.trim().toLowerCase();
    if (!q) return [];
    return activePeople.filter(p=>p.full_name.toLowerCase().includes(q)||p.phone?.includes(q)).slice(0,6);
  }, [activePeople, givingPersonQuery]);
  // "Mar 1–31, 2026" labels derived from the same church-timezone month keys,
  // so every "this month / last month" figure states exactly which dates it covers.
  const currentMonthRangeLabel = monthRangeLabel(currentMonthKey);
  const lastMonthRangeLabel = monthRangeLabel(lastMonthKey);

  const givingThisMonth = useMemo(() => giving.filter(g=>monthOf(g.created_at)===currentMonthKey), [giving, tzFmt, currentMonthKey]);
  const givingTotalThisMonth = useMemo(() => givingThisMonth.reduce((sum,g)=>sum+Number(g.amount||0),0), [givingThisMonth]);
  const givingTotalAllTime = useMemo(() => giving.reduce((sum,g)=>sum+Number(g.amount||0),0), [giving]);
  const givingPendingCount = useMemo(() => giving.filter(g=>g.status==='recorded').length, [giving]);
  const givingCurrency = givingThisMonth[0]?.currency || giving[0]?.currency || 'GHS';

  // The on-screen equivalent of the emailed workbook. The report has always
  // carried four sheets (summary, attendance, follow-up, giving) while the UI
  // showed none of it — so the email was the only way to actually read your own
  // service. This computes the same figures client-side from data already
  // loaded, so nothing has to be emailed to be seen.
  //
  // Mirrors getDayAttendance() in src/lib/attendance.ts: absence is reckoned per
  // calendar DAY, unioning check-ins across every service held that date, so a
  // church running 9am and 11am doesn't mark 9am attendees absent from the 11am.
  // Only members/leaders count as "expected" — a one-time visitor would
  // otherwise read as a no-show forever.
  const weeksSince = (iso: string|null|undefined): number|null => {
    if (!iso) return null;
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) return null;
    return Math.max(0, Math.floor((Date.now()-t)/(1000*60*60*24*7)));
  };

  const serviceBreakdown = useMemo(() => {
    if (!infoService) return null;
    const s = infoService;
    const fmtTime = timeFormatter(orgTimezone);
    const dateIds = new Set(services.filter(x=>x.service_date===s.service_date).map(x=>x.id));

    // One row per person even if they checked into both services that day.
    // Each attendee carries the category they belong to, assigned once here so
    // the summary breakdown and the Present filter can never disagree about
    // who counts as what.
    type PresentCategory = 'leader'|'member'|'firsttime'|'returning';
    const categorise = (person: Person|undefined, isFirstTime: boolean): PresentCategory => {
      if (isFirstTime) return 'firsttime';
      if (person?.role === 'leader') return 'leader';
      if (person?.role === 'member') return 'member';
      return 'returning';
    };
    const seen = new Set<string>();
    const present: {person:Person|undefined; checked_in_at:string; is_first_time:boolean; category:PresentCategory}[] = [];
    checkins
      .filter(c=>dateIds.has(c.service_id))
      .sort((a,b)=>(a.checked_in_at||'').localeCompare(b.checked_in_at||''))
      .forEach(c=>{
        if (seen.has(c.person_id)) return;
        seen.add(c.person_id);
        const person = activePeople.find(p=>p.id===c.person_id);
        present.push({ person, checked_in_at:c.checked_in_at, is_first_time:c.is_first_time, category:categorise(person, c.is_first_time) });
      });

    const expected = activePeople.filter(p=>p.role==='member'||p.role==='leader');
    const absent = expected
      .filter(p=>!seen.has(p.id))
      .map(p=>({ ...p, weeksAway: weeksSince(p.last_checkin_at) }))
      .sort((a,b)=>{
        if (a.weeksAway===null) return 1;
        if (b.weeksAway===null) return -1;
        return b.weeksAway-a.weeksAway;
      });

    const givingRows = giving.filter(g=>g.service_id && dateIds.has(g.service_id));
    const byType = (['tithe','offering','seed','pledge','other'] as GivingType[])
      .map(type=>{ const rows=givingRows.filter(g=>g.giving_type===type); return { label:GIVING_TYPE_LABELS[type], count:rows.length, amount:rows.reduce((a,g)=>a+Number(g.amount||0),0) }; })
      .filter(t=>t.count>0);

    return {
      fmtTime,
      present,
      absent,
      leadersPresent: present.filter(r=>r.person?.role==='leader'),
      leadersAbsent: absent.filter(p=>p.role==='leader'),
      absentMembers: absent.filter(p=>p.role==='member'),
      // Four mutually exclusive buckets that sum exactly to the attendance
      // figure, so the breakdown always reconciles with the headline number.
      // Counted off the category assigned above rather than re-derived here,
      // so the totals and the filtered lists can never disagree.
      //
      // "Visitor" is a ROLE that persists until someone promotes the person,
      // while "first time" is an EVENT true only on their very first check-in
      // ever — so the two overlap and cannot both be counted by role alone.
      // The event wins: whether this service was somebody's first visit is a
      // permanent fact about that service, and it stays true even if they are
      // made a member later.
      firstTimers: present.filter(r=>r.category==='firsttime').length,
      leaderCount: present.filter(r=>r.category==='leader').length,
      memberCount: present.filter(r=>r.category==='member').length,
      returningVisitors: present.filter(r=>r.category==='returning').length,
      expectedCount: expected.length,
      turnout: expected.length>0 ? Math.round(((expected.length-absent.length)/expected.length)*100) : null,
      givingRows,
      givingByType: byType,
      givingTotal: givingRows.reduce((a,g)=>a+Number(g.amount||0),0),
      currency: givingRows[0]?.currency || givingCurrency,
    };
  }, [infoService, services, checkins, activePeople, giving, orgTimezone, givingCurrency]);
  // Breakdown by type for the current month — "Tithe: 3 · GHS 450", etc.
  const givingByType = useMemo(() => (['tithe','offering','seed','pledge','other'] as GivingType[])
    .map(type => {
      const rows = givingThisMonth.filter(g=>g.giving_type===type);
      return { type, label: GIVING_TYPE_LABELS[type], count: rows.length, amount: rows.reduce((s,g)=>s+Number(g.amount||0),0) };
    })
    .filter(t => t.count > 0), [givingThisMonth]);

  // Year-over-year, same timezone-aware reckoning as everything else here —
  // built once so it's ready the first time a church actually has two years
  // of history to compare, rather than something to bolt on under pressure
  // later. Costs nothing when there's no data yet: the panel just says so.
  const currentYearKey = yearKeyOf(tzFmt, new Date());
  const lastYearKey = String(Number(currentYearKey) - 1);
  // null rather than a number when there's nothing last year to divide
  // by — "up 400% from zero" is a meaningless figure, not an insight.
  const pctDelta = (curr:number, prev:number): number|null => prev===0 ? null : Math.round(((curr-prev)/prev)*100);
  const { yearComparisons, hasAnyYearData } = useMemo(() => {
    const yearOf = (iso?: string|null) => iso ? yearKeyOf(tzFmt, iso) : '';
    const currentYearCheckins = checkins.filter(c=>yearOf(c.checked_in_at)===currentYearKey);
    const lastYearCheckins = checkins.filter(c=>yearOf(c.checked_in_at)===lastYearKey);
    const currentYearFirstTimers = currentYearCheckins.filter(c=>c.is_first_time).length;
    const lastYearFirstTimers = lastYearCheckins.filter(c=>c.is_first_time).length;
    const currentYearGiving = giving.filter(g=>yearOf(g.created_at)===currentYearKey);
    const lastYearGiving = giving.filter(g=>yearOf(g.created_at)===lastYearKey);
    const currentYearGivingTotal = currentYearGiving.reduce((s,g)=>s+Number(g.amount||0),0);
    const lastYearGivingTotal = lastYearGiving.reduce((s,g)=>s+Number(g.amount||0),0);
    const comparisons = [
      { label:'Check-ins', curr:currentYearCheckins.length, prev:lastYearCheckins.length,
        currDisplay:currentYearCheckins.length.toLocaleString('en-US'), prevDisplay:lastYearCheckins.length.toLocaleString('en-US') },
      { label:'First-time visitors', curr:currentYearFirstTimers, prev:lastYearFirstTimers,
        currDisplay:currentYearFirstTimers.toLocaleString('en-US'), prevDisplay:lastYearFirstTimers.toLocaleString('en-US') },
      { label:'Giving received', curr:currentYearGivingTotal, prev:lastYearGivingTotal,
        currDisplay:`${givingCurrency} ${currentYearGivingTotal.toLocaleString('en-US',{maximumFractionDigits:0})}`,
        prevDisplay:`${givingCurrency} ${lastYearGivingTotal.toLocaleString('en-US',{maximumFractionDigits:0})}` },
    ].map(c => ({ ...c, delta: pctDelta(c.curr, c.prev) }));
    return {
      yearComparisons: comparisons,
      hasAnyYearData: currentYearCheckins.length>0 || lastYearCheckins.length>0 || currentYearGiving.length>0 || lastYearGiving.length>0,
    };
  }, [checkins, giving, tzFmt, currentYearKey, lastYearKey, givingCurrency]);
  const currentYearRangeLabel = yearRangeLabel(currentYearKey);
  const lastYearRangeLabel = yearRangeLabel(lastYearKey);

  const resetGivingForm = () => setGivingForm({ person_id:'', giver_name:'', giver_email:'', amount:'', giving_type:'offering', giving_type_other:'', payment_method:'cash', notes:'' });

  const selectGivingPerson = (p: Person) => {
    setGivingForm(f=>({...f, person_id:p.id, giver_name:p.full_name, giver_email:p.email||''}));
    setGivingPersonQuery(p.full_name);
  };

  const handleSaveGiving = async () => {
    setSavingGiving(true); setError(null);
    try {
      const res = await fetch('/api/giving', { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          person_id: givingForm.person_id || null,
          giver_name: givingForm.giver_name.trim(),
          giver_email: givingForm.giver_email.trim() || null,
          amount: givingForm.amount,
          giving_type: givingForm.giving_type,
          giving_type_other: givingForm.giving_type_other.trim() || null,
          payment_method: givingForm.payment_method,
          notes: givingForm.notes.trim() || null,
        })});
      const data = await res.json();
      if (!res.ok) { setError(data.error||'Could not record gift.'); return; }
      if (data.giving?.giver_email) {
        setMessage(data.receiptSent ? 'Gift recorded and receipt emailed.' : `Gift recorded, but the receipt email failed (${data.receiptError||'unknown error'}). You can retry from the list.`);
      } else {
        setMessage('Gift recorded.');
      }
      setGivingFormOpen(false); resetGivingForm(); setGivingPersonQuery('');
      loadData();
    } finally { setSavingGiving(false); }
  };

  const handleSendReceipt = async (id: string) => {
    setSendingReceiptId(id); setError(null);
    try {
      const res = await fetch(`/api/giving/${id}/send-receipt`, { method:'POST' });
      const data = await res.json();
      if (!res.ok) { setError(data.error||'Could not send receipt.'); return; }
      setMessage('Receipt sent.');
      loadData();
    } finally { setSendingReceiptId(null); }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeletingBusy(true); setError(null);
    try {
      const res = await fetch(`/api/${deleteTarget.kind}?id=${encodeURIComponent(deleteTarget.id)}&code=${encodeURIComponent(deleteCode.trim())}`, { method:'DELETE' });
      const data = await res.json();
      if (!res.ok) { setError(data.error||'Could not delete.'); return; }
      setMessage('Deleted.');
      setDeleteTarget(null); setDeleteCode('');
      loadData();
    } finally { setDeletingBusy(false); }
  };

  const askDelete = (kind:'services'|'people'|'giving', id:string, label:string) => {
    setDeleteCode(''); setDeleteTarget({ kind, id, label });
  };


  const TAB_LABELS:Record<Tab,string> = {dashboard:'Dashboard',services:"Today's Service",people:'People',giving:'Giving',analytics:'Analytics',emails:'Messaging',settings:'Settings'};

  if (loading) return (
    <div style={{minHeight:'100vh',background:'#F8F4EE',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{textAlign:'center'}}>
        <div style={{width:44,height:44,border:'3px solid #E4DFD5',borderTopColor:'#C97B1A',borderRadius:'50%',animation:'spin 0.8s linear infinite',margin:'0 auto 16px'}} />
        <p style={{color:'#7A6E60',fontSize:14}}>Loading…</p>
      </div>
    </div>
  );
  if (!session) return null;

  // Every data-fetching route behind requireActiveSubscription() 403s once a
  // trial or subscription ends, and safeFetch() in loadData() silently
  // swallows those into empty fallbacks — so without this gate, an expired
  // church just sees a dashboard that quietly looks wiped clean, with no way
  // back in. /api/auth/session is deliberately NOT gated the same way, so
  // this screen is reachable exactly when everything else is locked.
  if (!session.isSubscriptionActive) {
    const ended = session.subscriptionStatus === 'trial' ? 'Your 14-day free trial has ended.' : 'Your subscription has ended.';
    return (
      <div style={{minHeight:'100vh',background:'#F8F4EE',display:'flex',alignItems:'center',justifyContent:'center',padding:24}}>
        <div style={{width:'100%',maxWidth:460}}>
          <div style={{textAlign:'center',marginBottom:28}}>
            <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:26,color:'#16243A',marginBottom:8}}>{session.orgName}</h1>
            <p style={{fontSize:14,color:'#7A6E60',fontWeight:300}}>{ended} Choose a plan to keep using WeMotiply — your data is safe and waiting.</p>
          </div>

          {billingError && <div className="alert alert-error" style={{marginBottom:16}}><span>{billingError}</span></div>}

          <div className="card" style={{padding:'20px 22px',marginBottom:12,display:'flex',justifyContent:'space-between',alignItems:'center',gap:16}}>
            <div>
              <div style={{fontSize:12,color:'#A89D8E',fontWeight:500,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:4}}>Monthly</div>
              <div style={{fontFamily:"'Playfair Display',serif",fontSize:24,color:'#16243A'}}>GHS 99<span style={{fontSize:13,color:'#7A6E60',fontWeight:400}}> / month</span></div>
            </div>
            <button onClick={()=>startCheckout('monthly')} disabled={billingBusy!==null} className="btn btn-secondary">
              {billingBusy==='monthly' ? 'Redirecting…' : 'Choose'}
            </button>
          </div>

          <div className="card" style={{padding:'20px 22px',marginBottom:20,display:'flex',justifyContent:'space-between',alignItems:'center',gap:16,border:'1px solid #C97B1A',background:'#FDF3E0'}}>
            <div>
              <div style={{fontSize:12,color:'#7A4A0E',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:4}}>Annual · Save GHS 198</div>
              <div style={{fontFamily:"'Playfair Display',serif",fontSize:24,color:'#16243A'}}>GHS 990<span style={{fontSize:13,color:'#7A6E60',fontWeight:400}}> / year</span></div>
            </div>
            <button onClick={()=>startCheckout('annual')} disabled={billingBusy!==null} className="btn btn-primary">
              {billingBusy==='annual' ? 'Redirecting…' : 'Choose'}
            </button>
          </div>

          <p style={{fontSize:12,color:'#A89D8E',textAlign:'center',lineHeight:1.6}}>
            Paid by card or Mobile Money via Paystack. You&apos;ll be redirected to a secure checkout page.
          </p>
          {/* Payment questions are the most likely reason someone stalls on
              this screen, and it's the one screen with nothing else on it. */}
          <div style={{textAlign:'center',marginTop:22}}>
            <WhatsAppSupport variant="inline" context="my WeMotiply subscription" />
          </div>
          <div style={{textAlign:'center',marginTop:16}}>
            <button onClick={handleLogout} className="btn btn-ghost text-sm">Sign out</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-shell" style={{minHeight:"100vh",background:"#F8F4EE"}}>
      {editingPerson && <EditPersonModal person={editingPerson} categories={categories} groups={groups} personGroupIds={(groupsByPersonId[editingPerson.id]||[]).map(g=>g.id)} onClose={()=>setEditingPerson(null)} onSaved={()=>{loadData();setMessage('Profile updated.');}} />}

      {/* Code-gated delete confirmation — shared across services, people, giving */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center p-4" onClick={()=>setDeleteTarget(null)}>
          <div className="absolute inset-0 bg-navy-900/60 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md animate-scale-in" onClick={e=>e.stopPropagation()}>
            <div className="px-7 pt-7 pb-5">
              <div style={{width:44,height:44,borderRadius:12,background:'#FDECEA',display:'flex',alignItems:'center',justifyContent:'center',marginBottom:16}}>
                <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
              </div>
              <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:20,color:'#16243A',marginBottom:8}}>Delete {deleteTarget.label}?</h2>
              <p style={{fontSize:14,color:'#7A6E60',fontWeight:300,lineHeight:1.7,marginBottom:16}}>
                {deleteTarget.kind==='groups'
                  ? "People with this choice aren't deleted — it's just cleared from their profile."
                  : deleteTarget.kind==='group-categories'
                  ? "This can't be undone. Every choice under this field is deleted too, and everyone's answer for it goes with it."
                  : <>This can&apos;t be undone.{deleteTarget.kind==='services' && ' Its check-ins are removed too.'}</>
                } Type your kiosk code to confirm.
              </p>
              <label className="block text-xs font-medium text-navy-600 mb-1.5">Kiosk code</label>
              <input className="input" style={{letterSpacing:'0.15em'}} value={deleteCode}
                onChange={e=>setDeleteCode(e.target.value)}
                onKeyDown={e=>{ if(e.key==='Enter' && deleteCode.trim()) confirmDelete(); }}
                placeholder={settings?.kiosk_access_code ? '••••••' : 'No code set — leave blank'}
                autoFocus autoComplete="off" spellCheck={false} />
              <p style={{fontSize:11,color:'#A89D8E',marginTop:8,fontWeight:300}}>Find this under Settings → Kiosk access code.</p>
            </div>
            <div className="px-7 pb-7 flex gap-3">
              <button onClick={()=>setDeleteTarget(null)} className="btn btn-secondary flex-1">Cancel</button>
              <button onClick={confirmDelete} disabled={deletingBusy || (!!settings?.kiosk_access_code && !deleteCode.trim())} className="btn btn-danger flex-1">
                {deletingBusy ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header — fixed 68px so the tab bar below can stick flush against it */}
      <header className="admin-topbar bg-white border-b border-navy-100 px-4 sm:px-6 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto h-[68px] flex justify-between items-center gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div style={{width:36,height:36,background:"#16243A",borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              <svg style={{width:16,height:16,color:"#F0A832"}} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            </div>
            <div className="min-w-0">
              <h1 className="font-semibold text-navy-900 leading-tight truncate">{session.orgName}</h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`w-1.5 h-1.5 rounded-full ${settings?.kiosk_open?'bg-emerald-500 animate-pulse':'bg-navy-300'}`} />
                <span className="text-xs text-navy-500">{settings?.kiosk_open?'Check-in open':'Check-in closed'}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={()=>loadData()} className="btn btn-ghost btn-icon" title="Refresh" aria-label="Refresh data">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            </button>
            {/* This is the single most important button in the app — it's how
                a church actually starts letting people check in — so unlike
                Refresh and Logout beside it, it never drops to icon-only. A
                tooltip is no substitute for a mobile admin who can't hover to
                read "Open kiosk" before tapping something unlabeled. */}
            <Link href={`/kiosk/${session.orgSlug}`} target="_blank" className="btn btn-secondary text-sm" title="Open the check-in screen for this device">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
              <span className="sm:hidden">Kiosk</span>
              <span className="hidden sm:inline">Open Kiosk</span>
            </Link>
            {/* Logout stays reachable on mobile — icon only to save width */}
            <button onClick={handleLogout} className="btn btn-ghost btn-icon sm:hidden" title="Logout" aria-label="Logout">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" /></svg>
            </button>
            <button onClick={handleLogout} className="btn btn-ghost text-navy-500 text-sm hidden sm:flex">Logout</button>
          </div>
        </div>
      </header>

      {/* Trial countdown.
          Without this a church works happily for 14 days and then arrives one
          morning to a hard paywall with no warning — the worst possible first
          impression, and usually at the exact moment they need the kiosk. It
          stays quiet until the last week so it never nags, then sharpens on
          the final two days. Only shown for trials: a paid subscription
          renews through Paystack and doesn't need a countdown. */}
      {session.subscriptionStatus === 'trial' && trialDaysLeft !== null && trialDaysLeft <= 7 && (
        <div style={{
          background: trialDaysLeft <= 2 ? '#FDECEA' : '#FDF3E0',
          borderBottom: `1px solid ${trialDaysLeft <= 2 ? '#F0C4BE' : '#EDD9B0'}`,
          padding: '10px 16px',
        }}>
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 flex-wrap">
            <span style={{fontSize:13,color:trialDaysLeft<=2?'#8C2F26':'#7A4A0E',fontWeight:400}}>
              {trialDaysLeft <= 0
                ? 'Your free trial ends today.'
                : trialDaysLeft === 1
                ? 'Your free trial ends tomorrow.'
                : `Your free trial ends in ${trialDaysLeft} days.`}
              {' '}Subscribe now to keep check-in running without interruption.
            </span>
            <button
              onClick={()=>startCheckout('monthly')}
              disabled={billingBusy!==null}
              className="btn btn-gold text-xs py-1.5 px-4 shrink-0"
            >
              {billingBusy==='monthly' ? 'Redirecting…' : 'Subscribe'}
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <nav className="admin-tabs bg-white border-b border-navy-100 px-4 sm:px-6 sticky top-[68px] z-30">
        {/* Mobile: current section + hamburger. A horizontal scroll strip here
            cut "People" off mid-word with no visible sign that Giving,
            Analytics, Messaging, and Settings existed further along — a real
            church admin confirmed exactly that on a real phone. A menu makes
            every section equally reachable in one tap, not something you
            stumble into by swiping. */}
        <div className="flex sm:hidden items-center justify-between max-w-7xl mx-auto" style={{paddingTop:10,paddingBottom:10}}>
          <div style={{display:'flex',alignItems:'center',gap:8,fontSize:14,fontWeight:600,color:'#16243A'}}>
            <svg style={{width:16,height:16,flexShrink:0}} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>{TAB_ICONS[tab]}</svg>
            {TAB_LABELS[tab]}
          </div>
          <button
            onClick={()=>setMobileMenuOpen(o=>!o)}
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileMenuOpen}
            style={{display:'flex',alignItems:'center',gap:6,padding:'7px 12px',borderRadius:9,border:'1px solid #E4DFD5',background:mobileMenuOpen?'#F8F4EE':'#fff',color:'#16243A',fontSize:13,fontWeight:500,cursor:'pointer'}}
          >
            <svg style={{width:16,height:16}} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
            Menu
          </button>
        </div>
        {mobileMenuOpen && (
          <div className="sm:hidden max-w-7xl mx-auto" style={{paddingBottom:10}}>
            {TAB_ORDER.map(t=>{
              const active = tab===t;
              return (
                <button key={t} onClick={()=>{ setTab(t); setMobileMenuOpen(false); if(t==='emails') loadBroadcasts(); }} aria-current={active?'page':undefined}
                  style={{
                    display:'flex',width:'100%',alignItems:'center',gap:10,
                    padding:'11px 12px',borderRadius:9,marginBottom:2,
                    fontSize:14,fontWeight:500,textAlign:'left',
                    fontFamily:"'DM Sans',sans-serif",
                    background: active ? '#16243A' : 'transparent',
                    color: active ? '#fff' : '#3A3226',
                    border:'none',cursor:'pointer',
                  }}
                >
                  <svg style={{width:16,height:16,flexShrink:0,opacity:active?1:0.6}} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>{TAB_ICONS[t]}</svg>
                  {TAB_LABELS[t]}
                </button>
              );
            })}
          </div>
        )}

        {/* Desktop: unchanged horizontal strip — plenty of room here, and
            these are frequent-enough actions that a menu tap would be pure
            friction where a phone's screen width was the actual problem. */}
        <div className="hidden sm:flex max-w-7xl mx-auto gap-1 overflow-x-auto hide-scrollbar tab-scroll-fade" style={{paddingTop:10,paddingBottom:10}}>
          {TAB_ORDER.map(t=>{
            const active = tab===t;
            return (
              <button key={t} onClick={()=>{ setTab(t); if(t==='emails') loadBroadcasts(); }} aria-current={active?'page':undefined}
                style={{
                  display:'flex',alignItems:'center',gap:7,
                  padding:'9px 16px',borderRadius:10,
                  fontSize:13.5,fontWeight:500,whiteSpace:'nowrap',
                  fontFamily:"'DM Sans',sans-serif",
                  background: active ? '#16243A' : 'transparent',
                  color: active ? '#fff' : '#7A6E60',
                  border:'none',cursor:'pointer',
                  transition:'all .15s',
                }}
                onMouseEnter={e=>{ if(!active) e.currentTarget.style.background='#F8F4EE'; }}
                onMouseLeave={e=>{ if(!active) e.currentTarget.style.background='transparent'; }}
              >
                <svg style={{width:15,height:15,flexShrink:0,opacity:active?1:0.6}} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>{TAB_ICONS[t]}</svg>
                {TAB_LABELS[t]}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Transient feedback floats above the page so it never reflows the
          content underneath when it appears and auto-dismisses. */}
      <div className="toast-stack" aria-live="polite">
        {message && <div className="alert alert-success"><svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg><span>{message}</span></div>}
        {error && <div className="alert alert-error"><svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg><span>{error}</span></div>}
      </div>

      {/* Main */}
      <main className="admin-main max-w-7xl mx-auto px-4 sm:px-6 py-7 sm:py-9 space-y-5">

        {/* ── DASHBOARD ── */}
        {tab==='dashboard' && (
          <div className="admin-page animate-fade-in">

            {/* Greeting + Open Kiosk */}
            <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:20,marginBottom:28,flexWrap:'wrap'}}>
              <div>
                <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:26,color:'#16243A',fontWeight:400,marginBottom:4}}>
                  {getGreeting()}, {session.orgName}
                </h2>
                <p style={{fontSize:14,color:'#7A6E60',fontWeight:300}}>
                  {settings?.kiosk_open
                    ? <span style={{display:'flex',alignItems:'center',gap:6}}><span style={{width:7,height:7,borderRadius:'50%',background:'#2E7D4E',display:'inline-block'}}/>Check-in is open{activeService?<> · {activeService.title}</>:null}</span>
                    : 'Check-in is closed'
                  }
                </p>
                {/* This screen actually refreshes on its own every few
                    seconds — the point of this line is to make that visible
                    rather than something you have to take on faith. */}
                {lastUpdatedAt && (
                  <p style={{fontSize:11,color:'#A89D8E',fontWeight:300,marginTop:5,display:'flex',alignItems:'center',gap:6}}>
                    {settings?.kiosk_open && <span className="animate-pulse" style={{width:5,height:5,borderRadius:'50%',background:'#2E7D4E',display:'inline-block'}}/>}
                    {(() => {
                      const secs = Math.max(0, Math.round((nowTick - lastUpdatedAt.getTime())/1000));
                      const ago = secs<5 ? 'just now' : secs<60 ? `${secs}s ago` : `${Math.round(secs/60)}m ago`;
                      return settings?.kiosk_open ? `Live · updated ${ago}` : `Last updated ${ago}`;
                    })()}
                  </p>
                )}
              </div>
              <div style={{display:'flex',gap:10}}>
                <button onClick={toggleKiosk} className={`btn ${settings?.kiosk_open ? 'btn-secondary' : 'btn-primary'} text-sm`}>
                  {settings?.kiosk_open ? 'Close Check-In' : 'Open Check-In'}
                </button>
              </div>
            </div>

            {/* Check-in stays open until someone closes it, and the day it was
                opened for can quietly pass — the server now auto-closes it the
                moment anyone loads or submits to a stale kiosk, but this warns
                here too in case nobody visits the kiosk before the next
                service. */}
            {settings?.kiosk_open && activeService && activeService.service_date !== today && (
              <div className="alert alert-warning" style={{marginBottom:24}}>
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
                <span style={{flex:1}}>Check-in has been left open since <strong>{new Date(activeService.service_date).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'})}</strong> — anyone checking in now would be recorded against that service, not today&apos;s.</span>
                <button onClick={toggleKiosk} className="btn btn-secondary text-xs py-1.5 px-3" style={{flexShrink:0}}>Close now</button>
              </div>
            )}

            {/* Stat cards */}
            <div className="admin-stat-grid">
              {[
                {label:"Checked in today",    value:todayCheckins.length},
                {label:"Members",             value:members.length},
                {label:"Visitors",            value:visitors.length},
                {label:"Total services",      value:services.length},
              ].map(({label,value})=>(
                <div key={label} className="panel admin-stat" style={{padding:'22px 24px'}}>
                  <div style={{fontFamily:"'Playfair Display',serif",fontSize:34,color:'#16243A',lineHeight:1,marginBottom:6}}>{value}</div>
                  <div style={{fontSize:13,color:'#7A6E60',fontWeight:300}}>{label}</div>
                </div>
              ))}
            </div>

            {/* Two column grid — stacks below lg so neither panel gets squeezed */}
            <div className="grid gap-5 grid-cols-1 lg:grid-cols-[1.3fr_1fr]">

              {/* Today&apos;s check-ins */}
              <div className="panel" style={{padding:'24px 28px'}}>
                <div className="panel-label" style={{display:'block',marginBottom:18}}>Today&apos;s check-ins</div>
                {todayCheckins.length===0 ? (
                  <div style={{textAlign:'center',padding:'32px 0',color:'#A89D8E'}}>
                    <div style={{fontSize:14,fontWeight:300}}>Nobody checked in yet</div>
                  </div>
                ) : (<>
                  {todayCheckins.slice(0,8).map((c,i,arr)=>(
                    <div key={c.id} style={{display:'flex',alignItems:'center',gap:12,padding:'11px 0',borderBottom:i===arr.length-1?'none':'1px solid #F0EBE3'}}>
                      <div style={{width:34,height:34,borderRadius:'50%',background:'#F0EBE3',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,color:'#7A6048',fontFamily:"'Playfair Display',serif",flexShrink:0}}>
                        {c.person?.full_name?.charAt(0)||'?'}
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:14,color:'#1C2A3A',fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.person?.full_name}</div>
                        {c.is_first_time && <div style={{fontSize:11,color:'#2E7D4E',fontWeight:500,display:'flex',alignItems:'center',gap:4}}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.2 4L19 7" /></svg>First visit</div>}
                      </div>
                      <div style={{fontSize:12,color:'#A89D8E',flexShrink:0}}>{new Date(c.checked_in_at).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}</div>
                    </div>
                  ))}
                  {todayCheckins.length>8 && (
                    <div style={{fontSize:12,color:'#A89D8E',fontWeight:300,paddingTop:14,borderTop:'1px solid #F0EBE3',marginTop:4}}>
                      + {todayCheckins.length-8} more checked in today
                    </div>
                  )}
                </>)}
              </div>

              {/* Things to know */}
              <div className="panel" style={{padding:'24px 28px'}}>
                <div className="panel-label" style={{display:'block',marginBottom:18}}>Things to know</div>
                {[
                  {label:'Members without birthday on file', value:missingBirthdayCount, action:missingBirthdayCount>0?()=>setTab('people'):undefined, urgent:missingBirthdayCount>5},
                  {label:'Members without email',             value:missingEmailCount,    action:missingEmailCount>0?()=>setTab('people'):undefined,    urgent:missingEmailCount>5},
                  {label:'New visitors this month',           value:firstTimersThisMonth, action:undefined, urgent:false},
                  {label:'Unique attendees this month',       value:currentMonthUnique,   action:undefined, urgent:false},
                ].map((row,i,arr)=>(
                  <div key={row.label} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,padding:'12px 0',borderBottom:i===arr.length-1?'none':'1px solid #F0EBE3'}}>
                    <span style={{fontSize:13,color:'#7A6E60',fontWeight:300}}>{row.label}</span>
                    <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
                      <span style={{fontSize:15,fontWeight:600,color:row.urgent?'#C97B1A':'#16243A',fontFamily:"'Playfair Display',serif"}}>{row.value}</span>
                      {row.action && row.value>0 && <button onClick={row.action} style={{fontSize:11,color:'#C97B1A',background:'none',border:'none',cursor:'pointer',fontWeight:500}}>Fix →</button>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

                {/* ── SERVICES ── */}
        {tab==='services' && (
          <div className="admin-page animate-fade-in">

            {/* Report recipient modal — confirm/redirect where the CSV goes */}
            {reportService && (
              <div style={{position:'fixed',inset:0,zIndex:50,display:'flex',alignItems:'center',justifyContent:'center',padding:16,background:'rgba(22,36,58,0.55)',backdropFilter:'blur(4px)'}}
                onClick={()=>setReportService(null)}>
                <div style={{background:'#fff',borderRadius:20,width:'100%',maxWidth:440,boxShadow:'0 24px 60px rgba(22,36,58,0.25)'}} onClick={e=>e.stopPropagation()}>
                  <div style={{padding:'24px 28px 20px'}}>
                    <h3 style={{fontFamily:"'Playfair Display',serif",fontSize:20,color:'#16243A',marginBottom:6}}>Email attendance report</h3>
                    <p style={{fontSize:13,color:'#7A6E60',fontWeight:300,marginBottom:20,lineHeight:1.6}}>
                      Sends the present-and-absent report for <strong style={{color:'#16243A',fontWeight:500}}>{reportService.title||'this service'}</strong> as a CSV. Change the address if it should go to a pastor or secretary.
                    </p>
                    <label style={{fontSize:12,fontWeight:500,color:'#7A6E60',letterSpacing:'0.06em',textTransform:'uppercase',display:'block',marginBottom:8}}>Send to</label>
                    <input className="input" type="email" value={reportRecipient} onChange={e=>setReportRecipient(e.target.value)}
                      onKeyDown={e=>{ if(e.key==='Enter') sendReport(); }} placeholder="name@church.org" autoFocus />
                  </div>
                  <div style={{padding:'16px 28px 24px',display:'flex',gap:10}}>
                    <button onClick={()=>setReportService(null)} className="btn btn-secondary" style={{flex:1}}>Cancel</button>
                    <button onClick={sendReport} disabled={sendingReportId===reportService.id} className="btn btn-primary" style={{flex:1}}>
                      {sendingReportId===reportService.id?'Sending…':'Send report'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Service info modal — the on-screen twin of the emailed workbook.
                Same four views (summary, attendance, follow-up, giving) so the
                report never has to be emailed just to be read. */}
            {infoService && serviceBreakdown && (() => {
              const b = serviceBreakdown;
              const money = (n:number) => `${b.currency} ${n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
              // An exact date, not "2 weeks ago". Churches run midweek services
              // and one-off programmes, so a relative figure is ambiguous about
              // WHICH gathering was missed — the date never is. The week count
              // stays as a muted suffix because it's still the fastest way to
              // spot a drift at a glance.
              const lastSeen = (iso:string|null) => {
                if (!iso) return null;
                const d = new Date(iso);
                if (Number.isNaN(d.getTime())) return null;
                return d.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',year:'numeric'});
              };
              const LastSeenCell = ({iso,weeks}:{iso:string|null;weeks:number|null}) => {
                const date = lastSeen(iso);
                if (!date) return <span style={{color:'#B23B3B',fontWeight:500}}>Never attended</span>;
                return (
                  <>
                    <span style={{color:(weeks??0)>=3?'#B23B3B':'#16243A',fontWeight:(weeks??0)>=3?500:400}}>{date}</span>
                    {weeks!==null && weeks>0 && <span style={{color:'#A89D8E',fontWeight:300}}> · {weeks}w</span>}
                  </>
                );
              };
              const TABS = [
                {v:'summary'    as const, l:'Summary'},
                {v:'attendance' as const, l:`Present (${b.present.length})`},
                {v:'followup'   as const, l:`Absent (${b.absentMembers.length})`},
                {v:'giving'     as const, l:`Giving (${b.givingRows.length})`},
              ];
              const th:React.CSSProperties = {textAlign:'left',fontSize:11,fontWeight:600,color:'#7A6E60',letterSpacing:'0.05em',textTransform:'uppercase',padding:'0 0 8px',borderBottom:'1px solid #E4DFD5'};
              const td:React.CSSProperties = {fontSize:13,color:'#16243A',padding:'10px 0',borderBottom:'1px solid #F5F1EA',verticalAlign:'top'};
              return (
                <div style={{position:'fixed',inset:0,zIndex:50,display:'flex',alignItems:'center',justifyContent:'center',padding:16,background:'rgba(22,36,58,0.55)',backdropFilter:'blur(4px)'}}
                  onClick={()=>setInfoService(null)}>
                  <div style={{background:'#fff',borderRadius:20,width:'100%',maxWidth:760,maxHeight:'90vh',display:'flex',flexDirection:'column',boxShadow:'0 24px 60px rgba(22,36,58,0.25)'}}
                    onClick={e=>e.stopPropagation()}>

                    {/* Header */}
                    <div style={{padding:'24px 28px 0',borderBottom:'1px solid #E4DFD5'}}>
                      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:16}}>
                        <div>
                          <h3 style={{fontFamily:"'Playfair Display',serif",fontSize:21,color:'#16243A',marginBottom:4}}>{infoService.title||'Untitled Service'}</h3>
                          <p style={{fontSize:13,color:'#A89D8E',fontWeight:300}}>
                            {new Date(infoService.service_date).toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})}{infoService.service_time&&` · ${infoService.service_time}`}
                          </p>
                        </div>
                        <button onClick={()=>setInfoService(null)} style={{background:'none',border:'none',cursor:'pointer',color:'#A89D8E',fontSize:22,lineHeight:1,padding:4}}>×</button>
                      </div>
                      <div style={{display:'flex',gap:4,marginTop:18,overflowX:'auto'}}>
                        {TABS.map(({v,l})=>(
                          <button key={v} onClick={()=>setInfoTab(v)}
                            style={{background:'none',border:'none',cursor:'pointer',padding:'10px 14px',fontFamily:"'DM Sans',sans-serif",fontSize:13,fontWeight:500,whiteSpace:'nowrap',
                              color:infoTab===v?'#16243A':'#A89D8E',borderBottom:`2px solid ${infoTab===v?'#C97B1A':'transparent'}`,marginBottom:-1}}>
                            {l}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Body */}
                    <div style={{padding:'24px 28px',overflowY:'auto',flex:1}}>

                      {/* Independent of which tab is open — "was so-and-so
                          here" is one question, not one scoped to whichever
                          sub-tab you happen to be looking at. Also narrows
                          the Attendance tab's list below when that's open,
                          but works (and gives a real Present/Absent verdict)
                          even on Summary or Follow-up. */}
                      <div style={{marginBottom:20}}>
                        <input
                          className="input text-sm"
                          placeholder="Was someone here today? Search by name or phone…"
                          value={presentSearch}
                          onChange={e=>setPresentSearch(e.target.value)}
                        />
                        {presentSearch.trim() && (() => {
                          const q = presentSearch.trim().toLowerCase();
                          const matchPerson = (p: {full_name?:string|null; phone?:string|null}|undefined) =>
                            !!p && (p.full_name?.toLowerCase().includes(q) || (!!p.phone && p.phone.includes(q)));
                          const presentMatches = b.present.filter(r=>matchPerson(r.person));
                          const absentMatches  = b.absent.filter(p=>matchPerson(p));
                          if (presentMatches.length===0 && absentMatches.length===0) {
                            return (
                              <div style={{marginTop:8,fontSize:13,color:'#A89D8E',fontWeight:300}}>
                                No match — check the spelling, or they may not be a registered member or leader (attendance is only tracked as &ldquo;absent&rdquo; for members and leaders, not visitors).
                              </div>
                            );
                          }
                          return (
                            <div style={{marginTop:10,display:'flex',flexDirection:'column',gap:6}}>
                              {presentMatches.map(r=>(
                                <div key={r.person?.id} style={{display:'flex',alignItems:'center',gap:10,fontSize:13.5}}>
                                  <span style={{color:'#2E7D4E',fontWeight:600}}>Present</span>
                                  <span style={{color:'#16243A'}}>{r.person?.full_name}</span>
                                  <span style={{color:'#A89D8E'}}>— checked in {b.fmtTime.format(new Date(r.checked_in_at))}</span>
                                </div>
                              ))}
                              {absentMatches.map(p=>(
                                <div key={p.id} style={{display:'flex',alignItems:'center',gap:10,fontSize:13.5}}>
                                  <span style={{color:'#B23B3B',fontWeight:600}}>Absent</span>
                                  <span style={{color:'#16243A'}}>{p.full_name}</span>
                                  {p.weeksAway!=null && <span style={{color:'#A89D8E'}}>— last seen {p.weeksAway===0?'this week':`${p.weeksAway} week${p.weeksAway===1?'':'s'} ago`}</span>}
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </div>

                      {infoTab==='summary' && (
                        <>
                          {/* A labelled record, not a decorated list. The
                              emoji-prefixed lines never said what they were —
                              a theme and a scripture reference are only
                              legible when the field is named. */}
                          <dl style={{margin:'0 0 26px',paddingBottom:22,borderBottom:'1px solid #F5F1EA'}}>
                            {[
                              {k:'Date of service', v:`${new Date(infoService.service_date).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}${infoService.service_time?` · ${infoService.service_time}`:''}`},
                              {k:'Service theme',   v:infoService.theme},
                              {k:'Scripture',       v:infoService.scripture},
                              {k:'Announcement',    v:infoService.message},
                            ].filter(r=>r.v).map(({k,v})=>(
                              <div key={k} style={{display:'flex',flexWrap:'wrap',gap:'2px 16px',marginBottom:9}}>
                                <dt style={{fontSize:11,fontWeight:600,color:'#A89D8E',letterSpacing:'0.05em',textTransform:'uppercase',minWidth:132,paddingTop:2}}>{k}</dt>
                                <dd style={{margin:0,fontSize:13.5,color:'#16243A',fontWeight:400,flex:'1 1 220px'}}>{v}</dd>
                              </div>
                            ))}
                          </dl>

                          <div style={{display:'flex',alignItems:'flex-end',justifyContent:'space-between',gap:20,flexWrap:'wrap',marginBottom:18}}>
                            <div>
                              <div style={{fontFamily:"'Playfair Display',serif",fontSize:44,color:'#16243A',lineHeight:1}}>{b.present.length}</div>
                              <div style={{fontSize:12,color:'#A89D8E',fontWeight:500,letterSpacing:'0.05em',textTransform:'uppercase',marginTop:6}}>Total attendance</div>
                            </div>
                            {b.turnout!==null && (
                              <div style={{textAlign:'right'}}>
                                <div style={{fontFamily:"'Playfair Display',serif",fontSize:26,lineHeight:1,color:b.turnout>=70?'#2E7D4E':b.turnout>=40?'#C97B1A':'#B23B3B'}}>{b.turnout}%</div>
                                <div style={{fontSize:12,color:'#A89D8E',fontWeight:300,marginTop:5}}>of {b.expectedCount} expected</div>
                              </div>
                            )}
                          </div>

                          {(() => {
                            // Five categories, four of which sum to the
                            // attendance figure. First-time and returning
                            // visitors are counted separately rather than
                            // rolled into one "visitors" total, because a
                            // first visit and a fourth visit call for entirely
                            // different follow-up.
                            const barTotal = b.expectedCount + b.firstTimers + b.returningVisitors;
                            if (barTotal===0) return null;
                            const seg = [
                              {label:'Leaders',               n:b.leaderCount,        c:'#486581'},
                              {label:'Members',               n:b.memberCount,        c:'#16243A'},
                              {label:'First-time visitors',   n:b.firstTimers,        c:'#2E7D4E'},
                              {label:'Returning visitors',    n:b.returningVisitors,  c:'#C97B1A'},
                              {label:'Absent members',        n:b.absent.length,      c:'#E4DFD5'},
                            ].filter(s=>s.n>0);
                            return (
                              <div style={{marginBottom:30}}>
                                <div style={{display:'flex',height:10,borderRadius:99,overflow:'hidden',background:'#F0EBE3'}}>
                                  {seg.map(s=>(
                                    <div key={s.label} style={{width:`${(s.n/barTotal)*100}%`,background:s.c}} title={`${s.label}: ${s.n}`} />
                                  ))}
                                </div>
                                <div style={{display:'flex',flexDirection:'column',gap:1,marginTop:16}}>
                                  {seg.map(s=>(
                                    <div key={s.label} style={{display:'flex',alignItems:'center',gap:10,fontSize:13,padding:'7px 0',borderBottom:'1px solid #F5F1EA'}}>
                                      <span style={{width:9,height:9,borderRadius:3,background:s.c,flexShrink:0,border:s.c==='#E4DFD5'?'1px solid #D8D2C6':'none'}} />
                                      <span style={{color:'#5A4E3C',flex:1}}>{s.label}</span>
                                      <span style={{color:'#16243A',fontWeight:600,fontVariantNumeric:'tabular-nums'}}>{s.n}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}


                          <div style={{fontSize:11,fontWeight:600,color:'#7A6E60',letterSpacing:'0.05em',textTransform:'uppercase',marginBottom:10}}>Leadership roll call</div>
                          {b.leadersPresent.length+b.leadersAbsent.length===0 ? (
                            <div style={{fontSize:13,color:'#A89D8E',fontWeight:300}}>No leaders on record.</div>
                          ) : (
                            <table style={{width:'100%',borderCollapse:'collapse'}}>
                              <thead><tr><th style={th}>Leader</th><th style={th}>Status</th><th style={th}>Phone</th><th style={th}>Last seen</th></tr></thead>
                              <tbody>
                                {b.leadersPresent.map(r=>(
                                  <tr key={r.person?.id}>
                                    <td style={td}>{r.person?.full_name}</td>
                                    <td style={{...td,color:'#2E7D4E',fontWeight:500}}>Present</td>
                                    <td style={{...td,color:'#7A6E60'}}>{r.person?.phone||'—'}</td>
                                    <td style={{...td,color:'#7A6E60'}}>Today, {b.fmtTime.format(new Date(r.checked_in_at))}</td>
                                  </tr>
                                ))}
                                {b.leadersAbsent.map(p=>(
                                  <tr key={p.id}>
                                    <td style={td}>{p.full_name}</td>
                                    <td style={{...td,color:'#B23B3B',fontWeight:500}}>Absent</td>
                                    <td style={{...td,color:'#7A6E60'}}>{p.phone||'—'}</td>
                                    <td style={{...td,color:'#7A6E60'}}><LastSeenCell iso={p.last_checkin_at} weeks={p.weeksAway} /></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </>
                      )}

                      {infoTab==='attendance' && (
                        b.present.length===0 ? (
                          <div style={{fontSize:13,color:'#A89D8E',fontWeight:300}}>No attendance recorded for this service.</div>
                        ) : (() => {
                          // The same categories as the summary breakdown, made
                          // selectable — the totals there are only useful if you
                          // can open one up and see the names behind it.
                          const CATS = [
                            {v:'all'       as const, l:'All',                 n:b.present.length,       c:'#16243A'},
                            {v:'leader'    as const, l:'Leaders',             n:b.leaderCount,          c:'#486581'},
                            {v:'member'    as const, l:'Members',             n:b.memberCount,          c:'#16243A'},
                            {v:'firsttime' as const, l:'First-time visitors', n:b.firstTimers,          c:'#2E7D4E'},
                            {v:'returning' as const, l:'Returning visitors',  n:b.returningVisitors,    c:'#C97B1A'},
                          ];
                          const q = presentSearch.trim().toLowerCase();
                          const rows = (presentFilter==='all' ? b.present : b.present.filter(r=>r.category===presentFilter))
                            .filter(r => !q || r.person?.full_name?.toLowerCase().includes(q) || r.person?.phone?.includes(q));
                          const catLabel:Record<string,string> = {leader:'Leader',member:'Member',firsttime:'First-time visitor',returning:'Returning visitor'};
                          const catColor:Record<string,string> = {leader:'#486581',member:'#16243A',firsttime:'#2E7D4E',returning:'#C97B1A'};
                          return (
                            <>
                              {/* No search box here — the one above the tabs
                                  already narrows this list, and also covers
                                  absent members, which this tab alone can't. */}
                              <div style={{display:'flex',flexWrap:'wrap',gap:7,marginBottom:18}}>
                                {CATS.filter(c=>c.v==='all'||c.n>0).map(({v,l,n})=>{
                                  const on = presentFilter===v;
                                  return (
                                    <button key={v} onClick={()=>setPresentFilter(v)}
                                      style={{cursor:'pointer',fontFamily:"'DM Sans',sans-serif",fontSize:12.5,fontWeight:500,padding:'6px 12px',borderRadius:99,whiteSpace:'nowrap',
                                        background:on?'#16243A':'#fff',color:on?'#fff':'#7A6E60',border:`1px solid ${on?'#16243A':'#E4DFD5'}`}}>
                                      {l} <span style={{opacity:on?0.7:1,color:on?'#fff':'#A89D8E'}}>{n}</span>
                                    </button>
                                  );
                                })}
                              </div>
                              {rows.length===0 ? (
                                <div style={{fontSize:13,color:'#A89D8E',fontWeight:300,padding:'12px 4px'}}>Nobody matching &ldquo;{presentSearch}&rdquo; checked in today.</div>
                              ) : (
                              <table style={{width:'100%',borderCollapse:'collapse'}}>
                                <thead><tr><th style={th}>Time</th><th style={th}>Name</th><th style={th}>Phone</th><th style={th}>Category</th></tr></thead>
                                <tbody>
                                  {rows.map(r=>(
                                    <tr key={r.person?.id||r.checked_in_at}>
                                      <td style={{...td,color:'#7A6E60',whiteSpace:'nowrap'}}>{b.fmtTime.format(new Date(r.checked_in_at))}</td>
                                      <td style={td}>{r.person?.full_name||'—'}</td>
                                      <td style={{...td,color:'#7A6E60'}}>{r.person?.phone||'—'}</td>
                                      <td style={{...td,whiteSpace:'nowrap'}}>
                                        <span style={{display:'inline-flex',alignItems:'center',gap:6,color:'#5A4E3C'}}>
                                          <span style={{width:8,height:8,borderRadius:2,background:catColor[r.category],flexShrink:0}} />
                                          {catLabel[r.category]}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              )}
                            </>
                          );
                        })()
                      )}

                      {infoTab==='followup' && (
                        b.absentMembers.length===0 ? (
                          <div style={{fontSize:13,color:'#2E7D4E',fontWeight:300}}>Every registered member attended this service.</div>
                        ) : (() => {
                          // Grouped by whichever category is selected, so each
                          // leader's own people sit together — a flat 20-name
                          // list is nobody's job, but "here are your 4" is
                          // Kofi's job. People with no group in that category
                          // fall into their own section last rather than
                          // vanishing into "none". A church with more than one
                          // category (Cell Group AND Department) picks which
                          // one to follow up by, since a person's absence is
                          // only one leader's to work at a time.
                          const activeCatId = absentGroupCategoryId;
                          const catGroups = activeCatId ? groups.filter(g=>g.category_id===activeCatId) : [];
                          const byGroup = new Map<string, typeof b.absentMembers>();
                          for (const p of b.absentMembers) {
                            const inCat = activeCatId ? (groupsByPersonId[p.id]||[]).find(g=>g.category_id===activeCatId) : undefined;
                            const key = activeCatId ? (inCat?.id || '__none') : '__none';
                            if (!byGroup.has(key)) byGroup.set(key, []);
                            byGroup.get(key)!.push(p);
                          }
                          const sections = [
                            ...catGroups.filter(g=>byGroup.has(g.id)).map(g=>({ id:g.id, label:g.name, sub:g.leader?`Led by ${g.leader.full_name}`:null, people:byGroup.get(g.id)! })),
                            ...(byGroup.has('__none') ? [{ id:'__none', label:activeCatId ? 'Not assigned' : 'All absent members', sub:null, people:byGroup.get('__none')! }] : []),
                          ];
                          const showGrouping = Boolean(activeCatId && catGroups.length>0);
                          return (
                            <>
                              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap',marginBottom:18}}>
                                <p style={{fontSize:12,color:'#A89D8E',fontWeight:300}}>Registered members who did not attend, longest away first{showGrouping?', grouped below':''}.</p>
                                {categories.length>0 && (
                                  <select className="select text-xs" style={{width:'auto',padding:'6px 26px 6px 10px',height:'auto'}}
                                    value={absentGroupCategoryId} onChange={e=>setAbsentGroupCategoryId(e.target.value)}>
                                    <option value="">All absent members</option>{categories.map(c=>(<option key={c.id} value={c.id}>Group by {c.name}</option>))}
                                  </select>
                                )}
                              </div>
                              {sections.map((sec,i)=>(
                                <div key={sec.id} style={{marginBottom:i===sections.length-1?0:24}}>
                                  {showGrouping && (
                                    <div style={{display:'flex',alignItems:'baseline',gap:8,marginBottom:8}}>
                                      <span style={{fontSize:12,fontWeight:600,color:'#16243A'}}>{sec.label}</span>
                                      <span style={{fontSize:11,color:'#A89D8E',fontWeight:300}}>{sec.sub||'No leader assigned'} · {sec.people.length}</span>
                                    </div>
                                  )}
                                  <table style={{width:'100%',borderCollapse:'collapse'}}>
                                    <thead><tr><th style={th}>Name</th><th style={th}>Phone</th><th style={th}>Last visit</th><th style={th}>Visits</th></tr></thead>
                                    <tbody>
                                      {sec.people.map(p=>(
                                        <tr key={p.id}>
                                          <td style={td}>{p.full_name}</td>
                                          <td style={{...td,color:'#7A6E60'}}>{p.phone||'—'}</td>
                                          <td style={{...td,whiteSpace:'nowrap'}}>
                                            <LastSeenCell iso={p.last_checkin_at} weeks={p.weeksAway} />
                                          </td>
                                          <td style={{...td,color:'#7A6E60'}}>{p.total_checkins??0}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              ))}
                            </>
                          );
                        })()
                      )}

                      {infoTab==='giving' && (
                        b.givingRows.length===0 ? (
                          <div style={{fontSize:13,color:'#A89D8E',fontWeight:300}}>No giving recorded for this service.</div>
                        ) : (
                          <>
                            <div style={{display:'flex',flexWrap:'wrap',gap:18,marginBottom:22,paddingBottom:18,borderBottom:'1px solid #F5F1EA'}}>
                              {b.givingByType.map(t=>(
                                <div key={t.label} style={{borderLeft:'2px solid #EDE7DC',paddingLeft:12}}>
                                  <div style={{fontFamily:"'Playfair Display',serif",fontSize:18,color:'#16243A',lineHeight:1.2}}>{money(t.amount)}</div>
                                  <div style={{fontSize:12,color:'#A89D8E',fontWeight:300}}>{t.label} · {t.count}</div>
                                </div>
                              ))}
                              <div style={{borderLeft:'2px solid #C97B1A',paddingLeft:12}}>
                                <div style={{fontFamily:"'Playfair Display',serif",fontSize:18,color:'#C97B1A',lineHeight:1.2}}>{money(b.givingTotal)}</div>
                                <div style={{fontSize:12,color:'#A89D8E',fontWeight:300}}>Total · {b.givingRows.length}</div>
                              </div>
                            </div>
                            <table style={{width:'100%',borderCollapse:'collapse'}}>
                              <thead><tr><th style={th}>Giver</th><th style={th}>Type</th><th style={th}>Amount</th><th style={th}>Method</th></tr></thead>
                              <tbody>
                                {b.givingRows.map(g=>(
                                  <tr key={g.id}>
                                    <td style={td}>{g.giver_name}</td>
                                    <td style={{...td,color:'#7A6E60'}}>{g.giving_type==='other'?(g.giving_type_other||'Other'):GIVING_TYPE_LABELS[g.giving_type]}</td>
                                    <td style={{...td,fontWeight:500}}>{`${g.currency} ${Number(g.amount).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`}</td>
                                    <td style={{...td,color:'#7A6E60',textTransform:'capitalize'}}>{g.payment_method.replace(/_/g,' ')}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </>
                        )
                      )}
                    </div>

                    <div style={{padding:'16px 28px 24px',borderTop:'1px solid #E4DFD5',display:'flex',gap:10}}>
                      <button onClick={()=>setInfoService(null)} className="btn btn-secondary" style={{flex:1}}>Close</button>
                      <button onClick={()=>{ const s=infoService; setInfoService(null); openReportModal(s); }} className="btn btn-primary" style={{flex:1}}>Email as spreadsheet</button>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Service form modal */}
            {serviceFormOpen && (
              <div style={{position:'fixed',inset:0,zIndex:50,display:'flex',alignItems:'center',justifyContent:'center',padding:16,background:'rgba(22,36,58,0.55)',backdropFilter:'blur(4px)'}}
                onClick={()=>setServiceFormOpen(false)}>
                <div style={{background:'#fff',borderRadius:20,width:'100%',maxWidth:560,maxHeight:'90vh',overflowY:'auto',boxShadow:'0 24px 60px rgba(22,36,58,0.25)'}}
                  onClick={e=>e.stopPropagation()}>
                  <div style={{padding:'24px 28px 20px',borderBottom:'1px solid #E4DFD5',display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,background:'#fff',zIndex:1,borderRadius:'20px 20px 0 0'}}>
                    <div>
                      <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:20,color:'#16243A',fontWeight:400}}>{editingService?'Edit Service':'New Service'}</h2>
                      <p style={{fontSize:13,color:'#A89D8E',fontWeight:300,marginTop:3}}>Details here will be included in the welcome email sent to first-timers today.</p>
                    </div>
                    <button onClick={()=>setServiceFormOpen(false)} style={{background:'none',border:'none',cursor:'pointer',color:'#A89D8E',fontSize:22,lineHeight:1,padding:4}}>×</button>
                  </div>
                  <div style={{padding:'24px 28px'}}>
                    <div className="grid grid-cols-1 sm:grid-cols-2" style={{gap:14,marginBottom:16}}>
                      <div>
                        <label style={{fontSize:12,fontWeight:500,color:'#7A6E60',letterSpacing:'0.06em',textTransform:'uppercase' as const,display:'block',marginBottom:8}}>Service Name <span style={{color:'#C97B1A'}}>*</span></label>
                        <input className="input" value={serviceForm.title} onChange={e=>setServiceForm(p=>({...p,title:e.target.value}))} placeholder="e.g. Sunday Morning Service" />
                      </div>
                      <div>
                        <label style={{fontSize:12,fontWeight:500,color:'#7A6E60',letterSpacing:'0.06em',textTransform:'uppercase' as const,display:'block',marginBottom:8}}>Date <span style={{color:'#C97B1A'}}>*</span></label>
                        <input className="input" type="date" value={serviceForm.service_date} onChange={e=>setServiceForm(p=>({...p,service_date:e.target.value}))} />
                      </div>
                    </div>
                    <div style={{marginBottom:16}}>
                      <label style={{fontSize:12,fontWeight:500,color:'#7A6E60',letterSpacing:'0.06em',textTransform:'uppercase' as const,display:'block',marginBottom:8}}>Time <span style={{color:'#A89D8E',fontWeight:300,textTransform:'none' as const,letterSpacing:0}}>(optional)</span></label>
                      <input className="input" value={serviceForm.service_time} onChange={e=>setServiceForm(p=>({...p,service_time:e.target.value}))} placeholder="e.g. 9:00 AM" />
                    </div>
                    <div style={{background:'#FDF3E0',border:'1px solid rgba(201,123,26,0.2)',borderRadius:12,padding:'14px 16px',marginBottom:16}}>
                      <div style={{fontSize:11,letterSpacing:'0.1em',textTransform:'uppercase' as const,color:'#C97B1A',fontWeight:600,marginBottom:4}}>Included in today&apos;s welcome emails</div>
                      <div style={{fontSize:12,color:'#8A5A10',fontWeight:300}}>Fill in what you want first-timers to receive. All fields below are optional.</div>
                    </div>
                    <div style={{marginBottom:16}}>
                      <label style={{fontSize:12,fontWeight:500,color:'#7A6E60',letterSpacing:'0.06em',textTransform:'uppercase' as const,display:'block',marginBottom:8}}>Theme</label>
                      <input className="input" value={serviceForm.theme} onChange={e=>setServiceForm(p=>({...p,theme:e.target.value}))} placeholder="e.g. Walking in Faith" />
                    </div>
                    <div style={{marginBottom:16}}>
                      <label style={{fontSize:12,fontWeight:500,color:'#7A6E60',letterSpacing:'0.06em',textTransform:'uppercase' as const,display:'block',marginBottom:8}}>Scripture</label>
                      <input className="input" value={serviceForm.scripture} onChange={e=>setServiceForm(p=>({...p,scripture:e.target.value}))} placeholder="e.g. Hebrews 11:1" />
                    </div>
                    <div style={{marginBottom:8}}>
                      <label style={{fontSize:12,fontWeight:500,color:'#7A6E60',letterSpacing:'0.06em',textTransform:'uppercase' as const,display:'block',marginBottom:8}}>Special note or announcement</label>
                      <textarea className="textarea" value={serviceForm.message} rows={3} onChange={e=>setServiceForm(p=>({...p,message:e.target.value}))} placeholder="e.g. Join us next Sunday for our special thanksgiving service…" />
                      <div style={{fontSize:12,color:'#A89D8E',marginTop:5}}>This appears at the end of the service details in the welcome email.</div>
                    </div>
                    {(serviceForm.theme||serviceForm.scripture||serviceForm.message) && (
                      <div style={{background:'#F8F4EE',border:'1px solid #E4DFD5',borderRadius:10,padding:'14px 16px',marginTop:16}}>
                        <div style={{fontSize:11,letterSpacing:'0.1em',textTransform:'uppercase' as const,color:'#A89D8E',marginBottom:10}}>Preview — service section in email</div>
                        <div style={{fontSize:13,color:'#4A4038',lineHeight:1.8,fontWeight:300}}>
                          {serviceForm.title    && <div><em style={{color:'#16243A'}}>Today&apos;s gathering:</em> {serviceForm.title}</div>}
                          {serviceForm.theme    && <div><em style={{color:'#16243A'}}>Theme:</em> {serviceForm.theme}</div>}
                          {serviceForm.scripture&& <div><em style={{color:'#16243A'}}>Scripture:</em> {serviceForm.scripture}</div>}
                          {serviceForm.message  && <div style={{marginTop:6,color:'#5A4E3C'}}>{serviceForm.message}</div>}
                        </div>
                      </div>
                    )}
                  </div>
                  <div style={{padding:'16px 28px 24px',borderTop:'1px solid #E4DFD5',display:'flex',gap:10}}>
                    <button onClick={()=>setServiceFormOpen(false)} className="btn btn-secondary" style={{flex:1}}>Cancel</button>
                    <button onClick={saveService} disabled={savingService} className="btn btn-primary" style={{flex:2}}>
                      {savingService?'Saving…':editingService?'Save changes':'Create service'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:16,flexWrap:'wrap',marginBottom:24}}>
              <div>
                <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:24,color:'#16243A',fontWeight:400,marginBottom:4}}>Services</h2>
                <p style={{fontSize:14,color:'#7A6E60',fontWeight:300}}>Create a service before opening check-in. Details go into the welcome email.</p>
              </div>
              <button onClick={openNewService} className="btn btn-primary text-sm shrink-0">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 2v10M2 7h10" stroke="white" strokeWidth="1.8" strokeLinecap="round"/></svg>
                New Service
              </button>
            </div>

            {services.length===0 ? (
              <div style={{background:'#fff',border:'1px solid #E4DFD5',borderRadius:16,padding:'60px 20px',textAlign:'center'}}>
                <div style={{fontFamily:"'Playfair Display',serif",fontSize:18,color:'#16243A',marginBottom:8}}>No services yet</div>
                <div style={{fontSize:14,color:'#A89D8E',fontWeight:300,marginBottom:24}}>Create your first service to open check-in.</div>
                <button onClick={openNewService} className="btn btn-primary">Create first service</button>
              </div>
            ) : (
              <div style={{display:'flex',flexDirection:'column',gap:12}}>
                {services.map(s=>(
                  <div key={s.id} className="service-row" style={{background:s.is_active?'#FEFAF4':'#fff',border:`1px solid ${s.is_active?'rgba(201,123,26,0.35)':'#E4DFD5'}`,borderRadius:16,padding:'20px 24px',transition:'all .15s'}}>
                    <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:16,flexWrap:'wrap'}}>
                      <div style={{flex:'1 1 260px',minWidth:0}}>
                        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:4}}>
                          <span style={{fontFamily:"'Playfair Display',serif",fontSize:17,color:'#16243A'}}>{s.title||'Untitled Service'}</span>
                          {/* Two distinct labels for two distinct states, not
                              one word doing double duty — that's what made
                              the original "Active" badge misleading next to a
                              "Check-in closed" header. Safe to call the open
                              case "Active" again now that the closed case has
                              its own separate word ("Selected"). */}
                          {s.is_active && (settings?.kiosk_open
                            ? <span style={{fontSize:11,background:'#E8F3EC',color:'#2E7D4E',border:'1px solid rgba(46,125,78,0.25)',borderRadius:20,padding:'2px 10px',fontWeight:500,display:'flex',alignItems:'center',gap:5}}><span className="animate-pulse" style={{width:5,height:5,borderRadius:'50%',background:'#2E7D4E',display:'inline-block'}}/>Active</span>
                            : <span style={{fontSize:11,background:'#F0EBE3',color:'#7A6E60',border:'1px solid #E4DFD5',borderRadius:20,padding:'2px 10px',fontWeight:500}}>Selected</span>
                          )}
                        </div>
                        <div style={{fontSize:13,color:'#A89D8E',fontWeight:300,marginBottom:6}}>
                          {new Date(s.service_date).toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})}{s.service_time&&` · ${s.service_time}`}
                        </div>
                        {(s.theme||s.scripture||s.message) ? (
                          <div style={{fontSize:13,color:'#7A6E60',fontWeight:300,lineHeight:1.7}}>
                            {s.theme&&<span style={{marginRight:16}}>{s.theme}</span>}
                            {s.scripture&&<span style={{marginRight:16}}>{s.scripture}</span>}
                            {s.message&&<div style={{marginTop:4,color:'#9E9280',fontSize:12}}>{s.message.length>80?s.message.slice(0,80)+'…':s.message}</div>}
                          </div>
                        ) : (
                          <div style={{fontSize:12,color:'#C8C0B4',fontStyle:'italic'}}>
                            No service details added — <button onClick={()=>openEditService(s)} style={{background:'none',border:'none',cursor:'pointer',color:'#C97B1A',fontSize:12,fontStyle:'normal',padding:0}}>add theme & scripture</button> to enrich the welcome email
                          </div>
                        )}
                      </div>
                      <div className="service-actions" style={{display:'flex',gap:8,flexShrink:0}}>
                        <button onClick={()=>{ setInfoTab('summary'); setPresentFilter('all'); setAbsentGroupCategoryId(''); setInfoService(s); }} className="service-action-primary" style={{background:'#16243A',color:'#fff',border:'none',borderRadius:8,padding:'8px 14px',fontFamily:"'DM Sans',sans-serif",fontSize:13,fontWeight:500,cursor:'pointer'}}>View service</button>
                        <details className="service-more">
                          <summary aria-label={`More actions for ${s.title||'service'}`}>•••</summary>
                          <div className="service-more-menu">
                            <button onClick={()=>openReportModal(s)} disabled={sendingReportId===s.id}>{sendingReportId===s.id?'Sending…':'Email report'}</button>
                            <button onClick={()=>openEditService(s)}>Edit service</button>
                            {!s.is_active&&<button onClick={()=>setActiveService(s.id)}>Set as active</button>}
                            <button className="service-danger" onClick={()=>askDelete('services', s.id, s.title||'this service')}>Delete service</button>
                          </div>
                        </details>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── PEOPLE ── */}
        {tab==='people' && (
          <div className="admin-page space-y-5 animate-fade-in">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:24,color:'#16243A',fontWeight:400}}>People <span style={{fontSize:16,color:'#A89D8E',fontWeight:300}}>({activePeople.length})</span></h2>
              <div className="flex gap-2 w-full sm:w-auto">
                <input className="input text-sm flex-1 sm:w-60" placeholder="Search by name, phone or email…" value={peopleSearch} onChange={e=>setPeopleSearch(e.target.value)} />
                <a href="/api/export?type=people" className="btn btn-secondary text-sm shrink-0">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                  Export
                </a>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {([
                {v:'all' as const,     l:'All'},
                {v:'member' as const,  l:'Members'},
                {v:'leader' as const,  l:'Leaders'},
                {v:'visitor' as const, l:'Visitors'},
              ]).map(({v,l})=>{
                const active = peopleRoleFilter===v;
                return (
                  <button key={v} onClick={()=>setPeopleRoleFilter(v)}
                    className={`text-xs font-medium px-3 py-1.5 rounded-full border transition ${active ? 'bg-navy-900 text-white border-navy-900' : 'bg-white text-navy-600 border-cream-dark hover:border-navy-300'}`}>
                    {l} <span className={active?'opacity-70':'text-navy-400'}>({peopleRoleCounts[v]})</span>
                  </button>
                );
              })}
              {groups.length>0 && (
                <select className="select text-xs" style={{width:'auto',minWidth:150,padding:'6px 28px 6px 12px',height:'auto'}}
                  value={peopleGroupFilter} onChange={e=>setPeopleGroupFilter(e.target.value)}>
                  <option value="all">All categories</option>
                  {categories.filter(cat=>groups.some(g=>g.category_id===cat.id)).map(cat=>(<option key={cat.id} value={cat.id}>{cat.name}</option>))}
                </select>
              )}
            </div>

            {selectedPersonIds.size>0 && (
              <div className="alert" style={{background:'var(--chart-track)',border:'1px solid rgba(47,92,153,0.28)',color:'#16243A'}}>
                <span style={{flex:1}}>{selectedPersonIds.size} selected</span>
                {groups.length>0 ? (
                  <>
                    <select className="select text-xs" style={{width:'auto',padding:'6px 26px 6px 10px',height:'auto'}}
                      value={bulkAssignGroupId} onChange={e=>setBulkAssignGroupId(e.target.value)}>
                      <option value="">Assign to…</option>
                      {categories.map(cat=>{
                        const catGroups = groups.filter(g=>g.category_id===cat.id);
                        return catGroups.length>0 ? (
                          <optgroup key={cat.id} label={cat.name}>
                            {catGroups.map(g=>(<option key={g.id} value={g.id}>{g.name}</option>))}
                          </optgroup>
                        ) : null;
                      })}
                    </select>
                    <button onClick={bulkAssignToGroup} disabled={!bulkAssignGroupId || bulkAssigning} className="btn btn-primary text-xs py-1.5 px-3">
                      {bulkAssigning ? 'Assigning…' : 'Assign'}
                    </button>
                  </>
                ) : <span style={{fontSize:12,color:'#7A6E60'}}>No groups yet — add one under Settings.</span>}
                <button onClick={()=>setSelectedPersonIds(new Set())} className="btn btn-ghost text-xs py-1.5 px-3">Clear</button>
              </div>
            )}

            {(missingBirthdayCount>0||missingEmailCount>0) && (
              <div className="alert alert-warning">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
                <span><strong>{missingBirthdayCount}</strong> {missingBirthdayCount===1?'person is':'people are'} missing birthdays and <strong>{missingEmailCount}</strong> missing emails — click <em>Edit</em> to fill them in.</span>
              </div>
            )}

            <div className="card p-0 overflow-hidden">
              {filteredPeople.length===0 ? (
                <div className="text-center py-16"><svg className="w-12 h-12 text-navy-200 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg><p className="text-navy-400 text-sm">{peopleSearch?'No results found':peopleGroupFilter!=='all'?'Nobody has this field set yet.':peopleRoleFilter!=='all'?`No ${peopleRoleFilter}s yet.`:'No people yet. They appear after check-ins.'}</p></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr className="bg-cream">
                      <th className="table-header" style={{width:36}}>
                        <input type="checkbox" aria-label="Select all"
                          checked={filteredPeople.length>0 && filteredPeople.every(p=>selectedPersonIds.has(p.id))}
                          onChange={e=>setSelectedPersonIds(e.target.checked ? new Set(filteredPeople.map(p=>p.id)) : new Set())} />
                      </th>
                      <th className="table-header">Name</th>
                      <th className="table-header hidden sm:table-cell">Phone</th>
                      <th className="table-header">Role</th>
                      <th className="table-header hidden lg:table-cell">Groups</th>
                      <th className="table-header hidden lg:table-cell">First Visit</th>
                      <th className="table-header hidden lg:table-cell">Last Seen</th>
                      <th className="table-header hidden md:table-cell">Visits</th>
                      <th className="table-header">Missing Info</th>
                      <th className="table-header text-right">Action</th>
                    </tr></thead>
                    <tbody>
                      {pagedPeople.map(p=>{
                        const missing:string[]=[];
                        if(!p.email) missing.push('email');
                        if(!p.date_of_birth) missing.push('birthday');
                        const personGroupList = groupsByPersonId[p.id]||[];
                        return (
                          <tr key={p.id} className="table-row">
                            <td className="table-cell">
                              <input type="checkbox" aria-label={`Select ${p.full_name}`}
                                checked={selectedPersonIds.has(p.id)}
                                onChange={e=>setSelectedPersonIds(prev=>{ const next=new Set(prev); if(e.target.checked) next.add(p.id); else next.delete(p.id); return next; })} />
                            </td>
                            <td className="table-cell">
                              <div className="flex items-center gap-2.5">
                                <div style={{width:28,height:28,borderRadius:"50%",background:"#F0EBE3",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:"#7A6048",fontFamily:"'Playfair Display',serif",fontWeight:600,flexShrink:0}}>{p.full_name.charAt(0)}</div>
                                <span className="font-medium text-navy-900 text-sm">{p.full_name}</span>
                              </div>
                            </td>
                            <td className="table-cell hidden sm:table-cell text-navy-500 text-sm">{p.phone}</td>
                            <td className="table-cell"><span className={`badge text-[11px] capitalize ${p.role==='leader'?'badge-purple':p.role==='member'?'badge-primary':'badge-warning'}`}>{p.role}</span></td>
                            <td className="table-cell hidden lg:table-cell text-navy-500 text-sm">{personGroupList.length>0 ? personGroupList.map(g=>g.name).join(', ') : <span className="text-navy-300">—</span>}</td>
                            <td className="table-cell hidden lg:table-cell text-navy-500 text-sm whitespace-nowrap">{p.first_attendance_date ? new Date(p.first_attendance_date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : <span className="text-navy-300">—</span>}</td>
                            <td className="table-cell hidden lg:table-cell text-sm whitespace-nowrap">{(()=>{ const w=weeksSince(p.last_checkin_at); if(w===null||!p.last_checkin_at) return <span className="text-navy-300">Never</span>; return (<><span className={w>=3?'text-red-600 font-medium':'text-navy-600'}>{new Date(p.last_checkin_at).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',year:'numeric'})}</span>{w>0&&<span className="text-navy-300"> · {w}w</span>}</>); })()}</td>
                            <td className="table-cell hidden md:table-cell text-navy-500 text-sm">{p.total_checkins}</td>
                            <td className="table-cell">{missing.length>0?<span className="text-amber-600 text-xs font-medium">{missing.join(', ')}</span>:<span className="text-emerald-600 text-xs inline-flex items-center gap-1"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.2 4L19 7" /></svg>Complete</span>}</td>
                            <td className="table-cell text-right">
                              <div className="flex gap-2 justify-end">
                                <button onClick={()=>setEditingPerson(p)} className="btn btn-secondary text-xs py-1.5 px-3">Edit</button>
                                <button onClick={()=>askDelete('people', p.id, p.full_name)} className="btn btn-ghost text-xs py-1.5 px-3 text-red-500">Delete</button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {filteredPeople.length > PEOPLE_PAGE_SIZE && (
                <div className="flex items-center justify-between gap-3 flex-wrap" style={{padding:'12px 16px',borderTop:'1px solid #F0EDE8'}}>
                  <span style={{fontSize:12,color:'#A89D8E'}}>
                    Showing {(peoplePage-1)*PEOPLE_PAGE_SIZE+1}–{Math.min(peoplePage*PEOPLE_PAGE_SIZE, filteredPeople.length)} of {filteredPeople.length}
                  </span>
                  <div className="flex items-center gap-2">
                    <button onClick={()=>setPeoplePage(p=>Math.max(1,p-1))} disabled={peoplePage<=1} className="btn btn-secondary text-xs py-1.5 px-3">Previous</button>
                    <span style={{fontSize:12,color:'#7A6E60'}}>Page {peoplePage} of {peopleTotalPages}</span>
                    <button onClick={()=>setPeoplePage(p=>Math.min(peopleTotalPages,p+1))} disabled={peoplePage>=peopleTotalPages} className="btn btn-secondary text-xs py-1.5 px-3">Next</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── GIVING ── */}
        {tab==='giving' && (
          <div className="admin-page animate-fade-in">

            <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:20,marginBottom:24,flexWrap:'wrap'}}>
              <div>
                <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:24,color:'#16243A',fontWeight:400}}>Giving</h2>
                <p style={{fontSize:13,color:'#7A6E60',fontWeight:300,marginTop:2}}>Record tithes, offerings, seed and pledges — and send receipts.</p>
              </div>
              <button onClick={()=>{resetGivingForm(); setGivingPersonQuery(''); setGivingFormOpen(true);}} className="btn btn-primary text-sm">
                + Record a gift
              </button>
            </div>

            {/* Stat cards */}
            <div className="admin-stat-grid">
              {[
                {label:'Received this month', sub:currentMonthRangeLabel,                 value:`${givingCurrency} ${givingTotalThisMonth.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`},
                {label:'Gifts this month',    sub:`${givingThisMonth.length} record${givingThisMonth.length===1?'':'s'}`, value:String(givingThisMonth.length)},
                {label:'Awaiting receipt',    sub:'Not yet emailed',                       value:String(givingPendingCount)},
                {label:'Received all-time',   sub:`Since you started · ${giving.length} gift${giving.length===1?'':'s'}`, value:`${givingCurrency} ${givingTotalAllTime.toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0})}`},
              ].map(({label,sub,value})=>(
                <div key={label} className="panel admin-stat" style={{padding:'22px 24px'}}>
                  <div style={{fontFamily:"'Playfair Display',serif",fontSize:26,color:'#16243A',lineHeight:1.15,marginBottom:6}}>{value}</div>
                  <div style={{fontSize:13,color:'#7A6E60',fontWeight:300}}>{label}</div>
                  {sub && <div style={{fontSize:11,color:'#A89D8E',fontWeight:300,marginTop:2}}>{sub}</div>}
                </div>
              ))}
            </div>

            {/* This-month breakdown by giving type — so "13 gifts" becomes
                "Tithe 3, Offering 5, Seed 4…" with amounts. */}
            <div className="panel" style={{padding:'20px 24px',marginBottom:24}}>
              <div className="panel-label" style={{display:'block',marginBottom:2}}>This month by type</div>
              <div style={{fontSize:11,color:'#A89D8E',fontWeight:300,marginBottom:16}}>{currentMonthRangeLabel}</div>
              {givingByType.length===0 ? (
                <p style={{fontSize:13,color:'#A89D8E',fontWeight:300}}>No gifts recorded this month yet.</p>
              ) : (
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:14}}>
                  {givingByType.map(t=>(
                    <div key={t.type} style={{borderLeft:'2px solid #EDE7DC',paddingLeft:14}}>
                      <div style={{display:'flex',alignItems:'baseline',gap:8,marginBottom:2}}>
                        <span style={{fontFamily:"'Playfair Display',serif",fontSize:22,color:'#16243A',lineHeight:1}}>{t.count}</span>
                        <span style={{fontSize:13,color:'#7A6E60',fontWeight:300}}>{t.label}{t.count===1?'':'s'}</span>
                      </div>
                      <div style={{fontSize:12,color:'#A89D8E',fontWeight:300}}>{givingCurrency} {t.amount.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Record gift modal */}
            {givingFormOpen && (
              <div style={{position:'fixed',inset:0,zIndex:50,display:'flex',alignItems:'center',justifyContent:'center',padding:16,background:'rgba(22,36,58,0.55)',backdropFilter:'blur(4px)'}}
                onClick={()=>setGivingFormOpen(false)}>
                <div style={{background:'#fff',borderRadius:20,width:'100%',maxWidth:520,maxHeight:'90vh',overflowY:'auto',boxShadow:'0 24px 60px rgba(22,36,58,0.25)'}}
                  onClick={e=>e.stopPropagation()}>
                  <div style={{padding:'24px 28px',borderBottom:'1px solid #E4DFD5',position:'sticky',top:0,background:'#fff',zIndex:1,borderRadius:'20px 20px 0 0'}}>
                    <h3 style={{fontFamily:"'Playfair Display',serif",fontSize:20,color:'#16243A'}}>Record a gift</h3>
                  </div>
                  <div style={{padding:'24px 28px',display:'flex',flexDirection:'column',gap:16}}>

                    <div style={{position:'relative'}}>
                      <label style={{fontSize:12,fontWeight:500,color:'#7A6E60',letterSpacing:'0.06em',textTransform:'uppercase',display:'block',marginBottom:6}}>Giver</label>
                      <input className="input text-sm" placeholder="Search People, or type a name…"
                        value={givingPersonQuery}
                        onChange={e=>{ setGivingPersonQuery(e.target.value); setGivingForm(f=>({...f, person_id:'', giver_name:e.target.value})); }} />
                      {givingPersonMatches.length>0 && givingForm.person_id==='' && (
                        <div style={{position:'absolute',top:'100%',left:0,right:0,background:'#fff',border:'1px solid #E4DFD5',borderRadius:10,marginTop:4,zIndex:10,boxShadow:'0 8px 24px rgba(22,36,58,0.12)',maxHeight:200,overflowY:'auto'}}>
                          {givingPersonMatches.map((p,i,arr)=>(
                            <button key={p.id} type="button" onClick={()=>selectGivingPerson(p)}
                              className="w-full text-left transition-colors hover:bg-[var(--cream)]"
                              style={{padding:'10px 14px',fontSize:13,borderBottom:i===arr.length-1?'none':'1px solid #F0EBE3'}}>
                              <div style={{color:'#16243A',fontWeight:500}}>{p.full_name}</div>
                              <div style={{color:'#A89D8E',fontSize:12}}>{p.phone}{p.email?` · ${p.email}`:''}</div>
                            </button>
                          ))}
                        </div>
                      )}
                      <div style={{fontSize:11,color:'#A89D8E',marginTop:5}}>
                        {givingForm.person_id ? 'Linked to a person in your list.' : 'Not in your list? Just type their name — you can add their email below.'}
                      </div>
                    </div>

                    <div>
                      <label style={{fontSize:12,fontWeight:500,color:'#7A6E60',letterSpacing:'0.06em',textTransform:'uppercase',display:'block',marginBottom:6}}>Email (for receipt)</label>
                      <input className="input text-sm" type="email" placeholder="giver@email.com" value={givingForm.giver_email} onChange={e=>setGivingForm(f=>({...f,giver_email:e.target.value}))} />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2" style={{gap:12}}>
                      <div>
                        <label style={{fontSize:12,fontWeight:500,color:'#7A6E60',letterSpacing:'0.06em',textTransform:'uppercase',display:'block',marginBottom:6}}>Amount (GHS)</label>
                        <input className="input text-sm" type="number" min="0.01" step="0.01" placeholder="0.00" value={givingForm.amount} onChange={e=>setGivingForm(f=>({...f,amount:e.target.value}))} />
                      </div>
                      <div>
                        <label style={{fontSize:12,fontWeight:500,color:'#7A6E60',letterSpacing:'0.06em',textTransform:'uppercase',display:'block',marginBottom:6}}>Type</label>
                        <select className="select text-sm" value={givingForm.giving_type} onChange={e=>setGivingForm(f=>({...f,giving_type:e.target.value as GivingType}))}>
                          <option value="tithe">Tithe</option>
                          <option value="offering">Offering</option>
                          <option value="seed">Seed</option>
                          <option value="pledge">Pledge</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                    </div>

                    {givingForm.giving_type==='other' && (
                      <div>
                        <label style={{fontSize:12,fontWeight:500,color:'#7A6E60',letterSpacing:'0.06em',textTransform:'uppercase',display:'block',marginBottom:6}}>Custom type label</label>
                        <input className="input text-sm" placeholder="e.g. Building Fund" value={givingForm.giving_type_other} onChange={e=>setGivingForm(f=>({...f,giving_type_other:e.target.value}))} />
                      </div>
                    )}

                    <div>
                      <label style={{fontSize:12,fontWeight:500,color:'#7A6E60',letterSpacing:'0.06em',textTransform:'uppercase',display:'block',marginBottom:6}}>Payment method</label>
                      <select className="select text-sm" value={givingForm.payment_method} onChange={e=>setGivingForm(f=>({...f,payment_method:e.target.value as PaymentMethod}))}>
                        <option value="cash">Cash</option>
                        <option value="mobile_money">Mobile Money</option>
                        <option value="bank_transfer">Bank Transfer</option>
                        <option value="other">Other</option>
                      </select>
                    </div>

                    <div>
                      <label style={{fontSize:12,fontWeight:500,color:'#7A6E60',letterSpacing:'0.06em',textTransform:'uppercase',display:'block',marginBottom:6}}>Notes (optional)</label>
                      <textarea className="textarea text-sm" style={{minHeight:80}} rows={2} value={givingForm.notes} onChange={e=>setGivingForm(f=>({...f,notes:e.target.value}))} />
                    </div>

                  </div>
                  <div style={{padding:'18px 28px',borderTop:'1px solid #E4DFD5',display:'flex',justifyContent:'flex-end',gap:10}}>
                    <button onClick={()=>setGivingFormOpen(false)} className="btn btn-secondary text-sm">Cancel</button>
                    <button onClick={handleSaveGiving} disabled={savingGiving || !givingForm.giver_name.trim() || !givingForm.amount} className="btn btn-gold text-sm">
                      {savingGiving ? 'Saving…' : 'Save record'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Giving list */}
            <div className="card p-0 overflow-hidden">
              {giving.length===0 ? (
                <div style={{textAlign:'center',padding:'60px 20px'}}>
                  <div style={{fontFamily:"'Playfair Display',serif",fontSize:18,color:'#16243A',marginBottom:8}}>No gifts recorded yet</div>
                  <div style={{fontSize:14,color:'#A89D8E',fontWeight:300,marginBottom:24}}>Record a tithe, offering or seed and we&apos;ll email the receipt for you.</div>
                  <button onClick={()=>{resetGivingForm(); setGivingPersonQuery(''); setGivingFormOpen(true);}} className="btn btn-primary">
                    Record your first gift
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr className="bg-cream">
                      <th className="table-header">Giver</th>
                      <th className="table-header">Type</th>
                      <th className="table-header">Amount</th>
                      <th className="table-header hidden sm:table-cell">Date</th>
                      <th className="table-header">Status</th>
                      <th className="table-header text-right">Action</th>
                    </tr></thead>
                    <tbody>
                      {giving.map(g=>(
                        <tr key={g.id} className="table-row">
                          <td className="table-cell">
                            <div className="font-medium text-navy-900 text-sm">{g.giver_name}</div>
                            {g.giver_email && <div style={{fontSize:12,color:'#A89D8E'}}>{g.giver_email}</div>}
                          </td>
                          <td className="table-cell"><span className="badge badge-primary text-[11px]">{g.giving_type==='other'?(g.giving_type_other||'Other'):GIVING_TYPE_LABELS[g.giving_type]}</span></td>
                          <td className="table-cell text-navy-900 text-sm font-medium">{g.currency} {Number(g.amount).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                          <td className="table-cell hidden sm:table-cell text-navy-500 text-sm">{new Date(g.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</td>
                          <td className="table-cell">
                            <span className={`badge text-[11px] ${g.status==='sent'?'badge-primary':'badge-warning'}`}>{g.status==='sent'?'Receipt sent':'Recorded'}</span>
                          </td>
                          <td className="table-cell text-right">
                            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
                              {g.giver_email && (
                                <button onClick={()=>handleSendReceipt(g.id)} disabled={sendingReceiptId===g.id}
                                  className="btn btn-secondary text-xs py-1.5 px-3">
                                  {sendingReceiptId===g.id ? 'Sending…' : g.status==='sent' ? 'Resend' : 'Send Receipt'}
                                </button>
                              )}
                              <button onClick={()=>askDelete('giving', g.id, `${g.giver_name}'s gift`)} className="btn btn-ghost text-xs py-1.5 px-3 text-red-500">Delete</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── ANALYTICS ── */}
        {tab==='analytics' && (
          <div className="admin-page animate-fade-in">

            <div style={{marginBottom:28}}>
              <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:26,color:'#16243A',fontWeight:400,marginBottom:4}}>Attendance Trends</h2>
              <p style={{fontSize:14,color:'#7A6E60',fontWeight:300}}>How your congregation is growing over time.</p>
            </div>

            {/* Top stat cards */}
            <div className="admin-stat-grid">
              {[
                {label:'Check-ins this month', sub:currentMonthRangeLabel,        value:currentMonthCheckins.length},
                {label:'Check-ins last month', sub:lastMonthRangeLabel,           value:lastMonthCheckins.length},
                {label:'New this month',       sub:'First-time visitors',         value:firstTimersThisMonth},
                {label:'Total congregation',   sub:'Active members & visitors',   value:activePeople.length},
              ].map(({label,sub,value})=>(
                <div key={label} className="panel admin-stat" style={{padding:'22px 24px'}}>
                  <div style={{fontFamily:"'Playfair Display',serif",fontSize:34,color:'#16243A',lineHeight:1,marginBottom:6}}>{value}</div>
                  <div style={{fontSize:13,color:'#7A6E60',fontWeight:300}}>{label}</div>
                  <div style={{fontSize:11,color:'#A89D8E',fontWeight:300,marginTop:2}}>{sub}</div>
                </div>
              ))}
            </div>

            {/* Attendance trend — returning vs first-time, stacked */}
            <div className="panel" style={{padding:'28px',marginBottom:20}}>
              <div className="panel-label" style={{display:'block',marginBottom:4}}>Monthly attendance — last 6 months</div>
              <p style={{fontSize:13,color:'#7A6E60',fontWeight:300,margin:'0 0 18px'}}>Each column is one month&apos;s check-ins, split by who was new.</p>
              <StackedTrend data={monthlyTrend.map(([month,v])=>({label:formatMonth(month),returning:v.returning,firstTime:v.firstTime}))} />
            </div>

            {/* The question attendance alone can't answer: is the church
                actually bigger than it was six months ago, not just busier. */}
            <div className="panel" style={{padding:'28px',marginBottom:20}}>
              <div className="panel-label" style={{display:'block',marginBottom:4}}>Congregation growth — last 6 months</div>
              <p style={{fontSize:13,color:'#7A6E60',fontWeight:300,margin:'0 0 18px'}}>Total active members &amp; visitors, counted from each person&apos;s first visit.</p>
              <SingleTrend data={congregationGrowth} />
            </div>

            {/* Giving by type — one series, so every bar takes the same hue */}
            <div className="panel" style={{padding:'28px',marginBottom:20}}>
              <div className="panel-label" style={{display:'block',marginBottom:4}}>Giving by type — this month</div>
              <p style={{fontSize:13,color:'#7A6E60',fontWeight:300,margin:'0 0 18px'}}>{currentMonthRangeLabel}</p>
              <RankedBars
                empty="No giving recorded this month yet."
                rows={givingByType.map(t=>({
                  label: t.label,
                  value: t.amount,
                  display: `${givingCurrency} ${t.amount.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`,
                }))}
              />
            </div>

            {/* Year over year — quiet until there's a second year to compare
                against, then it's already there. */}
            <div className="panel" style={{padding:'28px',marginBottom:20}}>
              <div className="panel-label" style={{display:'block',marginBottom:4}}>Year over year</div>
              <p style={{fontSize:13,color:'#7A6E60',fontWeight:300,margin:'0 0 18px'}}>{currentYearRangeLabel} vs {lastYearRangeLabel}</p>
              {!hasAnyYearData ? (
                <p style={{fontSize:13,color:'#A89D8E',fontWeight:300}}>No data yet for {currentYearKey} or {lastYearKey}.</p>
              ) : (
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:20}}>
                  {yearComparisons.map(c=>(
                    <div key={c.label}>
                      <div style={{fontSize:11,letterSpacing:'0.08em',textTransform:'uppercase',color:'#A89D8E',fontWeight:500,marginBottom:8}}>{c.label}</div>
                      <div style={{display:'flex',alignItems:'baseline',gap:10,flexWrap:'wrap'}}>
                        <div style={{fontFamily:"'Playfair Display',serif",fontSize:28,color:'#16243A',lineHeight:1}}>{c.currDisplay}</div>
                        {c.delta !== null && (
                          <span style={{fontSize:13,fontWeight:600,color:c.delta>=0?'#2E7D4E':'#B23B3B'}}>
                            {c.delta>=0?'▲':'▼'} {Math.abs(c.delta)}%
                          </span>
                        )}
                      </div>
                      <div style={{fontSize:12,color:'#A89D8E',marginTop:4}}>
                        {c.delta===null ? `vs ${c.prevDisplay} in ${lastYearKey} (no prior year to compare)` : `vs ${c.prevDisplay} in ${lastYearKey}`}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Actionable insights — the panels worth acting on (who's
                slipping, who's converting, who to thank) lead and carry a
                touch more weight, ahead of the passive demographic
                breakdowns below. */}
            <div className="grid gap-5 grid-cols-1 md:grid-cols-3" style={{marginBottom:20}}>

              {/* Retention rate */}
              <div className="panel" style={{padding:'24px 28px',borderLeft:'3px solid var(--series-1)'}}>
                <div className="panel-label" style={{display:'block',marginBottom:16}}>Visitor retention</div>
                {retentionRate === null
                  ? <p style={{fontSize:13,color:'#A89D8E',fontWeight:300}}>Not enough data yet — needs first-timers last month to measure.</p>
                  : <>
                      <div style={{fontFamily:"'Playfair Display',serif",fontSize:40,color:retentionRate>=50?'#2E7D4E':'#C97B1A',lineHeight:1,marginBottom:8}}>{retentionRate}%</div>
                      <div style={{fontSize:13,color:'#7A6E60',fontWeight:300,lineHeight:1.5}}>
                        <strong style={{color:'#16243A',fontWeight:600}}>{retained} of {lastMonthFirstTimers.size}</strong> first-time visitors from last month ({lastMonthRangeLabel}) came back this month ({currentMonthRangeLabel}).
                      </div>
                      {/* Meter: the unfilled track is a light step of the fill's
                          own ramp, so the state reads across the whole bar. */}
                      <div style={{height:8,background:'var(--chart-track)',borderRadius:4,overflow:'hidden',marginTop:14}}>
                        <div style={{height:8,width:`${retentionRate}%`,background:retentionRate>=50?'var(--series-3)':'var(--series-2)',borderRadius:4,transition:'all .5s'}}/>
                      </div>
                    </>
                }
              </div>

              {/* Visitor -> member conversion */}
              <div className="panel" style={{padding:'24px 28px',borderLeft:'3px solid var(--series-1)'}}>
                <div className="panel-label" style={{display:'block',marginBottom:16}}>Visitor → member conversion</div>
                {conversionRate === null
                  ? <p style={{fontSize:13,color:'#A89D8E',fontWeight:300}}>Not enough data yet — needs visitors from {CONVERSION_WINDOW_DAYS}+ days ago to measure.</p>
                  : <>
                      <div style={{fontFamily:"'Playfair Display',serif",fontSize:40,color:conversionRate>=30?'#2E7D4E':'#C97B1A',lineHeight:1,marginBottom:8}}>{conversionRate}%</div>
                      <div style={{fontSize:13,color:'#7A6E60',fontWeight:300,lineHeight:1.5}}>
                        <strong style={{color:'#16243A',fontWeight:600}}>{convertedCount} of {conversionCohort.length}</strong> people who joined more than {CONVERSION_WINDOW_DAYS} days ago are now members or leaders.
                      </div>
                      <div style={{height:8,background:'var(--chart-track)',borderRadius:4,overflow:'hidden',marginTop:14}}>
                        <div style={{height:8,width:`${conversionRate}%`,background:conversionRate>=30?'var(--series-3)':'var(--series-2)',borderRadius:4,transition:'all .5s'}}/>
                      </div>
                    </>
                }
              </div>

              {/* Most consistent attenders */}
              <div className="panel" style={{padding:'24px 28px',borderLeft:'3px solid var(--series-1)'}}>
                <div className="panel-label" style={{display:'block',marginBottom:16}}>Most faithful attenders</div>
                {topAttenders.length===0
                  ? <p style={{fontSize:13,color:'#A89D8E',fontWeight:300}}>No attendance data yet</p>
                  : topAttenders.map((p,i)=>(
                      <div key={p.id} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 0',borderBottom:'1px solid #F0EBE3'}}>
                        <div style={{fontFamily:"'Playfair Display',serif",fontSize:16,color:'#C97B1A',width:20,flexShrink:0}}>{i+1}</div>
                        <div style={{width:32,height:32,borderRadius:'50%',background:'#F0EBE3',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,color:'#7A6048',fontFamily:"'Playfair Display',serif",flexShrink:0}}>
                          {p.full_name.charAt(0)}
                        </div>
                        <div style={{flex:1,fontSize:13,color:'#1C2A3A',fontWeight:500}}>{p.full_name}</div>
                        <div style={{fontSize:13,color:'#7A6E60',fontWeight:300}}>{p.total_checkins} visits</div>
                      </div>
                    ))
                }
              </div>

            </div>

            {/* Demographic breakdowns — background reading, not action items,
                so they stay in a lighter, denser grid below the fold. */}
            <div className="grid gap-5 grid-cols-1 md:grid-cols-2">

              {/* Gender */}
              <div className="panel" style={{padding:'24px 28px'}}>
                <div className="panel-label" style={{display:'block',marginBottom:16}}>Gender</div>
                {/* Part-to-whole, so one split bar rather than a pie — two slices
                    is the case a pie handles worst, and this survives a phone. */}
                <SplitBar
                  empty="No data yet — add genders in People tab"
                  segments={Object.entries(genderCounts).map(([label,count],i)=>({
                    label,
                    value:count,
                    color:['var(--series-1)','var(--series-2)','var(--series-3)'][i] ?? 'var(--chart-axis)',
                  }))}
                />
              </div>

              {/* Age groups */}
              <div className="panel" style={{padding:'24px 28px'}}>
                <div className="panel-label" style={{display:'block',marginBottom:16}}>Age groups</div>
                {/* Age bands have a natural order, so they take the ordinal ramp —
                    the reader sees young→old in the colour, not just the length.
                    Bands are listed in age order, never sorted by size. */}
                <OrdinalBars
                  empty="No data yet — add birthdays in People tab"
                  rows={AGE_BANDS.filter(b=>ageGroups[b]).map(b=>({label:b,value:ageGroups[b]}))}
                />
              </div>

              {/* Top locations */}
              <div className="panel" style={{padding:'24px 28px'}}>
                <div className="panel-label" style={{display:'block',marginBottom:16}}>Where people come from</div>
                {topLocations.length===0
                  ? <p style={{fontSize:13,color:'#A89D8E',fontWeight:300}}>No location data yet</p>
                  : topLocations.map(([label,count])=>(
                      <div key={label} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'9px 0',borderBottom:'1px solid #F0EBE3'}}>
                        <span style={{fontSize:13,color:'#7A6E60',fontWeight:300,textTransform:'capitalize'}}>{label}</span>
                        <span style={{fontSize:15,color:'#16243A',fontFamily:"'Playfair Display',serif"}}>{count}</span>
                      </div>
                    ))
                }
              </div>

              {/* How they found us */}
              <div className="panel" style={{padding:'24px 28px'}}>
                <div className="panel-label" style={{display:'block',marginBottom:16}}>How people found you</div>
                {howFoundUs.length===0
                  ? <p style={{fontSize:13,color:'#A89D8E',fontWeight:300}}>No data yet</p>
                  : howFoundUs.map(([label,count])=>(
                      <div key={label} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'9px 0',borderBottom:'1px solid #F0EBE3'}}>
                        <span style={{fontSize:13,color:'#7A6E60',fontWeight:300,textTransform:'capitalize'}}>{label}</span>
                        <span style={{fontSize:15,color:'#16243A',fontFamily:"'Playfair Display',serif"}}>{count}</span>
                      </div>
                    ))
                }
              </div>

              {/* Occupations */}
              <div className="panel" style={{padding:'24px 28px'}}>
                <div className="panel-label" style={{display:'block',marginBottom:16}}>Top occupations</div>
                {/* Occupations have no inherent order, so every bar wears slot 1.
                    Shading them by size would spend the colour channel repeating
                    what the bar length already says. */}
                <RankedBars
                  empty="No data yet — add occupations in People tab"
                  rows={topOccupations.map(([label,count])=>({label,value:count}))}
                />
              </div>

            </div>
          </div>
        )}

                {/* ── EMAILS ── */}
        {tab==='emails' && (
          <div className="admin-page space-y-8 animate-fade-in">

            {/* Header */}
            <div>
              <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:26,color:'#16243A',fontWeight:400,marginBottom:4}}>Messaging</h2>
              <p style={{fontSize:14,color:'#7A6E60',fontWeight:300}}>Email and SMS, in one place. Automatic templates send themselves — broadcasts go out when you want them to.</p>
            </div>

            {/* Three email templates — accordion, one open at a time */}
            <div>
              <div style={{fontSize:11,letterSpacing:'0.12em',textTransform:'uppercase',color:'#A89D8E',fontWeight:500,marginBottom:2}}>Email — Automatic Templates</div>
              <div style={{fontSize:13,color:'#7A6E60',fontWeight:300,marginBottom:14}}>Which email would you like to edit?</div>
              <div style={{background:'#fff',border:'1px solid #E4DFD5',borderRadius:16,overflow:'hidden'}}>
                <WarmEmailCard title="Welcome Email" kind="welcome" description="Sent after someone's very first visit" churchName={session.orgName} activeService={activeService} showServiceInfo={true} value={draftTemplates.welcome} onChange={next=>setDraftTemplates(p=>({...p,welcome:next}))} onSave={()=>saveTemplate('welcome',draftTemplates.welcome.subject,draftTemplates.welcome.body)} saving={savingTemplate==='welcome'} expanded={expandedTemplate==='welcome'} onToggle={()=>setExpandedTemplate(t=>t==='welcome'?null:'welcome')} isFirst />
                <WarmEmailCard title="Birthday Email" kind="birthday" description="Sent automatically on someone's birthday" churchName={session.orgName} showServiceInfo={false} value={draftTemplates.birthday} onChange={next=>setDraftTemplates(p=>({...p,birthday:next}))} onSave={()=>saveTemplate('birthday',draftTemplates.birthday.subject,draftTemplates.birthday.body)} saving={savingTemplate==='birthday'} expanded={expandedTemplate==='birthday'} onToggle={()=>setExpandedTemplate(t=>t==='birthday'?null:'birthday')} />
                <WarmEmailCard title="We Miss You" kind="missed" description="Sent when a member misses 2 or more services" churchName={session.orgName} showServiceInfo={false} value={draftTemplates.missed} onChange={next=>setDraftTemplates(p=>({...p,missed:next}))} onSave={()=>saveTemplate('missed',draftTemplates.missed.subject,draftTemplates.missed.body)} saving={savingTemplate==='missed'} expanded={expandedTemplate==='missed'} onToggle={()=>setExpandedTemplate(t=>t==='missed'?null:'missed')} isLast />
              </div>
            </div>

            {/* Broadcast */}
            <div style={{borderTop:'1px solid #E4DFD5',paddingTop:32}}>
              <div style={{fontSize:11,letterSpacing:'0.12em',textTransform:'uppercase',color:'#A89D8E',fontWeight:500,marginBottom:16}}>Email — One-off Broadcast</div>
              <div style={{background:'#fff',border:'1px solid #E4DFD5',borderRadius:16,padding:'28px 32px'}}>
                <div style={{display:'flex',alignItems:'flex-start',gap:14,marginBottom:24}}>
                  <div style={{width:44,height:44,borderRadius:12,background:'#EEF2F8',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" stroke="#486581" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3.5 8.5v7a1.5 1.5 0 001.5 1.5h1.5l5 4v-18l-5 4H5a1.5 1.5 0 00-1.5 1.5z" />
                      <path d="M16.5 9a4 4 0 010 6M19.5 6.5a8 8 0 010 11" />
                    </svg>
                  </div>
                  <div>
                    <div style={{fontFamily:"'Playfair Display',serif",fontSize:18,color:'#16243A',marginBottom:3}}>Send a message to your congregation</div>
                    <div style={{fontSize:13,color:'#A89D8E',fontWeight:300}}>Announcements, reminders, special events</div>
                  </div>
                </div>

                <div style={{marginBottom:18}}>
                  <div style={{fontSize:12,fontWeight:500,color:'#7A6E60',letterSpacing:'0.06em',textTransform:'uppercase',marginBottom:10}}>Who should receive this?</div>
                  <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
                    {[{v:'all',l:'Everyone'},{v:'first_timers_month',l:'First-timers this month'},{v:'inactive_30',l:"Haven't visited in 30+ days"},{v:'members',l:'Members only'}].map(opt=>(
                      <button key={opt.v} type="button" onClick={()=>setCustomEmail(p=>({...p,audience:opt.v}))}
                        style={{background:customEmail.audience===opt.v?'#16243A':'#fff',color:customEmail.audience===opt.v?'#fff':'#5A4E3C',border:customEmail.audience===opt.v?'1px solid #16243A':'1px solid #D4CBBC',borderRadius:30,padding:'8px 18px',fontSize:14,cursor:'pointer',transition:'all .15s',fontFamily:"'DM Sans',sans-serif"}}>
                        {opt.l}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{marginBottom:16}}>
                  <label style={{fontSize:12,fontWeight:500,color:'#7A6E60',letterSpacing:'0.06em',textTransform:'uppercase' as const,display:'block' as const,marginBottom:8}}>Subject</label>
                  <input value={customEmail.subject} onChange={e=>setCustomEmail(p=>({...p,subject:e.target.value}))} className="input" placeholder="e.g. Special announcement this Sunday" />
                </div>
                <div style={{marginBottom:20}}>
                  <label style={{fontSize:12,fontWeight:500,color:'#7A6E60',letterSpacing:'0.06em',textTransform:'uppercase' as const,display:'block' as const,marginBottom:8}}>Your message</label>
                  <textarea value={customEmail.message} onChange={e=>setCustomEmail(p=>({...p,message:e.target.value}))} className="textarea min-h-[130px]" placeholder="Write your message here…" />
                  <div style={{fontSize:12,color:'#A89D8E',marginTop:6}}>Each person will receive this with their own name at the top.</div>
                </div>
                <button onClick={sendCustomEmail} disabled={sendingCustom||!customEmail.subject||!customEmail.message} className="btn btn-gold w-full">
                  {sendingCustom ? 'Sending…' : 'Send Broadcast'}
                </button>
              </div>
            </div>

            {/* SMS — same page as email since both are "reach the congregation" */}
            <div style={{borderTop:'1px solid #E4DFD5',paddingTop:32}}>
              <div style={{fontSize:11,letterSpacing:'0.12em',textTransform:'uppercase',color:'#A89D8E',fontWeight:500,marginBottom:16}}>SMS</div>

              <div className="card space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="panel-label" style={{display:'block',marginBottom:4}}>SMS Notifications</div>
                    <p style={{fontSize:13,color:'#7A6E60',fontWeight:300,lineHeight:1.7}}>
                      Sent to members who have no email address. Each SMS costs 0.40 GHC from your credit balance.
                    </p>
                  </div>
                  <div style={{textAlign:'right',flexShrink:0}}>
                    <div style={{fontSize:11,color:'#A89D8E',fontWeight:300,marginBottom:2}}>Balance</div>
                    <div style={{fontSize:22,fontWeight:600,color:'#16243A',lineHeight:1}}>{smsSettings.sms_credits}</div>
                    <div style={{fontSize:11,color:'#A89D8E',fontWeight:300}}>credits</div>
                  </div>
                </div>

                {/* Sender ID */}
                <div style={{borderTop:'1px solid #F0EDE8',paddingTop:16}}>
                  <label className="block text-sm font-medium text-navy-700 mb-1">SMS Sender Name</label>
                  {/* Self-service field — a church can type any name here.
                      The one real constraint is outside our control: mobile
                      networks only deliver sender IDs that have been
                      registered with them in advance, so this doubles as the
                      instruction for how that actually happens. */}
                  <p style={{fontSize:11,color:'#A89D8E',fontWeight:300,marginBottom:8,lineHeight:1.6}}>
                    The name recipients see instead of a phone number. Max 11 characters, no spaces.
                    Enter your church&apos;s name here, then <strong style={{color:'#7A6E60',fontWeight:500}}>message us to get it registered</strong> with
                    the mobile networks — once approved, your SMS will send under this name instead of the platform default.
                  </p>
                  <input
                    className="input"
                    style={{maxWidth:200,fontFamily:'monospace',letterSpacing:'0.05em'}}
                    placeholder="e.g. GraceChurch"
                    maxLength={11}
                    value={smsSettings.sms_sender_id}
                    onChange={e => setSmsSettings(s => ({ ...s, sms_sender_id: e.target.value.replace(/\s/g,'').slice(0,11) }))}
                  />
                </div>

                {/* Toggles */}
                <div className="space-y-3">
                  {([
                    { key: 'sms_welcome_enabled',  label: 'Welcome SMS',      desc: 'First-time visitors without an email address.', usageKey: 'welcome' },
                    { key: 'sms_birthday_enabled', label: 'Birthday SMS',     desc: 'Members whose email is missing on their birthday.', usageKey: 'birthday' },
                    { key: 'sms_missed_enabled',   label: 'Missed-service SMS', desc: 'Members without email who missed two services in a row.', usageKey: 'missed' },
                  ] as const).map(({ key, label, desc, usageKey }) => (
                    <div key={key} className="flex items-center justify-between gap-4 py-2" style={{borderTop:'1px solid #F0EDE8'}}>
                      <div>
                        <div style={{fontSize:14,fontWeight:500,color:'#16243A'}}>{label}</div>
                        <div style={{fontSize:12,color:'#A89D8E',fontWeight:300}}>{desc}</div>
                        {smsUsage[usageKey] > 0 && (
                          <div style={{fontSize:11,color:'#C97B1A',fontWeight:500,marginTop:2}}>{smsUsage[usageKey]} credits used in last 30 days</div>
                        )}
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={smsSettings[key]}
                        onClick={() => setSmsSettings(s => ({ ...s, [key]: !s[key] }))}
                        style={{
                          width:44, height:24, borderRadius:12, border:'none', cursor:'pointer', flexShrink:0,
                          background: smsSettings[key] ? 'var(--series-1, #2F5C99)' : '#D4CFC9',
                          position:'relative', transition:'background 0.15s',
                        }}
                      >
                        <span style={{
                          position:'absolute', top:3, left: smsSettings[key] ? 23 : 3,
                          width:18, height:18, borderRadius:'50%', background:'#fff',
                          transition:'left 0.15s', boxShadow:'0 1px 3px rgba(0,0,0,0.2)',
                        }} />
                      </button>
                    </div>
                  ))}
                </div>

                <button onClick={saveSmsSettings} disabled={savingSms} className="btn btn-gold text-sm">
                  {savingSms ? 'Saving…' : 'Save SMS Settings'}
                </button>

                {/* Top-up */}
                <div style={{borderTop:'1px solid #F0EDE8',paddingTop:16}}>
                  <div style={{fontSize:13,fontWeight:500,color:'#16243A',marginBottom:4}}>Top up SMS credits</div>
                  <p style={{fontSize:12,color:'#A89D8E',fontWeight:300,marginBottom:12,lineHeight:1.6}}>
                    Pay by MoMo or card via Paystack. Credits are added automatically once payment clears.
                    Minimum 5 GHC (12 credits).
                  </p>
                  <div className="flex gap-2 items-center">
                    <div className="relative flex-1">
                      <span style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',fontSize:13,color:'#7A6E60',fontWeight:500,pointerEvents:'none'}}>GHC</span>
                      <input
                        className="input"
                        style={{paddingLeft:44}}
                        type="number"
                        min="5"
                        max="5000"
                        step="1"
                        placeholder="e.g. 50"
                        value={smsTopupAmount}
                        onChange={e => setSmsTopupAmount(e.target.value)}
                      />
                    </div>
                    {smsTopupAmount && parseFloat(smsTopupAmount) >= 5 && (
                      <span style={{fontSize:12,color:'#7A6E60',whiteSpace:'nowrap'}}>
                        = {Math.floor(parseFloat(smsTopupAmount) * 100 / 40)} credits
                      </span>
                    )}
                    <button
                      onClick={initSmsTopup}
                      disabled={toppingUp || !smsTopupAmount || parseFloat(smsTopupAmount) < 5}
                      className="btn btn-gold text-sm shrink-0"
                    >
                      {toppingUp ? 'Redirecting…' : 'Pay'}
                    </button>
                  </div>
                </div>
              </div>

              {/* SMS Broadcast */}
              <div className="card space-y-4" style={{marginTop:20}}>
                <div>
                  <div className="panel-label" style={{display:'block',marginBottom:4}}>SMS Broadcast</div>
                  <p style={{fontSize:13,color:'#7A6E60',fontWeight:300,lineHeight:1.7}}>
                    Send a message to your congregation. Credits are deducted per recipient; failed deliveries are refunded.
                  </p>
                  {/* What actually gets used is whatever's saved in the
                      database, not whatever's sitting unsaved in the Sender
                      Name field above — a text arriving under the wrong
                      name is exactly what made this feature look broken
                      when it was really just an un-clicked Save button. */}
                  <p style={{fontSize:12,color:'#A89D8E',marginTop:6}}>
                    Sending as: <strong style={{color:'#5A4E3C'}}>{savedSenderId || 'WeMotiply'}</strong>
                    {!savedSenderId && ' (set and save a Sender Name above to send as your church instead)'}
                  </p>
                  {smsSettings.sms_sender_id !== savedSenderId && (
                    <p style={{fontSize:12,color:'#C97B1A',marginTop:4,fontWeight:500}}>
                      You typed a new Sender Name above but haven&apos;t saved it yet — this send will still go out as &ldquo;{savedSenderId || 'WeMotiply'}&rdquo;.
                    </p>
                  )}
                </div>

                {broadcastResult && (
                  <div style={{background:'#EDF6F1',borderRadius:10,padding:'10px 14px',fontSize:13,color:'#2E7D4E'}}>
                    Accepted for delivery: {broadcastResult.delivered} people — {broadcastResult.credits_used} credits used.
                    {broadcastResult.failed > 0 && ` ${broadcastResult.failed} failed (refunded).`}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-navy-600 mb-1.5">Recipients</label>
                  <select
                    className="select"
                    value={broadcastFilter}
                    onChange={e => setBroadcastFilter(e.target.value)}
                  >
                    <option value="all">Everyone (all active members & visitors)</option>
                    <option value="members">Members only</option>
                    <option value="visitors">Visitors only</option>
                    {categories.flatMap(cat =>
                      groups.filter(g => g.category_id === cat.id).map(g => (
                        <option key={g.id} value={`group:${g.id}`}>{cat.name}: {g.name}</option>
                      ))
                    )}
                    <option value="specific">Specific people…</option>
                  </select>
                </div>

                {broadcastFilter === 'specific' && (() => {
                  // Same search-by-name/phone/email pattern as the People
                  // tab, scoped to a small picker instead of the full table —
                  // texting a handful of volunteers shouldn't require making
                  // a permanent Group first.
                  const q = specificSearch.trim().toLowerCase();
                  const candidates = activePeople.filter(p => {
                    if (!q) return true;
                    return p.full_name?.toLowerCase().includes(q) || p.phone?.includes(q) || p.email?.toLowerCase().includes(q);
                  }).slice(0, 200);
                  return (
                    <div>
                      <label className="block text-xs font-medium text-navy-600 mb-1.5">
                        Select recipients {specificRecipientIds.size > 0 && `(${specificRecipientIds.size} selected)`}
                      </label>
                      <input
                        className="input text-sm"
                        placeholder="Search by name, phone or email…"
                        value={specificSearch}
                        onChange={e => setSpecificSearch(e.target.value)}
                        style={{ marginBottom: 8 }}
                      />
                      <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #E4DFD5', borderRadius: 10, padding: '4px 12px' }}>
                        {candidates.length === 0 ? (
                          <div style={{ padding: '12px 4px', fontSize: 13, color: '#A89D8E' }}>No matches.</div>
                        ) : candidates.map(p => {
                          const disabled = !p.phone || p.sms_opted_out;
                          const checked = specificRecipientIds.has(p.id);
                          return (
                            <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px', borderBottom: '1px solid #F0EBE3', opacity: disabled ? 0.45 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}>
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={disabled}
                                onChange={e => setSpecificRecipientIds(prev => {
                                  const next = new Set(prev);
                                  if (e.target.checked) next.add(p.id); else next.delete(p.id);
                                  return next;
                                })}
                              />
                              <span style={{ flex: 1, fontSize: 13.5, color: '#1C2A3A' }}>{p.full_name}</span>
                              <span style={{ fontSize: 12, color: '#A89D8E' }}>{disabled ? (p.sms_opted_out ? 'Opted out' : 'No phone') : p.phone}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                <div>
                  <label className="block text-xs font-medium text-navy-600 mb-1.5">Message</label>
                  <textarea
                    className="textarea"
                    rows={4}
                    maxLength={459}
                    placeholder="Type your message here…"
                    value={broadcastMsg}
                    onChange={e => setBroadcastMsg(e.target.value)}
                  />
                  <div style={{fontSize:11,color:'#A89D8E',marginTop:4,display:'flex',justifyContent:'space-between'}}>
                    <span>{broadcastMsg.length}/459 characters</span>
                    <span>{broadcastMsg.length === 0 ? '' : broadcastMsg.length <= 160 ? '1 SMS part' : `${Math.ceil(broadcastMsg.length/153)} SMS parts`}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div style={{fontSize:13,color:'#7A6E60'}}>
                    {broadcastMsg.trim() && smsSettings.sms_credits > 0 && (
                      <span>Each recipient costs {broadcastMsg.length <= 160 ? 1 : Math.ceil(broadcastMsg.length/153)} credit{broadcastMsg.length > 160 ? 's' : ''}</span>
                    )}
                  </div>
                  <button
                    onClick={sendBroadcast}
                    disabled={broadcastSending || !broadcastMsg.trim() || smsSettings.sms_credits < 1}
                    className="btn btn-gold text-sm shrink-0"
                  >
                    {broadcastSending ? 'Sending…' : 'Send Broadcast'}
                  </button>
                </div>

                {/* Broadcast history */}
                {broadcasts.length > 0 && (
                  <div style={{borderTop:'1px solid #F0EDE8',paddingTop:16}}>
                    <div style={{fontSize:12,fontWeight:500,color:'#7A6E60',marginBottom:10,textTransform:'uppercase',letterSpacing:'0.08em'}}>Recent Broadcasts</div>
                    <div className="space-y-2">
                      {broadcasts.map(b => (
                        <div key={b.id} style={{background:'#FAF9F6',borderRadius:8,padding:'10px 12px',fontSize:13}}>
                          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8}}>
                            <div style={{color:'#16243A',flex:1,lineHeight:1.4}}>{b.message.slice(0, 80)}{b.message.length > 80 ? '…' : ''}</div>
                            <div style={{fontSize:11,color:'#A89D8E',whiteSpace:'nowrap',flexShrink:0}}>
                              {new Date(b.created_at).toLocaleDateString()}
                            </div>
                          </div>
                          <div style={{fontSize:11,color:'#A89D8E',marginTop:4}}>
                            {b.delivered_count} accepted · {b.credits_used} credits · {b.sender_id}
                            {b.failed_count > 0 && ` · ${b.failed_count} failed`}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── SETTINGS ── */}
        {tab==='settings' && (
          <div className="admin-page space-y-5 animate-fade-in">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div><h2 style={{fontFamily:"'Playfair Display',serif",fontSize:24,color:'#16243A',fontWeight:400,marginBottom:4}}>Settings</h2><p style={{fontSize:14,color:'#7A6E60',fontWeight:300}}>Set these once and you&apos;re done.</p></div>
              <button onClick={saveBranding} disabled={savingBranding} className="btn btn-gold text-sm shrink-0">{savingBranding?'Saving…':'Save Settings'}</button>
            </div>
            <div className="grid lg:grid-cols-2 gap-5">
              <div className="card space-y-4">
                <div className="panel-label" style={{display:'block',marginBottom:4}}>Church Branding</div>
                <div><label className="block text-sm font-medium text-navy-700 mb-1.5">Church Name</label><input className="input" placeholder="e.g. Grace Community Church" value={branding.org_name} onChange={e=>setBranding(b=>({...b,org_name:e.target.value}))} /></div>
                <div><label className="block text-sm font-medium text-navy-700 mb-1.5">Tagline</label><input className="input" placeholder="e.g. A place of worship and community" value={branding.tagline} onChange={e=>setBranding(b=>({...b,tagline:e.target.value}))} /></div>
                <div><label className="block text-sm font-medium text-navy-700 mb-1.5">Host Names</label><input className="input" placeholder="e.g. Pastor John & Lady Mary" value={branding.host_names} onChange={e=>setBranding(b=>({...b,host_names:e.target.value}))} /></div>
                <div>
                  <label className="block text-sm font-medium text-navy-700 mb-1.5">Time Zone</label>
                  <p style={{fontSize:11,color:'#A89D8E',marginBottom:8,fontWeight:300}}>Decides what counts as &ldquo;today&rdquo; and &ldquo;this month&rdquo; in your reports, and which day birthday emails go out on.</p>
                  <select className="select" value={branding.timezone} onChange={e=>setBranding(b=>({...b,timezone:e.target.value}))}>
                    <option value="">Not set — using UTC</option>
                    {TIMEZONES.map(tz=>(<option key={tz.value} value={tz.value}>{tz.label}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-navy-700 mb-1.5">Church Logo</label>
                  <p style={{fontSize:11,color:'#A89D8E',marginBottom:8,fontWeight:300}}>Shown on your kiosk screen.</p>
                  <div className="flex items-start gap-4">
                    {branding.logo_url?<img src={branding.logo_url} alt="Logo" className="w-16 h-16 rounded-xl border border-navy-200 object-cover bg-white flex-shrink-0" />:<div style={{width:64,height:64,borderRadius:12,border:"2px dashed #E4DFD5",background:"#FAF9F6",display:"flex",alignItems:"center",justifyContent:"center",color:"#A89D8E",fontSize:12,flexShrink:0}}>Logo</div>}
                    <div className="flex-1"><input type="file" accept="image/*" className="block w-full text-sm text-navy-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-navy-100 file:text-navy-700 file:text-sm hover:file:bg-navy-200 cursor-pointer" onChange={e=>uploadBrandingImage('logo',e.target.files?.[0]||null)} />{uploading==='logo'&&<p className="text-xs text-navy-400 mt-1.5">Uploading…</p>}</div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-navy-700 mb-1.5">Your Kiosk Color</label>
                  <p style={{fontSize:11,color:'#A89D8E',marginBottom:8,fontWeight:300}}>Colors the screen your visitors check in on — not this dashboard.</p>
                  <div className="flex gap-2 items-center">
                    <input type="color" className="h-10 w-12 rounded-lg border border-navy-200 cursor-pointer" value={branding.brand_color||'#102a43'} onChange={e=>setBranding(b=>({...b,brand_color:e.target.value}))} />
                    <input className="input flex-1" value={branding.brand_color} onChange={e=>setBranding(b=>({...b,brand_color:e.target.value}))} />
                  </div>
                </div>
              </div>

              <div className="card space-y-4">
                <div className="panel-label" style={{display:'block',marginBottom:4}}>Kiosk Welcome Screen</div>
                <div><label className="block text-sm font-medium text-navy-700 mb-1.5">Welcome Heading</label><input className="input" placeholder="e.g. Welcome to Grace Church" value={branding.kiosk_welcome_heading} onChange={e=>setBranding(b=>({...b,kiosk_welcome_heading:e.target.value}))} /></div>
                <div><label className="block text-sm font-medium text-navy-700 mb-1.5">Welcome Message</label><textarea className="textarea" placeholder="e.g. We're glad you're here today" rows={3} value={branding.kiosk_welcome_subtext} onChange={e=>setBranding(b=>({...b,kiosk_welcome_subtext:e.target.value}))} /></div>
                <div>
                  <label className="block text-sm font-medium text-navy-700 mb-1.5">Background Image</label>
                  {branding.cover_image_url?<img src={branding.cover_image_url} alt="Background" className="w-full h-28 rounded-xl border border-navy-200 object-cover mb-2" />:<div style={{width:"100%",height:112,borderRadius:12,border:"2px dashed #E4DFD5",background:"#FAF9F6",display:"flex",alignItems:"center",justifyContent:"center",color:"#A89D8E",fontSize:14,marginBottom:8}}>No background image</div>}
                  <div className="flex items-center gap-3">
                    <input type="file" accept="image/*" className="block flex-1 text-sm text-navy-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-navy-100 file:text-navy-700 file:text-sm hover:file:bg-navy-200 cursor-pointer" onChange={e=>uploadBrandingImage('cover',e.target.files?.[0]||null)} />
                    {branding.cover_image_url && <button type="button" onClick={()=>setBranding(b=>({...b,cover_image_url:''}))} style={{fontSize:12,color:'#B23B3B',background:'none',border:'none',cursor:'pointer',whiteSpace:'nowrap',flexShrink:0}}>Remove</button>}
                  </div>
                  {branding.cover_image_url && <p style={{fontSize:11,color:'#A89D8E',marginTop:5,fontWeight:300}}>Remove the image to use your kiosk color instead — save settings to apply.</p>}
                  {uploading==='cover'&&<p className="text-xs text-navy-400 mt-1.5">Uploading…</p>}
                </div>
                <div>
                  <h4 className="font-medium text-navy-800 text-sm mb-3 mt-1">Contact Details</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                    <div><label className="block text-xs font-medium text-navy-600 mb-1">Phone</label><input className="input" value={branding.phone} onChange={e=>setBranding(b=>({...b,phone:e.target.value}))} /></div>
                    <div><label className="block text-xs font-medium text-navy-600 mb-1">Email</label><input className="input" value={branding.email} onChange={e=>setBranding(b=>({...b,email:e.target.value}))} /></div>
                  </div>
                  <div><label className="block text-xs font-medium text-navy-600 mb-1">Address</label><textarea className="textarea" rows={2} value={branding.address} onChange={e=>setBranding(b=>({...b,address:e.target.value}))} /></div>
                </div>
              </div>
            </div>

            {/* Kiosk access code — the church picks its own, because this gets
                told to an usher out loud and has to be memorable. */}
            <div className="card">
              <div className="panel-label mb-1" style={{display:'block'}}>Kiosk access code</div>
              <p style={{fontSize:13,color:'#7A6E60',fontWeight:300,marginBottom:16,maxWidth:540,lineHeight:1.7}}>
                Choose something your ushers will remember. They tap the padlock in the
                bottom-right corner of the kiosk screen and type this to unlock the tablet.
                Change it any time — for example when someone leaves the team.
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-xs font-medium text-navy-600 mb-1.5">Your code</label>
                  <input
                    className="input"
                    style={{fontSize:20,letterSpacing:'0.18em',fontWeight:500,maxWidth:260}}
                    value={kioskCode}
                    onChange={e=>setKioskCode(e.target.value)}
                    onKeyDown={e=>{ if(e.key==='Enter') saveKioskCode(); }}
                    placeholder="e.g. GRACE24"
                    maxLength={12}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
                <button onClick={saveKioskCode} disabled={savingKioskCode || kioskCode === (settings?.kiosk_access_code || '')} className="btn btn-secondary text-sm">
                  {savingKioskCode ? 'Saving…' : 'Save code'}
                </button>
              </div>
              <p style={{fontSize:11,color:'#A89D8E',marginTop:10,fontWeight:300}}>
                4–12 letters or numbers. Not case sensitive. Leave it empty if you don&apos;t want a code at all.
              </p>
            </div>

            {/* Member form fields — a church-defined question with a set of
                choices, added to every person's profile. Framed around the
                form itself ("field" / "choice") rather than the underlying
                data model ("category" / "group"), since that's what an admin
                actually recognises: this is the thing that makes a new
                dropdown appear on the Edit Profile screen. Not every church
                needs the same fields, so this isn't one hardcoded concept —
                a field is a bucket a church creates, holding its own
                choices. A person can pick one choice per field at once (one
                Cell Group AND one Department), which is why fields are kept
                separate rather than forced into a single flat list. */}
            <div className="card">
              <div className="panel-label mb-1" style={{display:'block'}}>Member form fields</div>
              <p style={{fontSize:13,color:'#7A6E60',fontWeight:300,marginBottom:16,maxWidth:540,lineHeight:1.7}}>
                Add a field for anything you want to ask about a member — Cell Group, Department, whatever
                fits — then add the choices people can pick from. It shows up as a dropdown on every
                person&apos;s profile in the People tab. Someone can pick one choice per field at the same
                time — a cell group and a department, say.
              </p>

              <div className="mb-5 flex flex-wrap items-end gap-3">
                <div style={{flex:'1 1 220px'}}>
                  <label className="block text-xs font-medium text-navy-600 mb-1.5">New field</label>
                  <input className="input" value={newCategoryName} onChange={e=>setNewCategoryName(e.target.value)}
                    onKeyDown={e=>{ if(e.key==='Enter') saveCategory(); }} placeholder="e.g. Cell Group, Department" maxLength={40} />
                </div>
                <button onClick={saveCategory} disabled={savingCategory || !newCategoryName.trim()} className="btn btn-secondary text-sm">
                  {savingCategory ? 'Adding…' : 'Add field'}
                </button>
                <button onClick={seedDefaultDepartments} disabled={seedingDepartments} className="btn btn-secondary text-sm">
                  {seedingDepartments ? 'Adding…' : '+ Add common departments'}
                </button>
              </div>

              {categories.length === 0 ? (
                <p style={{fontSize:13,color:'#A89D8E',fontWeight:300}}>No fields yet — add one above, then add choices under it.</p>
              ) : (
                <div style={{display:'flex',flexDirection:'column',gap:18,marginBottom:24}}>
                  {categories.map(cat=>{
                    const catGroups = groups.filter(g=>g.category_id===cat.id);
                    return (
                      <div key={cat.id} style={{border:'1px solid #E4DFD5',borderRadius:12,padding:'14px 16px'}}>
                        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,marginBottom:catGroups.length>0?10:0}}>
                          <span style={{fontSize:13,fontWeight:600,color:'#16243A'}}>{cat.name}</span>
                          <div style={{display:'flex',gap:8}}>
                            <button onClick={()=>setGroupForm({editingId:null, categoryId:cat.id, name:'', leader_person_id:''})}
                              className="btn btn-secondary text-xs py-1.5 px-3">+ Choice</button>
                            <button onClick={()=>{ setDeleteTarget({kind:'group-categories', id:cat.id, label:cat.name}); setDeleteCode(''); }}
                              className="btn btn-ghost text-xs py-1.5 px-3 text-red-500">Delete field</button>
                          </div>
                        </div>
                        {catGroups.map(g=>(
                          <div key={g.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,padding:'8px 0',borderTop:'1px solid #F0EBE3'}}>
                            <div style={{minWidth:0}}>
                              <div style={{fontSize:14,color:'#16243A',fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{g.name}</div>
                              <div style={{fontSize:12,color:'#A89D8E',fontWeight:300}}>{g.leader ? `Led by ${g.leader.full_name}` : 'No leader assigned'}</div>
                            </div>
                            <div className="service-actions" style={{display:'flex',gap:8,flexShrink:0}}>
                              <button onClick={()=>setGroupForm({editingId:g.id, categoryId:cat.id, name:g.name, leader_person_id:g.leader_person_id||''})}
                                className="btn btn-secondary text-xs py-1.5 px-3">Edit</button>
                              <button onClick={()=>{ setDeleteTarget({kind:'groups', id:g.id, label:g.name}); setDeleteCode(''); }}
                                className="btn btn-ghost text-xs py-1.5 px-3 text-red-500">Delete</button>
                            </div>
                          </div>
                        ))}

                        {groupForm.categoryId===cat.id && (
                          <div style={{background:'#F8F4EE',border:'1px solid #E4DFD5',borderRadius:10,padding:'14px 16px',marginTop:10}}>
                            <div style={{fontSize:12,fontWeight:500,color:'#7A6E60',marginBottom:10}}>{groupForm.editingId ? `Edit choice in ${cat.name}` : `Add a choice to ${cat.name}`}</div>
                            <div className="flex flex-wrap items-end gap-3">
                              <div style={{flex:'1 1 160px'}}>
                                <label className="block text-xs font-medium text-navy-600 mb-1.5">Name</label>
                                <input className="input" value={groupForm.name} onChange={e=>setGroupForm(f=>({...f,name:e.target.value}))}
                                  onKeyDown={e=>{ if(e.key==='Enter') saveGroup(); }} placeholder="e.g. Bethel" maxLength={80} autoFocus />
                              </div>
                              <div style={{flex:'1 1 180px'}}>
                                <label className="block text-xs font-medium text-navy-600 mb-1.5">Leader (optional)</label>
                                <select className="select" value={groupForm.leader_person_id} onChange={e=>setGroupForm(f=>({...f,leader_person_id:e.target.value}))}>
                                  <option value="">No leader</option>
                                  {activePeople.filter(p=>p.role==='leader'||p.role==='member').map(p=>(
                                    <option key={p.id} value={p.id}>{p.full_name}</option>
                                  ))}
                                </select>
                              </div>
                              <button onClick={saveGroup} disabled={savingGroup || !groupForm.name.trim()} className="btn btn-primary text-sm">
                                {savingGroup ? 'Saving…' : groupForm.editingId ? 'Save changes' : 'Add'}
                              </button>
                              <button onClick={()=>setGroupForm({editingId:null,categoryId:'',name:'',leader_person_id:''})} className="btn btn-secondary text-sm">Cancel</button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="card">
              <h3 className="panel-label mb-4" style={{display:'block'}}>Live Kiosk Preview</h3>
              {/* Mirrors the real kiosk welcome screen so the preview is honest */}
              <div className="rounded-2xl px-6 py-10 text-center text-white relative overflow-hidden"
                style={branding.cover_image_url
                  ? {backgroundImage:`linear-gradient(rgba(7,21,38,0.82), rgba(7,21,38,0.92)), url(${branding.cover_image_url})`,backgroundSize:'cover',backgroundPosition:'center'}
                  : {background:`linear-gradient(160deg, ${branding.brand_color||'#102a43'} 0%, #060d18 100%)`}}>
                {branding.logo_url && <img src={branding.logo_url} alt="Logo" className="w-14 h-14 rounded-2xl object-cover mx-auto mb-5" />}
                <div className="mx-auto mb-5" style={{width:40,height:2,borderRadius:1,background:'linear-gradient(90deg,transparent,#d4a017,transparent)'}} />
                <div style={{fontFamily:"'Playfair Display',serif",fontSize:28,lineHeight:1.15}}>{branding.kiosk_welcome_heading||branding.org_name||session.orgName}</div>
                <div className="text-white/55 mt-2 text-sm">{branding.kiosk_welcome_subtext||"We're glad you're here"}</div>
                <div className="grid grid-cols-2 gap-3 mt-7 max-w-sm mx-auto">
                  <div className="rounded-2xl py-4 text-xs font-semibold uppercase tracking-wider" style={{background:'linear-gradient(145deg,#059669,#10b981)'}}>Returning</div>
                  <div className="rounded-2xl py-4 text-xs font-semibold uppercase tracking-wider text-navy-900" style={{background:'linear-gradient(145deg,#e8aa18,#d4900a)'}}>First Time</div>
                </div>
                {branding.tagline && <div className="text-white/40 mt-6 text-xs italic">{branding.tagline}</div>}
              </div>
            </div>

            {/* Second save action — the header button scrolls out of reach on
                this page, which is long on phones. */}
            <div className="flex justify-end pt-1">
              <button onClick={saveBranding} disabled={savingBranding} className="btn btn-gold">
                {savingBranding?'Saving…':'Save Settings'}
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Support for the person actually running the church's account. */}
      <WhatsAppSupport context="the WeMotiply dashboard" />
    </div>
  );
}

/* ─── Sub-components ─────────────────────────────────────────────────────── */

function EmailTemplateIcon({ kind, expanded }: { kind:'welcome'|'birthday'|'missed'; expanded:boolean }) {
  const color = expanded ? '#F0A832' : '#486581';
  const accents = {
    welcome: <path d="M8 10l3 3 5-6" />,
    birthday: <path d="M8 9h8M10 5v4m4-4v4M8 19h8M9 15h6" />,
    missed: <path d="M8 9h8M8 13h5" />,
  };
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="5.5" width="17" height="13" rx="2" />{accents[kind]}</svg>;
}
function WarmEmailCard({title,kind,description,churchName,activeService,showServiceInfo,value,onChange,onSave,saving,expanded,onToggle,isFirst,isLast}:{
  title:string;kind:'welcome'|'birthday'|'missed';description:string;churchName:string;
  activeService?:{title:string|null;theme:string|null;scripture:string|null;message:string|null}|null;
  showServiceInfo:boolean;
  value:{subject:string;body:string};
  onChange:(next:{subject:string;body:string})=>void;
  onSave:()=>void;saving:boolean;
  expanded:boolean;onToggle:()=>void;isFirst?:boolean;isLast?:boolean;
}) {
  // Strip greeting/sign-off patterns from body for clean display in textarea
  const cleanBody = (raw:string):string => {
    let t = raw.trim();
    // Strip leading greeting variants
    t = t.replace(/^Dear \{NAME\},?\s*/i, '');
    t = t.replace(/^Dear \{FULL_NAME\},?\s*/i, '');
    // Strip trailing sign-off variants
    t = t.replace(/\s*With love,?\s*The \{ORG_NAME\} Family\s*$/i, '');
    t = t.replace(/\s*With love,?\s*\{ORG_NAME\}\s*$/i, '');
    // Strip {SERVICE_INFO} placeholder from textarea (shown separately)
    t = t.replace(/\s*\{SERVICE_INFO\}\s*/g, '\n').trim();
    return t;
  };

  // Rebuild full body with greeting + message + sign-off for saving
  const fullBody = (msg:string):string => {
    const cleaned = msg.trim();
    let body = `Dear {NAME},\n\n${cleaned}`;
    if (showServiceInfo) body += '\n\n{SERVICE_INFO}';
    body += `\n\nWith love,\nThe {ORG_NAME} Family`;
    return body;
  };

  // Replace template vars for the preview only
  const buildServicePreview = ():string => {
    if (!activeService?.title) return '';
    const parts = [];
    parts.push(`Today\'s gathering: ${activeService.title}`);
    if (activeService.theme)     parts.push(`Theme: ${activeService.theme}`);
    if (activeService.scripture) parts.push(`Scripture: ${activeService.scripture}`);
    return parts.join('\n');
  };
  const previewText = (text:string):string => text
    .replace(/\{NAME\}/g, 'Abena')
    .replace(/\{FULL_NAME\}/g, 'Abena Mensah')
    .replace(/\{ORG_NAME\}/g, churchName)
    .replace(/\{SERVICE_INFO\}/g, buildServicePreview())
    .trim();

  // What shows in the subject input — replace {ORG_NAME} with real name for clarity
  const displaySubject = value.subject.replace(/\{ORG_NAME\}/g, churchName);

  // What shows in the body textarea — stripped of auto-managed parts
  const displayBody = cleanBody(value.body);

  // What shows in preview — full clean email
  const previewBody = previewText(cleanBody(value.body));
  const previewSubject = previewText(value.subject);

  const labelStyle = {fontSize:12,fontWeight:500 as const,color:'#7A6E60',letterSpacing:'0.06em',textTransform:'uppercase' as const,display:'block' as const,marginBottom:8};

  return (
    <div style={{borderBottom: isLast ? 'none' : '1px solid #E4DFD5', background: expanded ? '#FDFCFA' : '#fff'}}>

      {/* Collapsed / clickable header row — always visible */}
      <button type="button" onClick={onToggle}
        style={{width:'100%',display:'flex',alignItems:'center',gap:14,padding:'20px 24px',background:'transparent',border:'none',cursor:'pointer',textAlign:'left'}}>
        <div style={{width:40,height:40,borderRadius:8,background:expanded?'#16243A':'#EEF2F6',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,transition:'background .2s'}}><EmailTemplateIcon kind={kind} expanded={expanded} /></div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:16,color:'#16243A',marginBottom:2}}>{title}</div>
          <div style={{fontSize:12,color:'#A89D8E',fontWeight:300}}>
            {expanded ? description : (displaySubject || description)}
          </div>
        </div>
        <svg style={{width:16,height:16,color:'#A89D8E',flexShrink:0,transform:expanded?'rotate(180deg)':'none',transition:'transform .2s'}} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
      </button>

      {/* Expanded editor */}
      {expanded && (
        <div style={{padding:'0 24px 28px'}}>

          {/* Subject — shows real church name, saves with {ORG_NAME} */}
          <div style={{marginBottom:16}}>
            <label style={labelStyle}>Subject line</label>
            <input
              value={displaySubject}
              onChange={e => onChange({...value, subject: e.target.value.replace(new RegExp(churchName.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'),'{ORG_NAME}')})}
              className="input"
              placeholder={`e.g. Welcome to ${churchName}!`}
            />
          </div>

          {/* Body — shows clean message, saves full template */}
          <div style={{marginBottom:20}}>
            <label style={labelStyle}>Your message</label>
            <textarea
              value={displayBody}
              onChange={e => onChange({...value, body: fullBody(e.target.value)})}
              className="textarea"
              style={{minHeight:110}}
              placeholder="Write your message here in plain English…"
            />
            <div style={{fontSize:12,color:'#A89D8E',marginTop:5}}>
              {showServiceInfo ? 'Names and service info are added automatically.' : 'Names are added automatically.'}
            </div>
          </div>

          {/* Clean preview — collapsible-lite, de-emphasized */}
          <details style={{marginBottom:20}}>
            <summary style={{fontSize:12,color:'#7A6E60',cursor:'pointer',listStyle:'none',display:'flex',alignItems:'center',gap:6,userSelect:'none'}}>
              <svg style={{width:13,height:13}} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
              Preview how this looks to the reader
            </summary>
            <div style={{background:'#FAF9F6',border:'1px solid #E4DFD5',borderRadius:10,padding:'16px',marginTop:10}}>
              <div style={{fontSize:12,color:'#7A6E60',marginBottom:8}}>
                <strong style={{color:'#1C2A3A'}}>Subject:</strong> {previewSubject}
              </div>
              <div style={{height:1,background:'#E4DFD5',margin:'8px 0 12px'}}/>
              <div style={{fontSize:13,color:'#3A3020',lineHeight:1.8}}>
                <div style={{marginBottom:8}}>Dear <strong style={{color:'#1C2A3A'}}>Abena</strong>,</div>
                <div style={{whiteSpace:'pre-wrap',color:'#4A4038',fontWeight:300,marginBottom:8}}>{previewBody}</div>
                {showServiceInfo && activeService?.title && (
                  <div style={{color:'#7A6E60',marginBottom:8,fontStyle:'italic',fontSize:12}}>Today&apos;s gathering: {activeService.title}</div>
                )}
                <div style={{color:'#7A6E60',borderTop:'1px solid #E4DFD5',paddingTop:10,marginTop:4}}>
                  With love,<br/>The {churchName} Family
                </div>
              </div>
            </div>
          </details>

          <button onClick={onSave} disabled={saving}
            style={{width:'100%',background:saving?'#B8A898':'#16243A',color:'#fff',border:'none',borderRadius:10,padding:'13px',fontFamily:"'DM Sans',sans-serif",fontSize:14,fontWeight:500,cursor:saving?'wait':'pointer',transition:'all .2s'}}>
            {saving ? 'Saving…' : `Save ${title}`}
          </button>
        </div>
      )}
    </div>
  );
}

function formatMonth(month:string):string {
  const [y,m]=month.split('-');
  return new Date(Number(y),Number(m)-1,1).toLocaleDateString('en-US',{month:'short',year:'numeric'});
}
