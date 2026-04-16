import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase';
import { requireActiveSubscription } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const ALLOWED_TYPES = ['welcome', 'birthday', 'missed'] as const;

// GET - list templates for current org
export async function GET() {
  const auth = await requireActiveSubscription();
  if ('error' in auth) return auth.error;

  try {
    const supabase = getServerSupabase();
    const { data, error } = await supabase
      .from('email_templates')
      .select('*')
      .eq('org_id', auth.session.orgId)
      .order('template_type');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ templates: data || [] });
  } catch (error) {
    console.error('Email templates GET error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// PATCH - update one template for current org
export async function PATCH(request: NextRequest) {
  const auth = await requireActiveSubscription();
  if ('error' in auth) return auth.error;

  try {
    const body = await request.json();
    const { templateType, subject, body: templateBody } = body;

    if (!ALLOWED_TYPES.includes(templateType)) {
      return NextResponse.json({ error: 'Invalid template type' }, { status: 400 });
    }

    if (!subject?.trim() || !templateBody?.trim()) {
      return NextResponse.json({ error: 'Subject and message are required' }, { status: 400 });
    }

    const supabase = getServerSupabase();
    const { error } = await supabase
      .from('email_templates')
      .upsert({
        org_id: auth.session.orgId,
        template_type: templateType,
        subject: subject.trim(),
        body: templateBody.trim(),
      }, { onConflict: 'org_id,template_type' });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Email templates PATCH error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
