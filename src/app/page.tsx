'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

const FAQS = [
  { q:'Does our church need an IT person to set this up?', a:"No. Just create an account, add your church details, and you're ready in minutes. If you can open a website, you can run SwiftEntryPro." },
  { q:'What if the internet goes down on Sunday?', a:"No problem — it still works. Check-ins are saved on the device and automatically sync when the internet comes back." },
  { q:'Do members need to download an app?', a:"No app needed. Members simply walk up to the tablet and check in. Nothing to install, nothing to sign up for." },
  { q:'How do birthday messages work?', a:"Fully automatic. Once you add a member's date of birth, the system sends a birthday message every year on that date. You never have to remember." },
  { q:'What if someone\'s name isn\'t on the tablet?', a:"They tap 'First Time' and register in under 30 seconds. Their details are saved and they'll appear on the tablet from that point on." },
  { q:'Can I customise the messages?', a:"Yes, completely. You write your message in plain English — no coding, no technical knowledge required." },
];

const BIRTHDAY_NAMES = ['Abena','Kofi','Esi','Joseph','Benedicta','Kwame','Akua','Emmanuel','Efua','Daniel'];
const CHECKIN_NAMES  = ['Abena','Kwame Osei','Esi Sarpong','Joseph Asante','Benedicta D.','Akua Mensah','Emmanuel K.','Grace Owusu'];

