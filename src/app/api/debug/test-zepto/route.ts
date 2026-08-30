import { NextResponse } from 'next/server';
import { requireActiveSubscription } from '@/lib/auth';
import { testZeptoSend } from '@/lib/email';

export const dynamic = 'force-dynamic';

// Temporary — visit this URL while logged into /admin to send a real
// ZeptoMail test email to your own admin address, bypassing Resend/Brevo
// entirely. Delete this route once ZeptoMail is confirmed working.
export async function GET() {
  const auth = await requireActiveSubscription();
  if ('error' in auth) return auth.error;

  const result = await testZeptoSend(auth.session.adminEmail);
  return NextResponse.json(result);
}
