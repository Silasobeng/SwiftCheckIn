import { NextRequest, NextResponse } from 'next/server';
import { verifyOwnerPassword, createOwnerToken, setOwnerCookie, clearOwnerCookie, isOwnerAuthenticated } from '@/lib/auth';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

// GET - is the current visitor already owner-authenticated?
export async function GET() {
  return NextResponse.json({ authenticated: await isOwnerAuthenticated() });
}

// POST - exchange the owner password for an owner cookie.
export async function POST(request: NextRequest) {
  // Brute-force protection: the whole portal is guarded by one password.
  const rate = checkRateLimit(`owner-login:${getClientIP(request)}`, { limit: 5, windowSec: 300 });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Wait a few minutes and try again.' },
      { status: 429 }
    );
  }

  try {
    const { password } = await request.json();

    if (!process.env.OWNER_PORTAL_PASSWORD) {
      return NextResponse.json(
        { error: 'Owner portal is not configured. Set OWNER_PORTAL_PASSWORD.' },
        { status: 503 }
      );
    }

    if (!verifyOwnerPassword(password)) {
      return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 });
    }

    const token = await createOwnerToken();
    await setOwnerCookie(token);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// DELETE - owner logout.
export async function DELETE() {
  await clearOwnerCookie();
  return NextResponse.json({ success: true });
}
