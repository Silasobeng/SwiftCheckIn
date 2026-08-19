import { SESClient, SendEmailCommand, SendRawEmailCommand } from '@aws-sdk/client-ses';
import { getServerSupabase } from './supabase';
import type { Organization, Service, Person } from '@/types';
import { buildBrandedEmail } from './emailTemplate';

interface EmailRecipient { email: string; name?: string; }
interface EmailAttachment { content: string; name: string; }
interface SendEmailResult { success: boolean; error?: string; }
export interface ReplyTo { email: string; name?: string; }

function getSESClient(): SESClient {
  return new SESClient({
    region: process.env.AWS_REGION || 'eu-west-1',
    credentials: {
      accessKeyId:     process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });
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

export async function sendBrevoEmail(
  to: EmailRecipient[], subject: string, htmlContent: string, orgName?: string,
  attachments?: EmailAttachment[], replyTo?: ReplyTo
): Promise<SendEmailResult> {
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    console.warn('AWS credentials not configured - email not sent');
    return { success: false, error: 'Email not configured' };
  }

  const senderEmail = process.env.SES_SENDER_EMAIL || 'noreply@wemotiply.com';
  const senderName  = orgName || 'WeMotiply';
  const fromAddress = formatAddress(senderEmail, senderName);

  if (attachments && attachments.length > 0) {
    // Attachments require raw MIME email
    const boundary = `boundary_${Date.now()}`;
    const toHeader = to.map(r => formatAddress(r.email, r.name)).join(', ');
    const replyToHeader = replyTo?.email ? `Reply-To: ${formatAddress(replyTo.email, replyTo.name)}\r\n` : '';

    let raw = [
      `From: ${fromAddress}`,
      `To: ${toHeader}`,
      `Subject: ${subject}`,
      replyToHeader.trim(),
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      htmlContent,
    ].filter(Boolean).join('\r\n');

    for (const att of attachments) {
      raw += `\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\nContent-Transfer-Encoding: base64\r\nContent-Disposition: attachment; filename="${att.name}"\r\n\r\n${att.content}\r\n`;
    }
    raw += `\r\n--${boundary}--`;

    try {
      const client = getSESClient();
      await client.send(new SendRawEmailCommand({
        RawMessage: { Data: Buffer.from(raw) },
      }));
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send email';
      console.error('SES raw send error:', msg);
      return { success: false, error: msg };
    }
  }

  // No attachments — use the simpler SendEmail API
  try {
    const client = getSESClient();
    await client.send(new SendEmailCommand({
      Source: fromAddress,
      Destination: { ToAddresses: to.map(r => formatAddress(r.email, r.name)) },
      Message: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body:    { Html: { Data: htmlContent, Charset: 'UTF-8' } },
      },
      ...(replyTo?.email ? { ReplyToAddresses: [formatAddress(replyTo.email, replyTo.name)] } : {}),
    }));
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to send email';
    console.error('SES send error:', msg);
    return { success: false, error: msg };
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
