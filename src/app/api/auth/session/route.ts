import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getServerSupabase, isSubscriptionValid } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getSession();
    
    if (!session) {
      return NextResponse.json({ authenticated: false });
    }

    // Get fresh org data
    const supabase = getServerSupabase();
    const { data: org } = await supabase
      .from('organizations')
      .select('id, name, slug, admin_email, subscription_status, subscription_end_date')
      .eq('id', session.orgId)
      .single();

    if (!org) {
      return NextResponse.json({ authenticated: false });
    }

    const isActive = isSubscriptionValid(
      org.subscription_status,
      org.subscription_end_date
    );

    return NextResponse.json({
      authenticated: true,
      session: {
        orgId: org.id,
        orgName: org.name,
        orgSlug: org.slug,
        adminEmail: org.admin_email,
        subscriptionStatus: org.subscription_status,
        subscriptionEndDate: org.subscription_end_date,
        isSubscriptionActive: isActive,
      },
    });
  } catch (error) {
    console.error('Session check error:', error);
    return NextResponse.json({ authenticated: false });
  }
}