export default function LandingPage() {
  const [isLoggedIn, setIsLoggedIn]   = useState(false);
  const [mobileOpen, setMobileOpen]   = useState(false);
  const [openFaq, setOpenFaq]         = useState<number|null>(null);
  const [checkCount, setCheckCount]   = useState(43);
  const [nameIdx, setNameIdx]         = useState(0);
  const [countFlash, setCountFlash]   = useState(false);

  useEffect(() => {
    fetch('/api/auth/session').then(r=>r.json()).then(d=>setIsLoggedIn(d.authenticated)).catch(()=>{});
  }, []);

  // Count up from 43 to ~61 over the first 8 seconds, then drift every 9s
  useEffect(() => {
    let count = 43;
    // Initial fast count-up: +1 every 200ms until 51
    const rampUp = setInterval(() => {
      count += 1;
      setCheckCount(count);
      setCountFlash(true);
      setTimeout(() => setCountFlash(false), 300);
      if (count >= 51) clearInterval(rampUp);
    }, 200);
    // Then drift: random +1 or +2 every 9-13 seconds
    const drift = setInterval(() => {
      setCheckCount(prev => {
        const next = prev + Math.floor(Math.random() * 2) + 1;
        return next > 89 ? prev : next; // cap at 89 to stay realistic
      });
      setCountFlash(true);
      setTimeout(() => setCountFlash(false), 400);
      // Also rotate the birthday name
      setNameIdx(i => (i + 1) % BIRTHDAY_NAMES.length);
    }, 9800);
    return () => { clearInterval(rampUp); clearInterval(drift); };
  }, []);

  const s = (x:string) => ({ style: x } as { style: string });

  return (
    <div className="min-h-screen overflow-x-hidden" style={{ fontFamily:"'DM Sans', sans-serif", background:'#F8F4EE', color:'#1C2A3A' }}>

      {/* ── NAV ── */}
      <header style={{ position:'sticky', top:0, zIndex:100, background:'rgba(248,244,238,0.94)', backdropFilter:'blur(12px)', borderBottom:'1px solid rgba(180,160,120,0.15)' }}>
        <div style={{ maxWidth:1160, margin:'0 auto', padding:'0 28px', height:68, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <Link href="/" style={{ display:'flex', alignItems:'center', gap:10, textDecoration:'none' }}>
            <div style={{ width:36, height:36, background:'#16243A', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3 9.5L7 13.5L15 5" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <span style={{ fontFamily:"'Playfair Display', serif", fontSize:18, color:'#16243A' }}>SwiftEntryPro</span>
          </Link>
          <nav style={{ display:'flex', alignItems:'center', gap:28 }} className="hidden md:flex">
            {[['#why','Why Us'],['#how','How It Works'],['#pricing','Pricing'],['#faq','FAQ']].map(([h,l])=>(
              <a key={h} href={h} style={{ fontSize:14, color:'#7A6E60', textDecoration:'none' }}>{l}</a>
            ))}
            {isLoggedIn
              ? <Link href="/admin" style={{ background:'#C97B1A', color:'#fff', padding:'10px 22px', borderRadius:9, fontSize:14, textDecoration:'none', fontWeight:500 }}>Dashboard →</Link>
              : <><Link href="/login" style={{ fontSize:14, color:'#7A6E60', textDecoration:'none', marginRight:8 }}>Sign in</Link>
                 <Link href="/signup" style={{ background:'#16243A', color:'#fff', padding:'10px 22px', borderRadius:9, fontSize:14, textDecoration:'none', fontWeight:500 }}>Start Free Trial</Link></>
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
            <Link href="/signup" style={{ display:'block', marginTop:12, background:'#16243A', color:'#fff', padding:'12px 20px', borderRadius:9, textAlign:'center', textDecoration:'none', fontSize:14, fontWeight:500 }}>Start Free Trial</Link>
          </div>
        )}
      </header>

      {/* ── HERO ── */}
      <section style={{ minHeight:'92vh', display:'grid', gridTemplateColumns:'1fr 1fr', alignItems:'center', maxWidth:1160, margin:'0 auto', padding:'80px 28px 60px', gap:60 }} className="!grid-cols-1 md:!grid-cols-2">
        <div className="animate-fade-in-up">
          <div style={{ display:'inline-flex', alignItems:'center', gap:8, background:'#FDF3E0', border:'1px solid rgba(201,123,26,0.25)', borderRadius:30, padding:'6px 16px', fontSize:13, color:'#C97B1A', fontWeight:500, marginBottom:28 }}>
            <span style={{ width:6, height:6, borderRadius:'50%', background:'#F0A832', display:'inline-block', animation:'pulseSoft 2s infinite' }}/>
            Built for growing churches
          </div>
          <h1 style={{ fontFamily:"'Playfair Display', serif", fontSize:'clamp(40px,5vw,62px)', lineHeight:1.1, color:'#16243A', letterSpacing:'-0.02em', marginBottom:22 }}>
            Know your<br/>congregation.<br/><em style={{ fontStyle:'italic', color:'#C97B1A' }}>Every Sunday.</em>
          </h1>
          <p style={{ fontSize:17, color:'#7A6E60', lineHeight:1.8, marginBottom:40, maxWidth:420, fontWeight:300 }}>
            SwiftEntryPro makes check-in effortless — so you spend less time taking attendance and more time knowing your people.
          </p>
          <div style={{ display:'flex', alignItems:'center', gap:16, flexWrap:'wrap', marginBottom:40 }}>
            <Link href="/signup" style={{ background:'#C97B1A', color:'#fff', padding:'15px 32px', borderRadius:11, fontSize:15, fontWeight:500, textDecoration:'none', transition:'all .2s', display:'inline-flex', alignItems:'center', gap:8 }}>
              Start free for 14 days →
            </Link>
            <a href="#how" style={{ color:'#7A6E60', fontSize:15, textDecoration:'none', display:'inline-flex', alignItems:'center', gap:6 }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="#7A6E60" strokeWidth="1.2"/><path d="M6.5 5.5L10.5 8L6.5 10.5V5.5Z" fill="#7A6E60"/></svg>
              See how it works
            </a>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:14, flexWrap:'wrap' }}>
            <div style={{ display:'flex' }}>
              {['#4A7C59','#5A6E8C','#8C5A3A','#6A4A8C'].map((c,i)=>(
                <div key={i} style={{ width:32, height:32, borderRadius:'50%', background:c, border:'2px solid #F8F4EE', marginLeft:i?-8:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, color:'#fff', fontFamily:"'Playfair Display',serif", fontWeight:600 }}>
                  {['GC','RB','HF','LC'][i]}
                </div>
              ))}
            </div>
            <span style={{ fontSize:13, color:'#7A6E60' }}>Trusted by <strong style={{ color:'#1C2A3A' }}>120+ churches</strong> across Africa</span>
          </div>
        </div>

        <div style={{ position:'relative', display:'flex', justifyContent:'center', alignItems:'center' }} className="hidden md:flex">
          <div style={{ width:380, height:380, borderRadius:'50%', background:'radial-gradient(circle,rgba(201,123,26,0.07) 0%,transparent 70%)', position:'absolute' }}/>
          <div style={{ background:'#16243A', borderRadius:24, padding:'36px 32px', width:300, boxShadow:'0 40px 80px rgba(22,36,58,0.35)', animation:'float 5s ease-in-out infinite', transform:'rotate(-1.5deg)', position:'relative', zIndex:2 }}>
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
          {/* Floating badges — live animated */}
          <div style={{ position:'absolute', right:-10, top:30, background:'#fff', borderRadius:12, padding:'12px 16px', boxShadow:'0 8px 24px rgba(0,0,0,0.12)', zIndex:3, transition:'all .3s' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:18 }}>✅</span>
              <div>
                <div style={{
                  fontSize:18, fontWeight:600,
                  fontFamily:"'Playfair Display',serif",
                  transition:'all .25s',
                  transform: countFlash ? 'scale(1.18)' : 'scale(1)',
                  color: countFlash ? '#C97B1A' : '#16243A',
                }}>
                  {checkCount}
                </div>
                <div style={{ fontSize:11, color:'#7A6E60' }}>Checked in today</div>
              </div>
            </div>
          </div>
          <div style={{ position:'absolute', left:-20, bottom:60, background:'#fff', borderRadius:12, padding:'12px 16px', boxShadow:'0 8px 24px rgba(0,0,0,0.12)', zIndex:3 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:18 }}>🎂</span>
              <div>
                <div style={{ fontSize:12, color:'#1C2A3A', fontWeight:500 }}>Birthday email sent</div>
                <div style={{
                  fontSize:11, color:'#7A6E60',
                  transition:'opacity .4s',
                  opacity: countFlash ? 0.4 : 1,
                }}>
                  To {BIRTHDAY_NAMES[nameIdx]} · automatically
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── PAIN ── */}
      <section id="why" style={{ background:'#16243A', padding:'100px 28px' }}>
        <div style={{ maxWidth:1100, margin:'0 auto' }}>
          <div style={{ fontSize:11, letterSpacing:'0.15em', textTransform:'uppercase', color:'rgba(201,123,26,0.8)', fontWeight:500, marginBottom:14 }}>The problem</div>
          <h2 style={{ fontFamily:"'Playfair Display',serif", fontSize:'clamp(28px,3.5vw,42px)', color:'#fff', lineHeight:1.2, marginBottom:16 }}>Sound familiar?</h2>
          <p style={{ fontSize:16, color:'rgba(255,255,255,0.5)', fontWeight:300, maxWidth:520, marginBottom:56 }}>Most churches are still doing attendance on paper, or with tools never designed for them.</p>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))', gap:24 }}>
            {[
              {q:'"I have no idea if we\'re growing or shrinking."', a:'Paper registers disappear. Spreadsheets never get updated. You have no real picture of your congregation.'},
              {q:'"A member hasn\'t come in weeks and nobody noticed."', a:'Without a system, people slip away quietly. By the time someone realises, it\'s too late to reach out.'},
              {q:'"Check-in on Sunday morning is chaos."', a:'Long queues, illegible handwriting, lost visitors. First impressions matter.'},
            ].map((p,i)=>(
              <div key={i} style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:16, padding:28 }}>
                <div style={{ fontFamily:"'Playfair Display',serif", fontSize:18, color:'rgba(255,255,255,0.9)', lineHeight:1.4, marginBottom:14 }}>{p.q}</div>
                <div style={{ fontSize:14, color:'rgba(255,255,255,0.4)', lineHeight:1.7, fontWeight:300 }}>{p.a}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section style={{ background:'#F8F4EE', padding:'100px 28px' }}>
        <div style={{ maxWidth:1100, margin:'0 auto' }}>
          <div style={{ fontSize:11, letterSpacing:'0.15em', textTransform:'uppercase', color:'#C97B1A', fontWeight:500, marginBottom:14 }}>What you get</div>
          <h2 style={{ fontFamily:"'Playfair Display',serif", fontSize:'clamp(28px,3.5vw,42px)', color:'#16243A', lineHeight:1.2, marginBottom:60 }}>Everything your church needs.<br/><em style={{ fontStyle:'italic', color:'#C97B1A' }}>Nothing it doesn&apos;t.</em></h2>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))', gap:24 }}>
            {[
              {icon:'✅',bg:'#EDF6F1',title:'Instant check-in kiosk',desc:'A beautiful screen at your entrance. Members find their name in seconds. First-timers fill a quick form. No training needed.'},
              {icon:'📧',bg:'#FDF3E0',title:'Automatic caring emails',desc:'Welcome emails, birthday greetings, and "we miss you" messages — sent automatically with each person\'s name. Set once, runs forever.'},
              {icon:'📊',bg:'#EEF2F8',title:'Attendance insights',desc:'See who\'s growing, who\'s new, who hasn\'t come in a while. Real numbers to help you pastor better.'},
              {icon:'👥',bg:'#FDF3E0',title:'Your congregation, organised',desc:'Every member, visitor, and leader in one place. Birthdays, visit history, contact info — all searchable.'},
              {icon:'📢',bg:'#EDF6F1',title:'Broadcast messages',desc:'Send a Sunday announcement or a message to first-timers only. Each person gets it personalised with their name.'},
              {icon:'⚡',bg:'#EEF2F8',title:'Works even offline',desc:'Poor wifi at your venue? No problem. Check-in keeps working and syncs when connection returns.'},
            ].map((f,i)=>(
              <div key={i} style={{ background:'#fff', border:'1px solid #E4DFD5', borderRadius:18, padding:'32px 28px', transition:'all .2s' }} className="card-hover">
                <div style={{ width:48,height:48,borderRadius:14,background:f.bg,display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,marginBottom:20 }}>{f.icon}</div>
                <div style={{ fontFamily:"'Playfair Display',serif", fontSize:18, color:'#16243A', marginBottom:10 }}>{f.title}</div>
                <div style={{ fontSize:14, color:'#7A6E60', lineHeight:1.75, fontWeight:300 }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how" style={{ background:'#EDE7DC', padding:'100px 28px' }}>
        <div style={{ maxWidth:1100, margin:'0 auto' }}>
          <div style={{ fontSize:11, letterSpacing:'0.15em', textTransform:'uppercase', color:'#C97B1A', fontWeight:500, marginBottom:14 }}>How it works</div>
          <h2 style={{ fontFamily:"'Playfair Display',serif", fontSize:'clamp(28px,3.5vw,42px)', color:'#16243A', lineHeight:1.2, marginBottom:64 }}>Up and running<br/><em style={{ fontStyle:'italic', color:'#C97B1A' }}>in minutes.</em></h2>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:32 }}>
            {[
              {n:'1',title:'Sign up',desc:'Create your account and enter your church name. Takes two minutes.'},
              {n:'2',title:'Open the kiosk',desc:'Open the kiosk screen on any tablet or phone at your entrance.'},
              {n:'3',title:'People check in',desc:'Members tap their name. New visitors fill a 30-second form.'},
              {n:'4',title:'We handle the rest',desc:'Emails go out automatically. Your dashboard updates in real time.'},
            ].map((s,i)=>(
              <div key={i} style={{ textAlign:'center' }}>
                <div style={{ width:56,height:56,borderRadius:'50%',background:'#fff',border:'2px solid #E4DFD5',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 20px',fontFamily:"'Playfair Display',serif",fontSize:20,color:'#C97B1A' }}>{s.n}</div>
                <div style={{ fontFamily:"'Playfair Display',serif", fontSize:16, color:'#16243A', marginBottom:10 }}>{s.title}</div>
                <div style={{ fontSize:13, color:'#7A6E60', lineHeight:1.7, fontWeight:300 }}>{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section style={{ background:'#fff', padding:'100px 28px' }}>
        <div style={{ maxWidth:1100, margin:'0 auto' }}>
          <div style={{ fontSize:11, letterSpacing:'0.15em', textTransform:'uppercase', color:'#C97B1A', fontWeight:500, marginBottom:14 }}>What pastors say</div>
          <h2 style={{ fontFamily:"'Playfair Display',serif", fontSize:'clamp(28px,3.5vw,42px)', color:'#16243A', marginBottom:56 }}>Churches that made the switch.</h2>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))', gap:24 }}>
            {[
              {q:'"We used to lose visitors all the time. Now every first-timer gets a warm welcome email automatically. Two have since become members."',n:'Pastor Grace Owusu',r:'Abundant Life Church, Accra',c:'#4A7C59',i:'GO'},
              {q:'"Sunday mornings used to start with chaos at the door. Now our usher just opens a screen and everything runs itself."',n:'Elder Kofi Mensah',r:'Revival Centre, Kumasi',c:'#5A6E8C',i:'KM'},
              {q:'"I can finally see our real attendance trend. We had been declining for 3 months without realising. This tool helped us catch it."',n:'Ps. Ama Kyei',r:'The Vine Church, Takoradi',c:'#8C5A3A',i:'AK'},
            ].map((t,i)=>(
              <div key={i} style={{ background:'#F8F4EE', border:'1px solid #E4DFD5', borderRadius:18, padding:'32px 28px' }}>
                <div style={{ color:'#F0A832', fontSize:14, letterSpacing:2, marginBottom:16 }}>★★★★★</div>
                <div style={{ fontFamily:"'Playfair Display',serif", fontSize:15, color:'#16243A', lineHeight:1.7, fontStyle:'italic', marginBottom:20 }}>{t.q}</div>
                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                  <div style={{ width:38,height:38,borderRadius:'50%',background:t.c,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,color:'#fff',fontFamily:"'Playfair Display',serif",fontWeight:600 }}>{t.i}</div>
                  <div><div style={{ fontSize:14, fontWeight:500, color:'#16243A' }}>{t.n}</div><div style={{ fontSize:12, color:'#7A6E60' }}>{t.r}</div></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" style={{ background:'#F8F4EE', padding:'100px 28px' }}>
        <div style={{ maxWidth:1100, margin:'0 auto' }}>
          <div style={{ fontSize:11, letterSpacing:'0.15em', textTransform:'uppercase', color:'#C97B1A', fontWeight:500, marginBottom:14 }}>Pricing</div>
          <h2 style={{ fontFamily:"'Playfair Display',serif", fontSize:'clamp(28px,3.5vw,42px)', color:'#16243A', marginBottom:8 }}>Simple, honest pricing.</h2>
          <p style={{ fontSize:16, color:'#7A6E60', fontWeight:300, marginBottom:56 }}>No hidden fees. No per-member charges. Cancel any time.</p>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))', gap:20, alignItems:'start' }}>
            {[
              {name:'Starter',price:'GHS 80',per:'/mo · Up to 100 members',featured:false,features:['Check-in kiosk','Attendance tracking','Automatic welcome email','Basic analytics']},
              {name:'Growth',price:'GHS 150',per:'/mo · Up to 500 members',featured:true,features:['Everything in Starter','Birthday & "we miss you" emails','Broadcast messaging','Full analytics dashboard','Export to Excel/CSV']},
              {name:'Church+',price:'GHS 300',per:'/mo · Unlimited members',featured:false,features:['Everything in Growth','Multiple locations/services','Priority support','Custom branding on kiosk']},
            ].map((p,i)=>(
              <div key={i} style={{ background: p.featured?'#16243A':'#fff', border: p.featured?'none':'1px solid #E4DFD5', borderRadius:20, padding:'36px 30px', transform: p.featured?'scale(1.04)':'none', boxShadow: p.featured?'0 24px 60px rgba(22,36,58,0.2)':'none' }}>
                {p.featured && <div style={{ fontSize:11, letterSpacing:'0.1em', textTransform:'uppercase', color:'#F0A832', fontWeight:500, marginBottom:14 }}>Most popular</div>}
                <div style={{ fontFamily:"'Playfair Display',serif", fontSize:22, color:p.featured?'#fff':'#16243A', marginBottom:8 }}>{p.name}</div>
                <div style={{ fontFamily:"'Playfair Display',serif", fontSize:44, color:p.featured?'#fff':'#16243A', lineHeight:1, marginBottom:4 }}>{p.price}</div>
                <div style={{ fontSize:13, color:p.featured?'rgba(255,255,255,0.4)':'#7A6E60', marginBottom:28 }}>{p.per}</div>
                <div style={{ height:1, background:p.featured?'rgba(255,255,255,0.1)':'#E4DFD5', marginBottom:24 }}/>
                {p.features.map((f,j)=>(
                  <div key={j} style={{ display:'flex', gap:10, fontSize:14, color:p.featured?'rgba(255,255,255,0.65)':'#7A6E60', marginBottom:12, fontWeight:300 }}>
                    <span style={{ color:p.featured?'#F0A832':'#2E7D4E', flexShrink:0, marginTop:1 }}>✓</span>{f}
                  </div>
                ))}
                <Link href="/signup" style={{ display:'block', textAlign:'center', padding:'14px', borderRadius:10, fontSize:14, fontWeight:500, textDecoration:'none', marginTop:28, background:p.featured?'#C97B1A':'transparent', color:p.featured?'#fff':'#16243A', border:p.featured?'none':'1px solid #E4DFD5', transition:'all .2s' }}>
                  Start free trial
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" style={{ background:'#EDE7DC', padding:'100px 28px' }}>
        <div style={{ maxWidth:720, margin:'0 auto' }}>
          <h2 style={{ fontFamily:"'Playfair Display',serif", fontSize:'clamp(28px,3.5vw,42px)', color:'#16243A', marginBottom:48, textAlign:'center' }}>Common questions.</h2>
          {FAQS.map((f,i)=>(
            <div key={i} style={{ borderBottom:'1px solid #E4DFD5' }}>
              <button onClick={()=>setOpenFaq(openFaq===i?null:i)} style={{ width:'100%', display:'flex', justifyContent:'space-between', alignItems:'center', padding:'20px 0', background:'none', border:'none', cursor:'pointer', textAlign:'left' }}>
                <span style={{ fontSize:16, color:'#16243A', fontFamily:"'Playfair Display',serif" }}>{f.q}</span>
                <span style={{ fontSize:20, color:'#C97B1A', marginLeft:16, flexShrink:0, transform: openFaq===i?'rotate(45deg)':'none', transition:'transform .2s' }}>+</span>
              </button>
              {openFaq===i && <div style={{ paddingBottom:20, fontSize:14, color:'#7A6E60', lineHeight:1.75, fontWeight:300 }}>{f.a}</div>}
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{ background:'#16243A', padding:'120px 28px', textAlign:'center' }}>
        <h2 style={{ fontFamily:"'Playfair Display',serif", fontSize:'clamp(28px,3.5vw,44px)', color:'#fff', maxWidth:600, margin:'0 auto 16px', lineHeight:1.2 }}>Your congregation deserves<br/><em style={{ fontStyle:'italic', color:'#F0A832' }}>to feel seen.</em></h2>
        <p style={{ fontSize:16, color:'rgba(255,255,255,0.5)', maxWidth:420, margin:'0 auto 40px', lineHeight:1.75, fontWeight:300 }}>Start your 14-day free trial today. No credit card needed. Setup in minutes.</p>
        <Link href="/signup" style={{ display:'inline-block', background:'#C97B1A', color:'#fff', padding:'16px 36px', borderRadius:11, fontSize:16, fontWeight:500, textDecoration:'none', transition:'all .2s' }}>
          Start your free trial →
        </Link>
        <div style={{ fontSize:13, color:'rgba(255,255,255,0.3)', marginTop:20 }}>No credit card · Cancel any time · Setup in 5 minutes</div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ background:'#0F1A2C', padding:'48px 28px', display:'flex', flexWrap:'wrap', alignItems:'center', justifyContent:'space-between', gap:20 }}>
        <span style={{ fontFamily:"'Playfair Display',serif", fontSize:18, color:'rgba(255,255,255,0.5)' }}>SwiftEntryPro</span>
        <div style={{ display:'flex', gap:24, flexWrap:'wrap' }}>
          {['Privacy','Terms','Contact'].map(l=><a key={l} href="#" style={{ fontSize:13, color:'rgba(255,255,255,0.3)', textDecoration:'none' }}>{l}</a>)}
        </div>
        <span style={{ fontSize:12, color:'rgba(255,255,255,0.2)' }}>© 2026 SwiftEntryPro</span>
      </footer>
    </div>
  );
}
