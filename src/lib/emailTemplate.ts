/**
 * Premium branded email template builder.
 *
 * Table-based on purpose: Outlook (Word rendering engine) ignores flexbox and
 * most modern CSS, and a meaningful share of church admins read mail there.
 * Every layout decision here has to survive that, so structure is tables and
 * inline styles only.
 */

function parseHex(hex?: string): [number, number, number] | null {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function toHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function luminance(r: number, g: number, b: number): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

// Picks readable text color against an arbitrary background
export function readableTextColor(hex?: string): string {
  const rgb = parseHex(hex);
  if (!rgb) return '#ffffff';
  return luminance(...rgb) > 0.6 ? '#1a1a2e' : '#ffffff';
}

// Lighten a hex color for use as a tinted background
function tintColor(hex: string, amount: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return '#f0eef5';
  const [r, g, b] = rgb;
  return toHex(r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount);
}

/**
 * A version of the brand color that is always legible as text on white.
 * A church might pick a pale gold or bright yellow; used raw for a heading it
 * would be unreadable. This darkens only as far as needed to clear a contrast
 * floor, so vivid brands keep their character.
 */
function readableBrandText(hex: string): string {
  let rgb = parseHex(hex);
  if (!rgb) return '#4f46e5';
  let [r, g, b] = rgb;
  let guard = 0;
  while (luminance(r, g, b) > 0.5 && guard++ < 12) {
    r *= 0.82; g *= 0.82; b *= 0.82;
  }
  return toHex(r, g, b);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export interface BrandedEmailOptions {
  // Org branding
  orgName: string;
  brandColor?: string;
  logoUrl?: string | null;
  // Content
  greeting: string;        // e.g. "Hi Peace,"
  headline?: string;       // bold line under greeting, e.g. "We're so glad you joined us today!"
  body: string;            // main message (plain text, newlines → <br>)
  preheader?: string;      // inbox preview line; hidden in the body
  // Optional sections
  serviceCard?: { label: string; value: string } | null;  // e.g. { label: "Today's Gathering", value: "Sunday Service" }
  signOff?: string;        // e.g. "With love,\nThe Grace Chapel Family"
  // Footer contact
  address?: string | null;
  phone?: string | null;
  email?: string | null;
}

export function buildBrandedEmail(opts: BrandedEmailOptions): string {
  const color = (opts.brandColor && /^#[0-9a-fA-F]{6}$/.test(opts.brandColor)) ? opts.brandColor : '#4f46e5';
  const brandText = readableBrandText(color);   // safe for headings/accents on white
  const tint = tintColor(color, 0.92);
  const tintMid = tintColor(color, 0.85);
  const tintBorder = tintColor(color, 0.72);

  const bodyHtml = escapeHtml(opts.body).replace(/\n/g, '<br>');
  const signOffHtml = opts.signOff ? escapeHtml(opts.signOff).replace(/\n/g, '<br>') : '';

  // Inbox preview text: what shows next to the subject before opening. Kept out
  // of the visible layout with a zero-height hidden preheader.
  const preheaderRaw = (opts.preheader || opts.headline || opts.body.split('\n')[0] || '').slice(0, 140);
  const preheader = `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#f4f5f7;opacity:0;">${escapeHtml(preheaderRaw)}</div>`;

  // Logo + name, centered, as a table so Outlook keeps them aligned.
  const logoBlock = opts.logoUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr>
         <td style="vertical-align:middle;padding-right:14px;"><img src="${opts.logoUrl}" alt="${escapeHtml(opts.orgName)}" width="48" height="48" style="width:48px;height:48px;border-radius:12px;object-fit:cover;display:block;background:#fff;" /></td>
         <td style="vertical-align:middle;"><span style="font-family:Georgia,'Times New Roman',serif;font-size:24px;color:#16243A;font-weight:600;">${escapeHtml(opts.orgName)}</span></td>
       </tr></table>`
    : `<span style="font-family:Georgia,'Times New Roman',serif;font-size:24px;color:#16243A;font-weight:600;">${escapeHtml(opts.orgName)}</span>`;

  // Service card — a two-cell table (icon | text), not flexbox.
  const serviceCardHtml = opts.serviceCard ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
      <tr><td style="background:${tint};border:1px solid ${tintBorder};border-radius:12px;padding:16px 18px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="width:40px;vertical-align:middle;padding-right:14px;">
            <div style="width:40px;height:40px;border-radius:10px;background:${tintMid};text-align:center;line-height:40px;font-size:18px;">&#128197;</div>
          </td>
          <td style="vertical-align:middle;">
            <div style="font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:${brandText};font-weight:600;">${escapeHtml(opts.serviceCard.label)}</div>
            <div style="font-size:16px;color:#16243A;font-weight:500;margin-top:3px;">${escapeHtml(opts.serviceCard.value)}</div>
          </td>
        </tr></table>
      </td></tr>
    </table>` : '';

  // Contact footer — one cell per present item, evenly spaced by a table row.
  const contactCells: string[] = [];
  const contactCell = (icon: string, text: string) => `<td style="padding:0 14px;vertical-align:top;text-align:center;font-size:12px;color:#7A6E60;line-height:1.6;">
    <div style="font-size:16px;margin-bottom:5px;">${icon}</div>${text}</td>`;
  if (opts.address) contactCells.push(contactCell('&#128205;', escapeHtml(opts.address).replace(/\n/g, '<br>')));
  if (opts.email)   contactCells.push(contactCell('&#9993;', escapeHtml(opts.email)));
  if (opts.phone)   contactCells.push(contactCell('&#128222;', escapeHtml(opts.phone)));
  const contactFooter = contactCells.length > 0 ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #eee6da;margin-top:28px;">
      <tr><td style="padding-top:22px;">
        <table role="presentation" style="margin:0 auto;border-collapse:collapse;"><tr>${contactCells.join('')}</tr></table>
      </td></tr>
    </table>` : '';

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta name="color-scheme" content="light">
<title>${escapeHtml(opts.orgName)}</title>
</head>
<body style="margin:0;padding:0;background:#F8F4EE;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8F4EE;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;">

      <!-- Brand color bar -->
      <tr><td style="height:6px;background:${color};border-radius:6px 6px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>

      <!-- Main card -->
      <tr><td style="background:#ffffff;border-radius:0 0 16px 16px;border:1px solid #EDE7DC;border-top:none;">

        <!-- Logo + Church Name -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td align="center" style="padding:32px 32px 20px;">${logoBlock}</td></tr>
          <tr><td style="padding:0 32px;"><div style="height:1px;background:#EDE7DC;font-size:0;line-height:0;">&nbsp;</div></td></tr>
        </table>

        <!-- Content -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="padding:26px 32px 32px;">

            <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;color:${brandText};font-weight:600;margin:0 0 10px;">${escapeHtml(opts.greeting)}</h1>

            ${opts.headline ? `<p style="font-size:16px;color:#16243A;font-weight:600;line-height:1.55;margin:0 0 16px;">${escapeHtml(opts.headline)}</p>` : ''}

            <div style="font-size:15px;color:#4b5563;line-height:1.75;">${bodyHtml}</div>

            ${serviceCardHtml}

            ${signOffHtml ? `<div style="font-size:15px;color:#4b5563;line-height:1.75;margin-top:22px;">${signOffHtml}</div>` : ''}

            ${contactFooter}

          </td></tr>
        </table>

      </td></tr>

      <!-- Powered by -->
      <tr><td align="center" style="padding:20px 0 8px;">
        <span style="font-size:11px;color:#A89D8E;">Powered by <span style="color:#7A6E60;font-weight:500;">SwiftEntryPro</span></span><br>
        <span style="font-size:10px;color:#c4bcae;">Church check-in, made simple.</span>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;
}
