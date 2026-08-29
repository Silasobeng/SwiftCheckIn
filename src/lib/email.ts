import { Resend } from 'resend';
import { getServerSupabase } from './supabase';
import type { Organization, Service, Person } from '@/types';
import { buildBrandedEmail } from './emailTemplate';

interface EmailRecipient { email: string; name?: string; }
interface EmailAttachment { content: string; name: string; }
interface SendEmailResult { success: boolean; error?: string; }
export interface ReplyTo { email: string; name?: string; }

function getResend(): Resend {
  return new Resend(process.env.RESEND_API_KEY);
}

/**
 * Reply-to for anything sent TO a member.
 *
 * Every member-facing email — welcome, birthday, we-miss-you, receipt — goes out
 * from the shared platform sender. Without a reply-to, a member who hits Reply
 * (and they do; a birthday email is the kind of message people answer) sends it
 * into a no-reply mailbox nobody reads. Pointing replies at the church's own
 * address makes the conversation work, and is a "a person sent this" signal that
 * helps these land in Primary rather than Promotions.
 */
export function orgReplyTo(
  org: { name?: string | null; email?: string | null; admin_email?: string | null }
): ReplyTo | undefined {
  const email = org.email || org.admin_email;
  return email ? { email, name: org.name || undefined } : undefined;
}

function formatAddress(email: string, name?: string): string {
  return name ? `${name.replace(/[,<>]/g, '')} <${email}>` : email;
}

// Brevo fallback — called when Resend hits its daily quota.
// Uses Brevo's HTTP API directly (no SDK) so there's nothing extra to install.
async function sendViaBrevo(
  to: EmailRecipient[], subject: string, htmlContent: string,
  from: { email: string; name: string }, replyTo?: ReplyTo,
  attachments?: EmailAttachment[]
): Promise<SendEmailResult> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return { success: false, error: 'Brevo not configured' };

  const body: Record<string, unknown> = {
    sender: { email: from.email, name: from.name },
    to: to.map(r => ({ email: r.email, name: r.name || r.email })),
    subject,
    htmlContent,
    ...(replyTo?.email ? { replyTo: { email: replyTo.email, name: replyTo.name } } : {}),
    ...(attachments?.length ? {
      attachment: attachments.map(a => ({ name: a.name, content: a.content })),
    } : {}),
  };

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('Brevo fallback error:', text);
    return { success: false, error: `Brevo: ${res.status}` };
  }
  return { success: true };
}

export async function sendBrevoEmail(
  to: EmailRecipient[], subject: string, htmlContent: string, orgName?: string,
  attachments?: EmailAttachment[], replyTo?: ReplyTo
): Promise<SendEmailResult> {
  if (!process.env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not configured - email not sent');
    return { success: false, error: 'Email not configured' };
  }

  const senderEmail = process.env.RESEND_FROM_EMAIL || 'noreply@wemotiply.com';
  const senderName  = orgName || 'WeMotiply';
  const from = { email: senderEmail, name: senderName };

  try {
    const resend = getResend();
    const { error } = await resend.emails.send({
      from: formatAddress(senderEmail, senderName),
      to: to.map(r => formatAddress(r.email, r.name)),
      subject,
      html: htmlContent,
      ...(replyTo?.email ? { replyTo: formatAddress(replyTo.email, replyTo.name) } : {}),
      ...(attachments?.length ? {
        attachments: attachments.map(a => ({
          filename: a.name,
          content: Buffer.from(a.content, 'base64'),
        })),
      } : {}),
    });

    if (error) {
      // Fall back to Brevo on ANY Resend failure, not just quota — this used
      // to check the error message for quota-shaped keywords ("quota",
      // "rate", "limit", "429") and give up on everything else. That missed
      // the actual first failure mode in production: a 403 validation_error
      // for an unverified sending domain, which shares none of those words
      // and so silently dropped every welcome/birthday/missed/reset email
      // with no fallback and nothing visible to the recipient. There's no
      // real downside to trying Brevo unconditionally — if Resend is broken
      // for any provider-side reason (domain, auth, quota, an outage),
      // Brevo sidesteps it; if the failure is a genuinely bad recipient
      // address, Brevo will reject it too and we return that instead,
      // no worse off than before.
      console.warn('Resend send failed, falling back to Brevo:', error.message);
      return sendViaBrevo(to, subject, htmlContent, from, replyTo, attachments);
    }
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to send email';
    console.warn('Resend send threw, falling back to Brevo:', msg);
    return sendViaBrevo(to, subject, htmlContent, from, replyTo, attachments);
  }
}

// Re-export for backward compat — other files import this from here
export { readableTextColor } from './emailTemplate';

