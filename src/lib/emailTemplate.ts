/**
 * Premium branded email template builder.
 * Produces a polished, Bolt-quality HTML email using
 * each church's own branding (color, logo, contact info).
 */

// Picks readable text color against an arbitrary background
export function readableTextColor(hex?: string): string {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return '#ffffff';
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#1a1a2e' : '#ffffff';
}

// Lighten a hex color for use as a tinted background
function tintColor(hex: string, amount: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return '#f0eef5';
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  const nr = Math.round(r + (255 - r) * amount), ng = Math.round(g + (255 - g) * amount), nb = Math.round(b + (255 - b) * amount);
  return `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb.toString(16).padStart(2, '0')}`;
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
  const bannerTextColor = readableTextColor(color);
  const tint = tintColor(color, 0.92);
  const tintMid = tintColor(color, 0.85);

  const bodyHtml = opts.body
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');

  const signOffHtml = opts.signOff
    ? opts.signOff.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')
    : '';

  // Logo section
  const logoSection = opts.logoUrl
    ? `<img src="${opts.logoUrl}" alt="${opts.orgName}" style="width:52px;height:52px;border-radius:14px;object-fit:cover;display:inline-block;vertical-align:middle;margin-right:14px;background:#fff;" /><span style="font-family:Georgia,'Times New Roman',serif;font-size:24px;color:#1a1a2e;font-weight:600;vertical-align:middle;">${opts.orgName}</span>`
    : `<span style="font-family:Georgia,'Times New Roman',serif;font-size:24px;color:#1a1a2e;font-weight:600;">${opts.orgName}</span>`;

  // Service info card
  const serviceCardHtml = opts.serviceCard ? `
    <div style="background:${tint};border-radius:12px;padding:16px 20px;margin:24px 0;display:flex;align-items:center;">
      <div style="width:40px;height:40px;border-radius:10px;background:${tintMid};display:inline-block;vertical-align:middle;text-align:center;line-height:40px;font-size:18px;margin-right:14px;flex-shrink:0;">&#128197;</div>
      <div style="display:inline-block;vertical-align:middle;">
        <div style="font-size:13px;color:${color};font-weight:600;">${opts.serviceCard.label}</div>
        <div style="font-size:15px;color:#1a1a2e;font-weight:500;margin-top:2px;">${opts.serviceCard.value}</div>
      </div>
    </div>` : '';

  // Contact footer items
  const contactItems: string[] = [];
  if (opts.address) {
    const addrHtml = opts.address.replace(/\n/g, '<br>');
    contactItems.push(`<td style="padding:0 16px;vertical-align:top;text-align:center;font-size:12px;color:#6b7280;line-height:1.5;">
      <div style="font-size:16px;margin-bottom:4px;">&#128205;</div>${addrHtml}</td>`);
  }
  if (opts.email) {
    contactItems.push(`<td style="padding:0 16px;vertical-align:top;text-align:center;font-size:12px;color:#6b7280;line-height:1.5;">
      <div style="font-size:16px;margin-bottom:4px;">&#127760;</div>${opts.email}</td>`);
  }
  if (opts.phone) {
    contactItems.push(`<td style="padding:0 16px;vertical-align:top;text-align:center;font-size:12px;color:#6b7280;line-height:1.5;">
      <div style="font-size:16px;margin-bottom:4px;">&#128222;</div>${opts.phone}</td>`);
  }
  const contactFooter = contactItems.length > 0 ? `
    <div style="border-top:1px solid #e5e7eb;padding-top:24px;margin-top:28px;">
      <table style="width:100%;border-collapse:collapse;"><tr>${contactItems.join('')}</tr></table>
    </div>` : '';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px 16px;">

    <!-- Brand color bar -->
    <div style="height:6px;background:${color};border-radius:6px 6px 0 0;"></div>

    <!-- Main card -->
    <div style="background:#ffffff;border-radius:0 0 16px 16px;box-shadow:0 2px 8px rgba(0,0,0,0.06);overflow:hidden;">

      <!-- Logo + Church Name -->
      <div style="text-align:center;padding:32px 32px 20px;">
        ${logoSection}
      </div>

      <div style="height:1px;background:#e5e7eb;margin:0 32px;"></div>

      <!-- Content -->
      <div style="padding:28px 32px 32px;">

        <!-- Greeting -->
        <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;color:${color};font-weight:600;margin:0 0 8px;">${opts.greeting}</h2>

        ${opts.headline ? `<p style="font-size:16px;color:#1a1a2e;font-weight:600;line-height:1.5;margin:0 0 16px;">${opts.headline}</p>` : ''}

        <!-- Body -->
        <div style="font-size:15px;color:#4b5563;line-height:1.75;margin-bottom:8px;">${bodyHtml}</div>

        ${serviceCardHtml}

        <!-- Sign-off -->
        ${signOffHtml ? `<div style="font-size:15px;color:#4b5563;line-height:1.75;margin-top:20px;">${signOffHtml}</div>` : ''}

        ${contactFooter}
      </div>
    </div>

    <!-- Powered by -->
    <div style="text-align:center;padding:20px 0 8px;">
      <span style="font-size:11px;color:#9ca3af;">Powered by SwiftEntryPro</span><br>
      <span style="font-size:10px;color:#b0b8c4;">Church Management Software</span>
    </div>
  </div>
</body></html>`;
}
