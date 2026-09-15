import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth';
import { getServerSupabase } from '@/lib/supabase';
export const dynamic = 'force-dynamic';
export async function GET() { const auth=await requireOwner(); if ('error' in auth) return auth.error; const {data}=await getServerSupabase().from('platform_settings').select('sms_sales_available').eq('id',true).maybeSingle(); return NextResponse.json({ available:data?.sms_sales_available !== false }); }
export async function PATCH(request:NextRequest) { const auth=await requireOwner(); if ('error' in auth) return auth.error; const {available}=await request.json(); if(typeof available!=='boolean') return NextResponse.json({error:'available must be true or false'},{status:400}); const {error}=await getServerSupabase().from('platform_settings').upsert({id:true,sms_sales_available:available,updated_at:new Date().toISOString()}); if(error)return NextResponse.json({error:error.message},{status:500}); return NextResponse.json({available}); }
