import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase';
import { requireActiveSubscription } from '@/lib/auth';
import { processTemplate, sendBrevoEmail } from '@/lib/email';
import { buildBrandedEmail } from '@/lib/emailTemplate';
import type { Organization, Person } from '@/types';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const auth = await requireActiveSubscription();
  if ('error' in auth) return auth.error;

  try {
    const body = await request.json();
    const { audience = 'all', subject, message } = body;

    if (!subject?.trim() || !message?.trim()) {
      return NextResponse.json({ error: 'Subject and message are required' }, { status: 400 });
    }

    const supabase = getServerSupabase();
    const { data: org, error: orgError } = await supabase
      .from('organizations').select('*').eq('id', auth.session.orgId).single();

    if (orgError || !org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    let query = supabase
      .from('people').select('*')
      .eq('org_id', auth.session.orgId)
      .eq('archived', false)
      .not('email', 'is', null);

    // ── Fixed audience filters ──────────────────────────────
    if (audience === 'members') {
      query = query.in('role', ['member', 'leader']);

    } else if (audience === 'first_timers_month') {
      // People whose first check-in was this calendar month
      const startOfMonth = new Date();
      startOfMonth.setDate(1); startOfMonth.setHours(0,0,0,0);
      const { data: firstTimerCheckins } = await supabase
        .from('checkins')
        .select('person_id')
        .eq('org_id', auth.session.orgId)
        .eq('is_first_time', true)
        .gte('checked_in_at', startOfMonth.toISOString());

      const ids = Array.from(new Set((firstTimerCheckins || []).map((c: { person_id: string }) => c.person_id)));
      if (ids.length === 0) return NextResponse.json({ success:true, sent:0, failed:0 });
      query = query.in('id', ids);

    } else if (audience === 'inactive_30') {
      // People whose most recent check-in was more than 30 days ago
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      // Get IDs who checked in within last 30 days
      const { data: recentCheckins } = await supabase
        .from('checkins')
        .select('person_id')
        .eq('org_id', auth.session.orgId)
        .gte('checked_in_at', thirtyDaysAgo.toISOString());

      const recentIds = new Set((recentCheckins || []).map((c: { person_id: string }) => c.person_id));
      // Get all active people with emails then exclude recent ones
      const { data: allPeople } = await supabase
        .from('people').select('id')
        .eq('org_id', auth.session.orgId)
        .eq('archived', false)
        .not('email', 'is', null);

      const inactiveIds = (allPeople || []).map((p: { id: string }) => p.id).filter((id: string) => !recentIds.has(id));
      if (inactiveIds.length === 0) return NextResponse.json({ success:true, sent:0, failed:0 });
      query = query.in('id', inactiveIds);
    }

    const { data: recipients, error: recipientsError } = await query;
    if (recipientsError) return NextResponse.json({ error: recipientsError.message }, { status: 500 });

    const people = (recipients || []).filter(p => p.email) as Person[];
    if (people.length === 0) {
      return NextResponse.json({ error: 'No recipients with email addresses found' }, { status: 400 });
    }

    // ── Parallel sending in batches of 50 ──────────────────
    const BATCH = 50;
    let sent = 0, failed = 0;

    for (let i = 0; i < people.length; i += BATCH) {
      const batch = people.slice(i, i + BATCH);
      const results = await Promise.all(
        batch.map(async (person) => {
          const finalSubject = processTemplate(subject.trim(), person, org as Organization, null);
          const finalBody    = processTemplate(message.trim(), person, org as Organization, null);
          const html         = buildBrandedEmail({ orgName: org.name, brandColor: org.brand_color, logoUrl: org.logo_url, greeting: '', body: finalBody, address: org.address, phone: org.phone, email: org.email });
          const result       = await sendBrevoEmail(
            [{ email: person.email as string, name: person.full_name }],
            finalSubject, html, org.name
          );
          await supabase.from('email_logs').insert({
            org_id: auth.session.orgId, person_id: person.id,
            email_type: 'custom', subject: finalSubject,
            recipient_email: person.email, status: result.success ? 'sent' : 'failed',
          });
          return result.success;
        })
      );
      sent   += results.filter(Boolean).length;
      failed += results.filter(r => !r).length;
    }

    return NextResponse.json({ success: true, sent, failed });
  } catch (error) {
    console.error('Custom email POST error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
