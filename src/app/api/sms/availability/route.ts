import { NextResponse } from 'next/server';
import { requireActiveSubscription } from '@/lib/auth';
import { getServerSupabase } from '@/lib/supabase';
export const dynamic = 'force-dynamic';
export async function GET() {
  const auth = await requireActiveSubscription(); if ('error' in auth) return auth.error;
  const { data } = await getServerSupabase().from('platform_settings').select('sms_sales_available').eq('id', true).maybeSingle();
  return NextResponse.json({ available: data?.sms_sales_available !== false });
}
