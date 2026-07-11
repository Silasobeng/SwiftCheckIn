'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Service, Person, Checkin, AppSettings, EmailTemplate, Giving, GivingType, PaymentMethod, Organization } from '@/types';
import { calculateAge, getAgeGroup } from '@/lib/utils';

const OWNER_EMAILS = (process.env.NEXT_PUBLIC_OWNER_EMAILS || '').split(',').map((v) => v.trim().toLowerCase()).filter(Boolean);

type Tab = 'dashboard' | 'services' | 'people' | 'giving' | 'analytics' | 'emails' | 'settings';

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

function EditPersonModal({ person, onClose, onSaved }: { person: Person; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    full_name: person.full_name || '', phone: person.phone || '', email: person.email || '',
    gender: person.gender || '', date_of_birth: person.date_of_birth || '', role: person.role || 'visitor',
    occupation: person.occupation || '', company: person.company || '',
    location: person.location || '', how_found_us: person.how_found_us || '', notes: person.notes || '',
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
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-navy-700 mb-1.5">Full Name</label><input className="input" value={form.full_name} onChange={set('full_name')} /></div>
                <div><label className="block text-sm font-medium text-navy-700 mb-1.5">Phone</label><input className="input" value={form.phone} onChange={set('phone')} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
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
              <div className="grid grid-cols-2 gap-3">
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
  const [peopleSearch, setPeopleSearch] = useState('');
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
  tagline:'', host_names:'', address:'', phone:'', email:'', logo_url:'', cover_image_url:'', brand_color:'#102a43', kiosk_welcome_heading:'', kiosk_welcome_subtext:'' });
  const [savingBranding, setSavingBranding] = useState(false);
  const [uploading, setUploading] = useState<'logo'|'cover'|null>(null);

  useEffect(() => {
    fetch('/api/auth/session').then(r=>r.json()).then(d=>{ if(!d.authenticated) router.push('/login'); else { setSession(d.session); setLoading(false); } }).catch(()=>router.push('/login'));
  }, [router]);

  const loadData = useCallback(async () => {
    if (!session) return;
    setError(null);

    const safeFetch = async <T,>(url: string, fallback: T): Promise<T> => {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) return fallback;
        return await res.json();
      } catch {
        return fallback;
      }
    };

    const [sD, pD, cD, stD, tD, gD] = await Promise.all([
      safeFetch('/api/services', { services: [] }),
      safeFetch('/api/people', { people: [] }),
      safeFetch('/api/checkin', { checkins: [] }),
      safeFetch<{settings: (AppSettings & {organization?: Organization}) | null}>('/api/settings', { settings: null }),
      safeFetch('/api/email/templates', { templates: [] }),
      safeFetch('/api/giving', { giving: [] }),
    ]);

    setServices(sD.services||[]); setPeople(pD.people||[]); setCheckins(cD.checkins||[]); setSettings(stD.settings||null); setTemplates(tD.templates||[]); setGiving(gD.giving||[]);
    const org = stD.settings?.organization;
    if (org) setBranding({
  org_name: org.name || '',
  tagline:org.tagline||'', host_names:org.host_names||'', address:org.address||'', phone:org.phone||'', email:org.email||'', logo_url:org.logo_url||'', cover_image_url:org.cover_image_url||'', brand_color:org.brand_color||'#102a43', kiosk_welcome_heading:org.kiosk_welcome_heading||'', kiosk_welcome_subtext:org.kiosk_welcome_subtext||'' });

    if (!stD.settings) setError('Some dashboard data could not be refreshed — check your connection.');
  }, [session]);

  useEffect(() => { if (session) loadData(); }, [session,loadData]);
  useEffect(() => { if (!session) return; const id=window.setInterval(loadData,30000); return ()=>window.clearInterval(id); }, [session,loadData]);
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

  const createService = openNewService; // keep backwards compat

  const setActiveService = async (id:string) => {
    setMessage(null); setError(null);
    const res=await fetch('/api/services',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({serviceId:id,setActive:true})});
    const data=await res.json(); if(!res.ok){setError(data.error||'Could not activate.');return;} setMessage('Current service updated.'); loadData();
  };

  const handleEmailReport = async (serviceId:string) => {
    setSendingReportId(serviceId); setMessage(null); setError(null);
    try {
      const res = await fetch(`/api/services/${serviceId}/email-report`, { method:'POST' });
      const data = await res.json();
      if (!res.ok) { setError(data.error||'Could not send report.'); return; }
      setMessage(`Attendance report emailed (${data.count} check-in${data.count===1?'':'s'}).`);
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

  const activePeople = people.filter(p=>!p.archived);
  const visitors = activePeople.filter(p=>p.role==='visitor');
  const members = activePeople.filter(p=>p.role!=='visitor');
  const today = new Date().toISOString().split('T')[0];
  const todayCheckins = checkins.filter(c=>c.checked_in_at?.split('T')[0]===today);
  const activeService = services.find(s=>s.is_active)||null;
  const currentMonthKey = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`;
  const lastMonthDate = new Date(); lastMonthDate.setMonth(lastMonthDate.getMonth()-1);
  const lastMonthKey = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth()+1).padStart(2,'0')}`;
  const currentMonthCheckins = checkins.filter(c=>c.checked_in_at?.startsWith(currentMonthKey));
  const lastMonthCheckins = checkins.filter(c=>c.checked_in_at?.startsWith(lastMonthKey));
  const currentMonthUnique = new Set(currentMonthCheckins.map(c=>c.person_id)).size;
  const ageGroups = activePeople.reduce<Record<string,number>>((a,p)=>{ if(!p.date_of_birth) return a; const g=getAgeGroup(calculateAge(p.date_of_birth)); a[g]=(a[g]||0)+1; return a; },{});
  const genderCounts = activePeople.reduce<Record<string,number>>((a,p)=>{ const k=p.gender||'not set'; a[k]=(a[k]||0)+1; return a; },{});
  const topLocations = Object.entries(activePeople.reduce<Record<string,number>>((a,p)=>{ if(!p.location?.trim()) return a; a[p.location.trim()]=(a[p.location.trim()]||0)+1; return a; },{})).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const topOccupations = Object.entries(activePeople.reduce<Record<string,number>>((a,p)=>{ if(!p.occupation?.trim()) return a; a[p.occupation.trim()]=(a[p.occupation.trim()]||0)+1; return a; },{})).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const howFoundUs = Object.entries(activePeople.reduce<Record<string,number>>((a,p)=>{ if(!p.how_found_us?.trim()) return a; a[p.how_found_us.trim()]=(a[p.how_found_us.trim()]||0)+1; return a; },{})).sort((a,b)=>b[1]-a[1]).slice(0,5);
  // Retention: first-timers last month who checked in again this month
  const lastMonthFirstTimers = new Set(
    checkins.filter(c=>c.is_first_time && c.checked_in_at?.startsWith(lastMonthKey)).map(c=>c.person_id)
  );
  const retained = currentMonthCheckins.filter(c=>lastMonthFirstTimers.has(c.person_id)).length;
  const retentionRate = lastMonthFirstTimers.size > 0 ? Math.round((retained / lastMonthFirstTimers.size) * 100) : null;
  // Top attenders
  const topAttenders = [...activePeople].sort((a,b)=>(b.total_checkins||0)-(a.total_checkins||0)).slice(0,5);
  const monthlyTrend = Object.entries(checkins.reduce<Record<string,number>>((a,c)=>{ const d=c.checked_in_at?.slice(0,7); if(!d) return a; a[d]=(a[d]||0)+1; return a; },{})).sort((a,b)=>b[0].localeCompare(a[0])).slice(0,6);
  const missingBirthdayCount = activePeople.filter(p=>!p.date_of_birth).length;
  const missingEmailCount = activePeople.filter(p=>!p.email).length;
  const firstTimersThisMonth = currentMonthCheckins.filter(c=>c.is_first_time).length;
  const returningThisMonth = currentMonthCheckins.length-firstTimersThisMonth;
  const filteredPeople = useMemo(() => { const q=peopleSearch.trim().toLowerCase(); if(!q) return activePeople; return activePeople.filter(p=>p.full_name.toLowerCase().includes(q)||p.phone?.includes(q)||p.email?.toLowerCase().includes(q)); }, [activePeople,peopleSearch]);

  const givingPersonMatches = useMemo(() => {
    const q = givingPersonQuery.trim().toLowerCase();
    if (!q) return [];
    return activePeople.filter(p=>p.full_name.toLowerCase().includes(q)||p.phone?.includes(q)).slice(0,6);
  }, [activePeople, givingPersonQuery]);
  const currentMonthRangeLabel = (() => {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last = new Date(now.getFullYear(), now.getMonth()+1, 0);
    const month = first.toLocaleDateString('en-US', {month:'short'});
    return `${month} 1–${last.getDate()}, ${now.getFullYear()}`;
  })();
  const givingThisMonth = giving.filter(g=>g.created_at?.startsWith(currentMonthKey));
  const givingTotalThisMonth = givingThisMonth.reduce((sum,g)=>sum+Number(g.amount||0),0);
  const givingPendingCount = giving.filter(g=>g.status==='recorded').length;
  const GIVING_TYPE_LABELS: Record<GivingType,string> = { tithe:'Tithe', offering:'Offering', seed:'Seed', pledge:'Pledge', other:'Other' };

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

  const handleDeleteGiving = async (id: string) => {
    if (!window.confirm('Delete this giving record? This cannot be undone.')) return;
    setError(null);
    const res = await fetch(`/api/giving?id=${id}`, { method:'DELETE' });
    const data = await res.json();
    if (!res.ok) { setError(data.error||'Could not delete record.'); return; }
    setMessage('Record deleted.');
    loadData();
  };


  const TAB_LABELS:Record<Tab,string> = {dashboard:'Dashboard',services:"Today's Service",people:'People',giving:'Giving',analytics:'Analytics',emails:'Emails',settings:'Settings'};

  if (loading) return (
    <div style={{minHeight:'100vh',background:'#F8F4EE',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{textAlign:'center'}}>
        <div style={{width:44,height:44,border:'3px solid #E4DFD5',borderTopColor:'#C97B1A',borderRadius:'50%',animation:'spin 0.8s linear infinite',margin:'0 auto 16px'}} />
        <p style={{color:'#7A6E60',fontSize:14}}>Loading…</p>
      </div>
    </div>
  );
  if (!session) return null;

  return (
    <div style={{minHeight:"100vh",background:"#F8F4EE"}}>
      {editingPerson && <EditPersonModal person={editingPerson} onClose={()=>setEditingPerson(null)} onSaved={()=>{loadData();setMessage('Profile updated.');}} />}

      {/* Header */}
      <header className="bg-white border-b border-navy-100 px-4 sm:px-6 py-4 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto flex justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div style={{width:36,height:36,background:"#16243A",borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center"}}>
              <svg style={{width:16,height:16,color:"#F0A832"}} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            </div>
            <div>
              <h1 className="font-bold text-navy-900 leading-tight">{session.orgName}</h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`w-1.5 h-1.5 rounded-full ${settings?.kiosk_open?'bg-emerald-500 animate-pulse':'bg-navy-300'}`} />
                <span className="text-xs text-navy-500">{settings?.kiosk_open?'Check-in open':'Check-in closed'}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={loadData} className="btn btn-ghost btn-icon" title="Refresh">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            </button>
            <Link href={`/kiosk/${session.orgSlug}`} target="_blank" className="btn btn-secondary text-sm">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
              <span className="hidden sm:inline">Open Kiosk</span>
            </Link>
            <button onClick={handleLogout} className="btn btn-ghost text-navy-500 text-sm hidden sm:flex">Logout</button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <nav className="bg-white border-b border-navy-100 px-4 sm:px-6 sticky top-[65px] z-30">
        <div className="max-w-7xl mx-auto flex gap-1 overflow-x-auto hide-scrollbar" style={{paddingTop:10,paddingBottom:10}}>
          {(['dashboard','services','people','giving','analytics','emails','settings'] as Tab[]).map(t=>{
            const icons: Record<Tab,JSX.Element> = {
              dashboard: <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>,
              services: <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>,
              people: <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-4a4 4 0 10-4-4 4 4 0 004 4zm6 0a4 4 0 10-4-4"/>,
              giving: <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .672-3 1.5S10.343 11 12 11s3 .672 3 1.5-1.343 1.5-3 1.5m0-6V6m0 8v1.5m0-9.5a9 9 0 100 18 9 9 0 000-18z"/>,
              analytics: <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2"/>,
              emails: <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>,
              settings: <><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></>,
            };
            const active = tab===t;
            return (
              <button key={t} onClick={()=>setTab(t)}
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
                <svg style={{width:15,height:15,flexShrink:0,opacity:active?1:0.6}} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>{icons[t]}</svg>
                {TAB_LABELS[t]}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Main */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-7 space-y-5">
        {message && <div className="alert alert-success"><svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg><span>{message}</span></div>}
        {error && <div className="alert alert-error"><svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg><span>{error}</span></div>}

        {/* ── DASHBOARD ── */}
        {tab==='dashboard' && (
          <div className="animate-fade-in" style={{maxWidth:1060,margin:'0 auto'}}>

            {/* Greeting + Open Kiosk */}
            <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:20,marginBottom:28,flexWrap:'wrap'}}>
              <div>
                <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:26,color:'#16243A',fontWeight:400,marginBottom:4}}>
                  Good morning, {session.orgName}
                </h2>
                <p style={{fontSize:14,color:'#7A6E60',fontWeight:300}}>
                  {settings?.kiosk_open
                    ? <span style={{display:'flex',alignItems:'center',gap:6}}><span style={{width:7,height:7,borderRadius:'50%',background:'#2E7D4E',display:'inline-block'}}/>Check-in is open{activeService?<> · {activeService.title}</>:null}</span>
                    : 'Check-in is closed'
                  }
                </p>
              </div>
              <div style={{display:'flex',gap:10}}>
                <button onClick={toggleKiosk}
                  style={{background:settings?.kiosk_open?'#fff':'#16243A',color:settings?.kiosk_open?'#7A6E60':'#fff',border:'1px solid',borderColor:settings?.kiosk_open?'#E4DFD5':'#16243A',borderRadius:10,padding:'10px 20px',fontFamily:"'DM Sans',sans-serif",fontSize:13,fontWeight:500,cursor:'pointer',transition:'all .15s'}}>
                  {settings?.kiosk_open ? 'Close Check-In' : 'Open Check-In'}
                </button>
              </div>
            </div>

            {/* Stat cards */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:14,marginBottom:24}}>
              {[
                {label:"Checked in today",    value:todayCheckins.length},
                {label:"Members",             value:members.length},
                {label:"Visitors",            value:visitors.length},
                {label:"Total services",      value:services.length},
              ].map(({label,value})=>(
                <div key={label} style={{background:'#fff',border:'1px solid #E4DFD5',borderRadius:14,padding:'22px 24px'}}>
                  <div style={{fontFamily:"'Playfair Display',serif",fontSize:34,color:'#16243A',lineHeight:1,marginBottom:6}}>{value}</div>
                  <div style={{fontSize:13,color:'#7A6E60',fontWeight:300}}>{label}</div>
                </div>
              ))}
            </div>

            {/* Two column grid */}
            <div style={{display:'grid',gridTemplateColumns:'1.3fr 1fr',gap:20}}>

              {/* Today&apos;s check-ins */}
              <div style={{background:'#fff',border:'1px solid #E4DFD5',borderRadius:16,padding:'24px 28px'}}>
                <div style={{fontSize:11,letterSpacing:'0.1em',textTransform:'uppercase',color:'#A89D8E',marginBottom:18}}>Today&apos;s check-ins</div>
                {todayCheckins.length===0 ? (
                  <div style={{textAlign:'center',padding:'32px 0',color:'#A89D8E'}}>
                    <div style={{fontSize:32,marginBottom:10,opacity:0.4}}>🕐</div>
                    <div style={{fontSize:14,fontWeight:300}}>Nobody checked in yet</div>
                  </div>
                ) : (
                  todayCheckins.slice(0,8).map(c=>(
                    <div key={c.id} style={{display:'flex',alignItems:'center',gap:12,padding:'11px 0',borderBottom:'1px solid #F0EBE3'}}>
                      <div style={{width:34,height:34,borderRadius:'50%',background:'#F0EBE3',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,color:'#7A6048',fontFamily:"'Playfair Display',serif",flexShrink:0}}>
                        {c.person?.full_name?.charAt(0)||'?'}
                      </div>
                      <div style={{flex:1}}>
                        <div style={{fontSize:14,color:'#1C2A3A',fontWeight:500}}>{c.person?.full_name}</div>
                        {c.is_first_time && <div style={{fontSize:11,color:'#2E7D4E',fontWeight:500}}>First visit ✓</div>}
                      </div>
                      <div style={{fontSize:12,color:'#A89D8E'}}>{new Date(c.checked_in_at).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}</div>
                    </div>
                  ))
                )}
              </div>

              {/* Things to know */}
              <div style={{background:'#fff',border:'1px solid #E4DFD5',borderRadius:16,padding:'24px 28px'}}>
                <div style={{fontSize:11,letterSpacing:'0.1em',textTransform:'uppercase',color:'#A89D8E',marginBottom:18}}>Things to know</div>
                {[
                  {label:'Members without birthday on file', value:missingBirthdayCount, action:missingBirthdayCount>0?()=>setTab('people'):undefined, urgent:missingBirthdayCount>5},
                  {label:'Members without email',             value:missingEmailCount,    action:missingEmailCount>0?()=>setTab('people'):undefined,    urgent:missingEmailCount>5},
                  {label:'New visitors this month',           value:firstTimersThisMonth, action:undefined, urgent:false},
                  {label:'Unique attendees this month',       value:currentMonthUnique,   action:undefined, urgent:false},
                ].map(row=>(
                  <div key={row.label} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 0',borderBottom:'1px solid #F0EBE3'}}>
                    <span style={{fontSize:13,color:'#7A6E60',fontWeight:300}}>{row.label}</span>
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
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
          <div className="animate-fade-in" style={{maxWidth:1060,margin:'0 auto'}}>

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
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:16}}>
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
                      <div style={{fontSize:11,letterSpacing:'0.1em',textTransform:'uppercase' as const,color:'#C97B1A',fontWeight:600,marginBottom:4}}>📧 Included in today&apos;s welcome emails</div>
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
                    <button onClick={()=>setServiceFormOpen(false)} style={{flex:1,background:'#fff',color:'#7A6E60',border:'1px solid #E4DFD5',borderRadius:10,padding:'12px',fontFamily:"'DM Sans',sans-serif",fontSize:14,fontWeight:500,cursor:'pointer'}}>Cancel</button>
                    <button onClick={saveService} disabled={savingService} style={{flex:2,background:savingService?'#B8A898':'#16243A',color:'#fff',border:'none',borderRadius:10,padding:'12px',fontFamily:"'DM Sans',sans-serif",fontSize:14,fontWeight:500,cursor:savingService?'wait':'pointer',transition:'all .2s'}}>
                      {savingService?'Saving…':editingService?'Save changes':'Create service'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:24}}>
              <div>
                <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:24,color:'#16243A',fontWeight:400,marginBottom:4}}>Services</h2>
                <p style={{fontSize:14,color:'#7A6E60',fontWeight:300}}>Create a service before opening check-in. Details go into the welcome email.</p>
              </div>
              <button onClick={openNewService} style={{background:'#16243A',color:'#fff',border:'none',borderRadius:10,padding:'11px 20px',fontFamily:"'DM Sans',sans-serif",fontSize:14,fontWeight:500,cursor:'pointer',display:'flex',alignItems:'center',gap:6}}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 2v10M2 7h10" stroke="white" strokeWidth="1.8" strokeLinecap="round"/></svg>
                New Service
              </button>
            </div>

            {services.length===0 ? (
              <div style={{background:'#fff',border:'1px solid #E4DFD5',borderRadius:16,padding:'60px 20px',textAlign:'center'}}>
                <div style={{fontSize:40,marginBottom:14,opacity:0.3}}>📅</div>
                <div style={{fontFamily:"'Playfair Display',serif",fontSize:18,color:'#16243A',marginBottom:8}}>No services yet</div>
                <div style={{fontSize:14,color:'#A89D8E',fontWeight:300,marginBottom:24}}>Create your first service to open check-in.</div>
                <button onClick={openNewService} style={{background:'#16243A',color:'#fff',border:'none',borderRadius:10,padding:'12px 28px',fontFamily:"'DM Sans',sans-serif",fontSize:14,fontWeight:500,cursor:'pointer'}}>Create first service</button>
              </div>
            ) : (
              <div style={{display:'flex',flexDirection:'column',gap:12}}>
                {services.map(s=>(
                  <div key={s.id} style={{background:s.is_active?'#FEFAF4':'#fff',border:`1px solid ${s.is_active?'rgba(201,123,26,0.35)':'#E4DFD5'}`,borderRadius:14,padding:'20px 24px',transition:'all .15s'}}>
                    <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:12}}>
                      <div style={{flex:1}}>
                        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:4}}>
                          <span style={{fontFamily:"'Playfair Display',serif",fontSize:17,color:'#16243A'}}>{s.title||'Untitled Service'}</span>
                          {s.is_active&&<span style={{fontSize:11,background:'#FDF3E0',color:'#C97B1A',border:'1px solid rgba(201,123,26,0.25)',borderRadius:20,padding:'2px 10px',fontWeight:500}}>Active</span>}
                        </div>
                        <div style={{fontSize:13,color:'#A89D8E',fontWeight:300,marginBottom:6}}>
                          {new Date(s.service_date).toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})}{s.service_time&&` · ${s.service_time}`}
                        </div>
                        {(s.theme||s.scripture||s.message) ? (
                          <div style={{fontSize:13,color:'#7A6E60',fontWeight:300,lineHeight:1.7}}>
                            {s.theme&&<span style={{marginRight:16}}>📖 {s.theme}</span>}
                            {s.scripture&&<span style={{marginRight:16}}>📜 {s.scripture}</span>}
                            {s.message&&<div style={{marginTop:4,color:'#9E9280',fontSize:12}}>{s.message.length>80?s.message.slice(0,80)+'…':s.message}</div>}
                          </div>
                        ) : (
                          <div style={{fontSize:12,color:'#C8C0B4',fontStyle:'italic'}}>
                            No service details added — <button onClick={()=>openEditService(s)} style={{background:'none',border:'none',cursor:'pointer',color:'#C97B1A',fontSize:12,fontStyle:'normal',padding:0}}>add theme & scripture</button> to enrich the welcome email
                          </div>
                        )}
                      </div>
                      <div style={{display:'flex',gap:8,flexShrink:0}}>
                        <button onClick={()=>handleEmailReport(s.id)} disabled={sendingReportId===s.id} style={{background:'#fff',color:'#7A6E60',border:'1px solid #E4DFD5',borderRadius:8,padding:'8px 14px',fontFamily:"'DM Sans',sans-serif",fontSize:13,fontWeight:500,cursor:sendingReportId===s.id?'wait':'pointer'}}>{sendingReportId===s.id?'Sending…':'Email Report'}</button>
                        <button onClick={()=>openEditService(s)} style={{background:'#fff',color:'#7A6E60',border:'1px solid #E4DFD5',borderRadius:8,padding:'8px 14px',fontFamily:"'DM Sans',sans-serif",fontSize:13,fontWeight:500,cursor:'pointer'}}>Edit</button>
                        {!s.is_active&&<button onClick={()=>setActiveService(s.id)} style={{background:'#16243A',color:'#fff',border:'none',borderRadius:8,padding:'8px 14px',fontFamily:"'DM Sans',sans-serif",fontSize:13,fontWeight:500,cursor:'pointer'}}>Set Active</button>}
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
          <div className="space-y-5 animate-fade-in">
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

            {(missingBirthdayCount>0||missingEmailCount>0) && (
              <div className="alert alert-warning">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
                <span><strong>{missingBirthdayCount}</strong> {missingBirthdayCount===1?'person is':'people are'} missing birthdays and <strong>{missingEmailCount}</strong> missing emails — click <em>Edit</em> to fill them in.</span>
              </div>
            )}

            <div className="card p-0 overflow-hidden">
              {filteredPeople.length===0 ? (
                <div className="text-center py-16"><svg className="w-12 h-12 text-navy-200 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg><p className="text-navy-400 text-sm">{peopleSearch?'No results found':'No people yet. They appear after check-ins.'}</p></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr className="bg-cream">
                      <th className="table-header">Name</th>
                      <th className="table-header hidden sm:table-cell">Phone</th>
                      <th className="table-header">Role</th>
                      <th className="table-header hidden md:table-cell">Visits</th>
                      <th className="table-header">Missing Info</th>
                      <th className="table-header text-right">Action</th>
                    </tr></thead>
                    <tbody>
                      {filteredPeople.map(p=>{
                        const missing:string[]=[];
                        if(!p.email) missing.push('email');
                        if(!p.date_of_birth) missing.push('birthday');
                        return (
                          <tr key={p.id} className="table-row">
                            <td className="table-cell">
                              <div className="flex items-center gap-2.5">
                                <div style={{width:28,height:28,borderRadius:"50%",background:"#F0EBE3",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:"#7A6048",fontFamily:"'Playfair Display',serif",fontWeight:600,flexShrink:0}}>{p.full_name.charAt(0)}</div>
                                <span className="font-medium text-navy-900 text-sm">{p.full_name}</span>
                              </div>
                            </td>
                            <td className="table-cell hidden sm:table-cell text-navy-500 text-sm">{p.phone}</td>
                            <td className="table-cell"><span className={`badge text-[11px] ${p.role==='leader'?'badge-purple':p.role==='member'?'badge-primary':'badge-warning'}`}>{p.role}</span></td>
                            <td className="table-cell hidden md:table-cell text-navy-500 text-sm">{p.total_checkins}</td>
                            <td className="table-cell">{missing.length>0?<span className="text-amber-600 text-xs font-medium">{missing.join(', ')}</span>:<span className="text-emerald-600 text-xs">✓ complete</span>}</td>
                            <td className="table-cell text-right"><button onClick={()=>setEditingPerson(p)} className="btn btn-secondary text-xs py-1.5 px-3">Edit</button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── GIVING ── */}
        {tab==='giving' && (
          <div className="animate-fade-in" style={{maxWidth:1060,margin:'0 auto'}}>

            <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:20,marginBottom:24,flexWrap:'wrap'}}>
              <div>
                <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:24,color:'#16243A',fontWeight:400}}>Giving</h2>
                <p style={{fontSize:13,color:'#7A6E60',fontWeight:300,marginTop:2}}>Record tithes, offerings, seed and pledges — and send receipts.</p>
              </div>
              <button onClick={()=>{resetGivingForm(); setGivingPersonQuery(''); setGivingFormOpen(true);}}
                style={{background:'#16243A',color:'#fff',border:'none',borderRadius:10,padding:'10px 20px',fontFamily:"'DM Sans',sans-serif",fontSize:13,fontWeight:500,cursor:'pointer'}}>
                + Record a gift
              </button>
            </div>

            {/* Stat cards */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:14,marginBottom:24}}>
              {[
                {label:'Revenue this month', sub:currentMonthRangeLabel, value:`${(givingThisMonth[0]?.currency)||'GHS'} ${givingTotalThisMonth.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`},
                {label:'Gifts this month',   sub:currentMonthRangeLabel, value:String(givingThisMonth.length)},
                {label:'Awaiting receipt',   sub:null,                  value:String(givingPendingCount)},
                {label:'All-time total',     sub:'Since you started',   value:String(giving.length)},
              ].map(({label,sub,value})=>(
                <div key={label} style={{background:'#fff',border:'1px solid #E4DFD5',borderRadius:14,padding:'22px 24px'}}>
                  <div style={{fontFamily:"'Playfair Display',serif",fontSize:26,color:'#16243A',lineHeight:1,marginBottom:6}}>{value}</div>
                  <div style={{fontSize:13,color:'#7A6E60',fontWeight:300}}>{label}</div>
                  {sub && <div style={{fontSize:11,color:'#A89D8E',fontWeight:300,marginTop:2}}>{sub}</div>}
                </div>
              ))}
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
                          {givingPersonMatches.map(p=>(
                            <div key={p.id} onClick={()=>selectGivingPerson(p)}
                              style={{padding:'10px 14px',cursor:'pointer',fontSize:13,borderBottom:'1px solid #F0EBE3'}}>
                              <div style={{color:'#16243A',fontWeight:500}}>{p.full_name}</div>
                              <div style={{color:'#A89D8E',fontSize:12}}>{p.phone}{p.email?` · ${p.email}`:''}</div>
                            </div>
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

                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                      <div>
                        <label style={{fontSize:12,fontWeight:500,color:'#7A6E60',letterSpacing:'0.06em',textTransform:'uppercase',display:'block',marginBottom:6}}>Amount (GHS)</label>
                        <input className="input text-sm" type="number" min="0.01" step="0.01" placeholder="0.00" value={givingForm.amount} onChange={e=>setGivingForm(f=>({...f,amount:e.target.value}))} />
                      </div>
                      <div>
                        <label style={{fontSize:12,fontWeight:500,color:'#7A6E60',letterSpacing:'0.06em',textTransform:'uppercase',display:'block',marginBottom:6}}>Type</label>
                        <select className="input text-sm" value={givingForm.giving_type} onChange={e=>setGivingForm(f=>({...f,giving_type:e.target.value as GivingType}))}>
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
                      <select className="input text-sm" value={givingForm.payment_method} onChange={e=>setGivingForm(f=>({...f,payment_method:e.target.value as PaymentMethod}))}>
                        <option value="cash">Cash</option>
                        <option value="mobile_money">Mobile Money</option>
                        <option value="bank_transfer">Bank Transfer</option>
                        <option value="other">Other</option>
                      </select>
                    </div>

                    <div>
                      <label style={{fontSize:12,fontWeight:500,color:'#7A6E60',letterSpacing:'0.06em',textTransform:'uppercase',display:'block',marginBottom:6}}>Notes (optional)</label>
                      <textarea className="input text-sm" rows={2} value={givingForm.notes} onChange={e=>setGivingForm(f=>({...f,notes:e.target.value}))} />
                    </div>

                  </div>
                  <div style={{padding:'18px 28px',borderTop:'1px solid #E4DFD5',display:'flex',justifyContent:'flex-end',gap:10}}>
                    <button onClick={()=>setGivingFormOpen(false)} className="btn btn-secondary text-sm">Cancel</button>
                    <button onClick={handleSaveGiving} disabled={savingGiving || !givingForm.giver_name.trim() || !givingForm.amount}
                      style={{background:savingGiving?'#B8A898':'#C97B1A',color:'#fff',border:'none',borderRadius:10,padding:'10px 22px',fontSize:13,fontWeight:500,cursor:savingGiving?'wait':'pointer'}}>
                      {savingGiving ? 'Saving…' : 'Save record'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Giving list */}
            <div className="card p-0 overflow-hidden">
              {giving.length===0 ? (
                <div className="text-center py-16">
                  <p className="text-navy-400 text-sm">No gifts recorded yet.</p>
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
                              <button onClick={()=>handleDeleteGiving(g.id)} className="btn btn-ghost text-xs py-1.5 px-3 text-red-500">Delete</button>
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
          <div className="animate-fade-in" style={{maxWidth:1060,margin:'0 auto'}}>

            <div style={{marginBottom:28}}>
              <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:26,color:'#16243A',fontWeight:400,marginBottom:4}}>Attendance Trends</h2>
              <p style={{fontSize:14,color:'#7A6E60',fontWeight:300}}>How your congregation is growing over time.</p>
            </div>

            {/* Top stat cards */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:14,marginBottom:24}}>
              {[
                {label:'This month',        value:currentMonthCheckins.length},
                {label:'Last month',        value:lastMonthCheckins.length},
                {label:'New this month',    value:firstTimersThisMonth},
                {label:'Total congregation',value:activePeople.length},
              ].map(({label,value})=>(
                <div key={label} style={{background:'#fff',border:'1px solid #E4DFD5',borderRadius:14,padding:'22px 24px'}}>
                  <div style={{fontFamily:"'Playfair Display',serif",fontSize:34,color:'#16243A',lineHeight:1,marginBottom:6}}>{value}</div>
                  <div style={{fontSize:13,color:'#7A6E60',fontWeight:300}}>{label}</div>
                </div>
              ))}
            </div>

            {/* Monthly attendance bar chart */}
            <div style={{background:'#fff',border:'1px solid #E4DFD5',borderRadius:16,padding:'28px',marginBottom:20}}>
              <div style={{fontSize:11,letterSpacing:'0.1em',textTransform:'uppercase',color:'#A89D8E',marginBottom:24}}>Monthly attendance — last 6 months</div>
              {monthlyTrend.length===0 ? (
                <div style={{textAlign:'center',padding:'32px 0',color:'#A89D8E',fontSize:14,fontWeight:300}}>No attendance data yet.</div>
              ) : (
                <div style={{display:'flex',alignItems:'flex-end',gap:12,height:160}}>
                  {[...monthlyTrend].reverse().map(([month,count])=>{
                    const maxVal = Math.max(...monthlyTrend.map(([,n])=>n),1);
                    const pct    = Math.round((count/maxVal)*100);
                    const isLast = month === monthlyTrend[0]?.[0];
                    return (
                      <div key={month} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:6}}>
                        <div style={{fontSize:12,color:'#16243A',fontFamily:"'Playfair Display',serif",fontWeight:400}}>{count}</div>
                        <div style={{width:'100%',background:isLast?'#16243A':'#EDE7DC',borderRadius:'6px 6px 0 0',height:`${Math.max(pct,4)}%`,transition:'all .3s'}}/>
                        <div style={{fontSize:11,color:'#A89D8E',whiteSpace:'nowrap'}}>{formatMonth(month)}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Insight cards grid */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>

              {/* Gender */}
              <div style={{background:'#fff',border:'1px solid #E4DFD5',borderRadius:16,padding:'24px 28px'}}>
                <div style={{fontSize:11,letterSpacing:'0.1em',textTransform:'uppercase',color:'#A89D8E',marginBottom:16}}>Gender</div>
                {Object.keys(genderCounts).length===0
                  ? <p style={{fontSize:13,color:'#A89D8E',fontWeight:300}}>No data yet — add genders in People tab</p>
                  : Object.entries(genderCounts).map(([label,count])=>{
                      const max=Math.max(...Object.values(genderCounts),1);
                      return (
                        <div key={label} style={{marginBottom:12}}>
                          <div style={{display:'flex',justifyContent:'space-between',fontSize:13,marginBottom:5}}>
                            <span style={{color:'#7A6E60',textTransform:'capitalize',fontWeight:300}}>{label}</span>
                            <span style={{color:'#16243A',fontFamily:"'Playfair Display',serif"}}>{count}</span>
                          </div>
                          <div style={{height:6,background:'#F0EBE3',borderRadius:3,overflow:'hidden'}}>
                            <div style={{height:6,width:`${(count/max)*100}%`,background:'#16243A',borderRadius:3,transition:'all .3s'}}/>
                          </div>
                        </div>
                      );
                    })
                }
              </div>

              {/* Age groups */}
              <div style={{background:'#fff',border:'1px solid #E4DFD5',borderRadius:16,padding:'24px 28px'}}>
                <div style={{fontSize:11,letterSpacing:'0.1em',textTransform:'uppercase',color:'#A89D8E',marginBottom:16}}>Age groups</div>
                {Object.keys(ageGroups).length===0
                  ? <p style={{fontSize:13,color:'#A89D8E',fontWeight:300}}>No data yet — add birthdays in People tab</p>
                  : Object.entries(ageGroups).map(([label,count])=>{
                      const max=Math.max(...Object.values(ageGroups),1);
                      return (
                        <div key={label} style={{marginBottom:12}}>
                          <div style={{display:'flex',justifyContent:'space-between',fontSize:13,marginBottom:5}}>
                            <span style={{color:'#7A6E60',fontWeight:300}}>{label}</span>
                            <span style={{color:'#16243A',fontFamily:"'Playfair Display',serif"}}>{count}</span>
                          </div>
                          <div style={{height:6,background:'#F0EBE3',borderRadius:3,overflow:'hidden'}}>
                            <div style={{height:6,width:`${(count/max)*100}%`,background:'#C97B1A',borderRadius:3,transition:'all .3s'}}/>
                          </div>
                        </div>
                      );
                    })
                }
              </div>

              {/* Top locations */}
              <div style={{background:'#fff',border:'1px solid #E4DFD5',borderRadius:16,padding:'24px 28px'}}>
                <div style={{fontSize:11,letterSpacing:'0.1em',textTransform:'uppercase',color:'#A89D8E',marginBottom:16}}>Where people come from</div>
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
              <div style={{background:'#fff',border:'1px solid #E4DFD5',borderRadius:16,padding:'24px 28px'}}>
                <div style={{fontSize:11,letterSpacing:'0.1em',textTransform:'uppercase',color:'#A89D8E',marginBottom:16}}>How people found you</div>
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
              <div style={{background:'#fff',border:'1px solid #E4DFD5',borderRadius:16,padding:'24px 28px'}}>
                <div style={{fontSize:11,letterSpacing:'0.1em',textTransform:'uppercase',color:'#A89D8E',marginBottom:16}}>Top occupations</div>
                {topOccupations.length===0
                  ? <p style={{fontSize:13,color:'#A89D8E',fontWeight:300}}>No data yet — add occupations in People tab</p>
                  : topOccupations.map(([label,count])=>{
                      const max=Math.max(...topOccupations.map(([,n])=>n),1);
                      return (
                        <div key={label} style={{marginBottom:12}}>
                          <div style={{display:'flex',justifyContent:'space-between',fontSize:13,marginBottom:5}}>
                            <span style={{color:'#7A6E60',fontWeight:300,textTransform:'capitalize'}}>{label}</span>
                            <span style={{color:'#16243A',fontFamily:"'Playfair Display',serif"}}>{count}</span>
                          </div>
                          <div style={{height:6,background:'#F0EBE3',borderRadius:3,overflow:'hidden'}}>
                            <div style={{height:6,width:`${(count/max)*100}%`,background:'#16243A',borderRadius:3,transition:'all .3s'}}/>
                          </div>
                        </div>
                      );
                    })
                }
              </div>

              {/* Retention rate */}
              <div style={{background:'#fff',border:'1px solid #E4DFD5',borderRadius:16,padding:'24px 28px'}}>
                <div style={{fontSize:11,letterSpacing:'0.1em',textTransform:'uppercase',color:'#A89D8E',marginBottom:16}}>Visitor retention</div>
                {retentionRate === null
                  ? <p style={{fontSize:13,color:'#A89D8E',fontWeight:300}}>Not enough data yet — needs 2 months of check-ins</p>
                  : <>
                      <div style={{fontFamily:"'Playfair Display',serif",fontSize:40,color:retentionRate>=50?'#2E7D4E':'#C97B1A',lineHeight:1,marginBottom:8}}>{retentionRate}%</div>
                      <div style={{fontSize:13,color:'#7A6E60',fontWeight:300}}>of last month&apos;s first-timers came back this month</div>
                      <div style={{height:8,background:'#F0EBE3',borderRadius:4,overflow:'hidden',marginTop:14}}>
                        <div style={{height:8,width:`${retentionRate}%`,background:retentionRate>=50?'#2E7D4E':'#C97B1A',borderRadius:4,transition:'all .5s'}}/>
                      </div>
                    </>
                }
              </div>

              {/* Most consistent attenders */}
              <div style={{background:'#fff',border:'1px solid #E4DFD5',borderRadius:16,padding:'24px 28px'}}>
                <div style={{fontSize:11,letterSpacing:'0.1em',textTransform:'uppercase',color:'#A89D8E',marginBottom:16}}>Most faithful attenders</div>
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
          </div>
        )}

                {/* ── EMAILS ── */}
        {tab==='emails' && (
          <div className="space-y-8 animate-fade-in">

            {/* Header */}
            <div>
              <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:26,color:'#16243A',fontWeight:400,marginBottom:4}}>Automatic Emails</h2>
            </div>

            {/* Three email templates — accordion, one open at a time */}
            <div>
              <div style={{fontSize:11,letterSpacing:'0.12em',textTransform:'uppercase',color:'#A89D8E',fontWeight:500,marginBottom:2}}>Customize Emails</div>
              <div style={{fontSize:13,color:'#7A6E60',fontWeight:300,marginBottom:14}}>Which email would you like to edit?</div>
              <div style={{background:'#fff',border:'1px solid #E4DFD5',borderRadius:16,overflow:'hidden'}}>
                <WarmEmailCard title="Welcome Email" icon="👋" description="Sent after someone's very first visit" churchName={session.orgName} activeService={activeService} showServiceInfo={true} value={draftTemplates.welcome} onChange={next=>setDraftTemplates(p=>({...p,welcome:next}))} onSave={()=>saveTemplate('welcome',draftTemplates.welcome.subject,draftTemplates.welcome.body)} saving={savingTemplate==='welcome'} expanded={expandedTemplate==='welcome'} onToggle={()=>setExpandedTemplate(t=>t==='welcome'?null:'welcome')} isFirst />
                <WarmEmailCard title="Birthday Email" icon="🎂" description="Sent automatically on someone's birthday" churchName={session.orgName} showServiceInfo={false} value={draftTemplates.birthday} onChange={next=>setDraftTemplates(p=>({...p,birthday:next}))} onSave={()=>saveTemplate('birthday',draftTemplates.birthday.subject,draftTemplates.birthday.body)} saving={savingTemplate==='birthday'} expanded={expandedTemplate==='birthday'} onToggle={()=>setExpandedTemplate(t=>t==='birthday'?null:'birthday')} />
                <WarmEmailCard title="We Miss You" icon="💛" description="Sent when a member misses 2 or more services" churchName={session.orgName} showServiceInfo={false} value={draftTemplates.missed} onChange={next=>setDraftTemplates(p=>({...p,missed:next}))} onSave={()=>saveTemplate('missed',draftTemplates.missed.subject,draftTemplates.missed.body)} saving={savingTemplate==='missed'} expanded={expandedTemplate==='missed'} onToggle={()=>setExpandedTemplate(t=>t==='missed'?null:'missed')} isLast />
              </div>
            </div>

            {/* Broadcast */}
            <div style={{borderTop:'1px solid #E4DFD5',paddingTop:32}}>
              <div style={{fontSize:11,letterSpacing:'0.12em',textTransform:'uppercase',color:'#A89D8E',fontWeight:500,marginBottom:16}}>One-off message</div>
              <div style={{background:'#fff',border:'1px solid #E4DFD5',borderRadius:16,padding:'28px 32px'}}>
                <div style={{display:'flex',alignItems:'flex-start',gap:14,marginBottom:24}}>
                  <div style={{width:44,height:44,borderRadius:12,background:'#EEF2F8',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:20}}>📢</div>
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
                <button onClick={sendCustomEmail}
                  disabled={sendingCustom||!customEmail.subject||!customEmail.message}
                  style={{width:'100%',background:sendingCustom||!customEmail.subject||!customEmail.message?'#B8A898':'#C97B1A',color:'#fff',border:'none',borderRadius:10,padding:'14px',fontFamily:"'DM Sans',sans-serif",fontSize:15,fontWeight:500,cursor:sendingCustom||!customEmail.subject||!customEmail.message?'not-allowed':'pointer',transition:'all .2s'}}>
                  {sendingCustom ? 'Sending…' : 'Send Broadcast'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── SETTINGS ── */}
        {tab==='settings' && (
          <div className="space-y-5 animate-fade-in">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div><h2 style={{fontFamily:"'Playfair Display',serif",fontSize:24,color:'#16243A',fontWeight:400,marginBottom:4}}>Settings</h2><p style={{fontSize:14,color:'#7A6E60',fontWeight:300}}>Set these once and you&apos;re done.</p></div>
              <button onClick={saveBranding} disabled={savingBranding} style={{background:"#C97B1A",color:"#fff",border:"none",borderRadius:10,padding:"10px 22px",fontFamily:"'DM Sans',sans-serif",fontSize:14,fontWeight:500,cursor:"pointer",flexShrink:0}}>{savingBranding?'Saving…':'Save Settings'}</button>
            </div>
            <div className="grid lg:grid-cols-2 gap-5">
              <div className="card space-y-4">
                <div style={{fontSize:11,letterSpacing:"0.12em",textTransform:"uppercase",color:"#A89D8E",fontWeight:500,marginBottom:4}}>Church Branding</div>
                <div><label className="block text-sm font-medium text-navy-700 mb-1.5">Church Name</label><input className="input" placeholder="e.g. Grace Community Church" value={branding.org_name} onChange={e=>setBranding(b=>({...b,org_name:e.target.value}))} /></div>
                <div><label className="block text-sm font-medium text-navy-700 mb-1.5">Tagline</label><input className="input" placeholder="e.g. A place of worship and community" value={branding.tagline} onChange={e=>setBranding(b=>({...b,tagline:e.target.value}))} /></div>
                <div><label className="block text-sm font-medium text-navy-700 mb-1.5">Host Names</label><input className="input" placeholder="e.g. Pastor John & Lady Mary" value={branding.host_names} onChange={e=>setBranding(b=>({...b,host_names:e.target.value}))} /></div>
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
                <div style={{fontSize:11,letterSpacing:"0.12em",textTransform:"uppercase",color:"#A89D8E",fontWeight:500,marginBottom:4}}>Kiosk Welcome Screen</div>
                <div><label className="block text-sm font-medium text-navy-700 mb-1.5">Welcome Heading</label><input className="input" placeholder="e.g. Welcome to Grace Church" value={branding.kiosk_welcome_heading} onChange={e=>setBranding(b=>({...b,kiosk_welcome_heading:e.target.value}))} /></div>
                <div><label className="block text-sm font-medium text-navy-700 mb-1.5">Welcome Message</label><textarea className="textarea" placeholder="e.g. We're glad you're here today" rows={3} value={branding.kiosk_welcome_subtext} onChange={e=>setBranding(b=>({...b,kiosk_welcome_subtext:e.target.value}))} /></div>
                <div>
                  <label className="block text-sm font-medium text-navy-700 mb-1.5">Background Image</label>
                  {branding.cover_image_url?<img src={branding.cover_image_url} alt="Background" className="w-full h-28 rounded-xl border border-navy-200 object-cover mb-2" />:<div style={{width:"100%",height:112,borderRadius:12,border:"2px dashed #E4DFD5",background:"#FAF9F6",display:"flex",alignItems:"center",justifyContent:"center",color:"#A89D8E",fontSize:14,marginBottom:8}}>No background image</div>}
                  <input type="file" accept="image/*" className="block w-full text-sm text-navy-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-navy-100 file:text-navy-700 file:text-sm hover:file:bg-navy-200 cursor-pointer" onChange={e=>uploadBrandingImage('cover',e.target.files?.[0]||null)} />
                  {uploading==='cover'&&<p className="text-xs text-navy-400 mt-1.5">Uploading…</p>}
                </div>
                <div>
                  <h4 className="font-medium text-navy-800 text-sm mb-3 mt-1">Contact Details</h4>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div><label className="block text-xs font-medium text-navy-600 mb-1">Phone</label><input className="input" value={branding.phone} onChange={e=>setBranding(b=>({...b,phone:e.target.value}))} /></div>
                    <div><label className="block text-xs font-medium text-navy-600 mb-1">Email</label><input className="input" value={branding.email} onChange={e=>setBranding(b=>({...b,email:e.target.value}))} /></div>
                  </div>
                  <div><label className="block text-xs font-medium text-navy-600 mb-1">Address</label><textarea className="textarea" rows={2} value={branding.address} onChange={e=>setBranding(b=>({...b,address:e.target.value}))} /></div>
                </div>
              </div>
            </div>

            <div className="card">
              <h3 className="font-semibold text-navy-900 mb-4 text-xs uppercase tracking-widest text-navy-400">Live Kiosk Preview</h3>
              <div className="rounded-2xl p-8 min-h-[220px] text-white relative overflow-hidden"
                style={branding.cover_image_url?{backgroundImage:`linear-gradient(rgba(16,42,67,0.72), rgba(16,42,67,0.85)), url(${branding.cover_image_url})`,backgroundSize:'cover',backgroundPosition:'center'}:{background:`linear-gradient(135deg, ${branding.brand_color||'#102a43'}, #1a3a56)`}}>
                {branding.logo_url&&<img src={branding.logo_url} alt="Logo" className="w-14 h-14 rounded-xl bg-white/90 p-1.5 object-cover mb-4" />}
                <div className="text-2xl font-bold">{branding.kiosk_welcome_heading||session.orgName}</div>
                <div className="text-white/80 mt-2">{branding.kiosk_welcome_subtext||"We're glad you're here today"}</div>
                {branding.tagline&&<div className="text-yellow-300/70 mt-3 text-sm">{branding.tagline}</div>}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

/* ─── Sub-components ─────────────────────────────────────────────────────── */

function WarmEmailCard({title,icon,description,churchName,activeService,showServiceInfo,value,onChange,onSave,saving,expanded,onToggle,isFirst,isLast}:{
  title:string;icon:string;description:string;churchName:string;
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
        <div style={{width:40,height:40,borderRadius:11,background:expanded?'#16243A':'#F8F4EE',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,flexShrink:0,transition:'background .2s'}}>{icon}</div>
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