// People often get typed in lowercase at a busy kiosk ("silas obeng"). Names
// are the one thing an email must never render sloppily, so title-case them
// at the single point every email flows through. Handles hyphens and
// apostrophes (e.g. "ama-serwaa", "n'kansah").
function titleCaseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/(^|[\s'-])([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase());
}

export function processTemplate(
  template: string, person: Person, org: Organization, service?: Service | null
): string {
  const fullName = titleCaseName(person.full_name);
  const firstName = fullName.split(' ')[0];

  let serviceInfo = '';
  if (service) {
    const parts: string[] = [];
    if (service.title)     parts.push(`Today's gathering: ${service.title}`);
    if (service.theme)     parts.push(`Theme: ${service.theme}`);
    if (service.scripture) parts.push(`Scripture: ${service.scripture}`);
    if (service.message)   parts.push(service.message);
    if (parts.length > 0)  serviceInfo = '\n' + parts.join('\n') + '\n';
  }

  return template
    .replace(/\{NAME\}/g,         firstName)
    .replace(/\{FULL_NAME\}/g,    fullName)
    .replace(/\{ORG_NAME\}/g,     org.name)
    .replace(/\{SERVICE_INFO\}/g, serviceInfo);
}

/**
 * Build a premium branded HTML email from a processed template body.
 * Parses the "Dear X, ... With love, The Y Family" structure into
 * greeting / body / service card / sign-off sections.
 */
export function buildPremiumHtml(
  processedBody: string,
  org: { name: string; brand_color?: string | null; logo_url?: string | null; address?: string | null; phone?: string | null; email?: string | null },
  service?: { title?: string | null } | null
): string {
  let text = processedBody.trim();

  // Extract greeting (first line like "Dear X,")
  let greeting = '';
  const greetingMatch = text.match(/^Dear\s+([^,\n]+),?\s*/i);
  if (greetingMatch) {
    greeting = `Hi ${greetingMatch[1].trim()},`;
    text = text.slice(greetingMatch[0].length).trim();
  }

  // Extract sign-off (everything from "With love," to end)
  let signOff = '';
  const signOffIdx = text.search(/\n\s*With love,/i);
  if (signOffIdx !== -1) {
    signOff = text.slice(signOffIdx).trim();
    text = text.slice(0, signOffIdx).trim();
  }

  // Extract service info block if present in the remaining text
  // (it's the text inserted by {SERVICE_INFO} — starts with "Today's gathering:")
  let serviceTitle: string | null = null;
  const serviceMatch = text.match(/\n?\s*Today'?s gathering:\s*(.+?)(\n|$)/i);
  if (serviceMatch) {
    serviceTitle = serviceMatch[1].trim();
    // Remove the entire service info block (gathering + theme + scripture lines)
    const serviceBlockStart = text.indexOf(serviceMatch[0]);
    let serviceBlockEnd = serviceBlockStart + serviceMatch[0].length;
    // Consume subsequent Theme:/Scripture: lines
    const remaining = text.slice(serviceBlockEnd);
    const extraLines = remaining.match(/^(\s*(Theme|Scripture|Message):.*(\n|$))*/i);
    if (extraLines) serviceBlockEnd += extraLines[0].length;
    text = (text.slice(0, serviceBlockStart) + text.slice(serviceBlockEnd)).trim();
  }
  // Fall back to the service object's title if template didn't include {SERVICE_INFO}
  if (!serviceTitle && service?.title) {
    serviceTitle = service.title;
  }

  // Extract first sentence as headline (bold line)
  let headline = '';
  const firstSentenceEnd = text.search(/[.!]\s/);
  if (firstSentenceEnd > 0 && firstSentenceEnd < 120) {
    headline = text.slice(0, firstSentenceEnd + 1).trim();
    text = text.slice(firstSentenceEnd + 1).trim();
  }

  return buildBrandedEmail({
    orgName: org.name,
    brandColor: org.brand_color || undefined,
    logoUrl: org.logo_url,
    greeting: greeting || 'Hello,',
    headline: headline || undefined,
    body: text,
    preheader: headline || text,
    serviceCard: serviceTitle ? { label: "Today's Gathering", value: serviceTitle } : null,
    signOff: signOff || `We look forward to seeing you again soon.\n\nWith love,\nThe ${org.name} Family`,
    address: org.address,
    phone: org.phone,
    email: org.email,
  });
}

// Keep textToHtml for backward compat (custom/bulk emails still use it)
export function textToHtml(text: string, orgName: string, brandColor?: string): string {
  return buildBrandedEmail({
    orgName,
    brandColor,
    greeting: '',
    body: text,
  });
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
  const html    = buildPremiumHtml(body, org, service);
  const result  = await sendBrevoEmail(
    [{ email: person.email, name: person.full_name }],
    subject, html, org.name, undefined, orgReplyTo(org)
  );

  await supabase.from('email_logs').insert({
    org_id: orgId, person_id: person.id, email_type: 'welcome',
    subject, recipient_email: person.email,
    status: result.success ? 'sent' : 'failed',
  });
  return result;
}
