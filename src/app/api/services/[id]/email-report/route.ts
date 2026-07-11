import { getServerSupabase } from './supabase';
import type { Organization, Service, Person } from '@/types';

interface EmailRecipient { email: string; name?: string; }
interface EmailAttachment { content: string; name: string; }
interface SendEmailResult { success: boolean; error?: string; }

export async function sendBrevoEmail(
  to: EmailRecipient[], subject: string, htmlContent: string, orgName?: string, attachments?: EmailAttachment[]
): Promise<SendEmailResult> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.warn('BREVO_API_KEY not configured - email not sent');
    return { success: false, error: 'Email not configured' };
  }
  const senderEmail = process.env.BREVO_SENDER_EMAIL || 'noreply@swiftentrypro.com';
  const senderName  = orgName || process.env.BREVO_SENDER_NAME || 'SwiftEntryPro';
  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'accept':'application/json', 'api-key':apiKey, 'content-type':'application/json' },
      body: JSON.stringify({
        sender:{ name:senderName, email:senderEmail }, to, subject, htmlContent,
        ...(attachments && attachments.length > 0 ? { attachment: attachments } : {}),
      }),
    });
    if (!response.ok) {
      const error = await response.json();
      return { success: false, error: error.message || 'Failed to send email' };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: 'Failed to send email' };
  }
}

export function textToHtml(text: string, orgName: string): string {
  const escaped = text
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\n/g,'<br>');
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.7;color:#1f2937;max-width:600px;margin:0 auto;padding:20px;background:#f9fafb;">
  <div style="background:white;border-radius:16px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <h1 style="text-align:center;color:#16243A;margin-bottom:24px;font-size:22px;font-family:Georgia,serif;">${orgName}</h1>
    <div style="color:#374151;">${escaped}</div>
  </div>
  <p style="text-align:center;color:#9ca3af;font-size:12px;margin-top:24px;">Powered by SwiftEntryPro</p>
</body></html>`;
}

export function processTemplate(
  template: string, person: Person, org: Organization, service?: Service | null
): string {
  const firstName = person.full_name.split(' ')[0];

  // Build SERVICE_INFO block — title, theme, scripture, message (announcements)
  let serviceInfo = '';
  if (service) {
    const parts: string[] = [];
    if (service.title)     parts.push(`Today\'s gathering: ${service.title}`);
    if (service.theme)     parts.push(`Theme: ${service.theme}`);
    if (service.scripture) parts.push(`Scripture: ${service.scripture}`);
    if (service.message)   parts.push(service.message);
    if (parts.length > 0)  serviceInfo = '\n' + parts.join('\n') + '\n';
  }

  return template
    .replace(/\{NAME\}/g,         firstName)
    .replace(/\{FULL_NAME\}/g,    person.full_name)
    .replace(/\{ORG_NAME\}/g,     org.name)
    .replace(/\{SERVICE_INFO\}/g, serviceInfo);
}

export async function sendWelcomeEmail(
  person: Person, orgId: string, service?: Service | null
): Promise<SendEmailResult> {
  if (!person.email) return { success: false, error: 'No email address' };
  const supabase = getServerSupabase();
  const { data: org }      = await supabase.from('organizations').select('*').eq('id', orgId).single();
  if (!org) return { success: false, error: 'Organization not found' };
  const { data: template } = await supabase.from('email_templates').select('*').eq('org_id', orgId).eq('template_type', 'welcome').single();
  if (!template) return { success: false, error: 'Template not found' };

  const subject = processTemplate(template.subject, person, org, service);
  const body    = processTemplate(template.body,    person, org, service);
  const html    = textToHtml(body, org.name);
  const result  = await sendBrevoEmail([{ email: person.email, name: person.full_name }], subject, html, org.name);

  await supabase.from('email_logs').insert({
    org_id: orgId, person_id: person.id, email_type: 'welcome',
    subject, recipient_email: person.email,
    status: result.success ? 'sent' : 'failed',
  });
  return result;
}
