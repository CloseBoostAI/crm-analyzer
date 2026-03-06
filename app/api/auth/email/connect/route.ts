import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { getGmailAuthUrl } from '@/lib/email/gmail';
import { getOutlookAuthUrl } from '@/lib/email/outlook';
import { cookies } from 'next/headers';

const STATE_COOKIE = 'email_oauth_state';
const STATE_MAX_AGE = 600; // 10 minutes

function generateState(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const searchParams = request.nextUrl.searchParams;
  const provider = searchParams.get('provider') as 'gmail' | 'outlook' | null;
  const orgId = searchParams.get('orgId') || undefined;

  if (provider !== 'gmail' && provider !== 'outlook') {
    return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  const redirectUri = `${baseUrl}/auth/email/callback`;

  const state = generateState();
  const statePayload = JSON.stringify({ provider, userId: user.id, orgId: orgId || null });

  const cookieStore = await cookies();
  cookieStore.set(STATE_COOKIE, `${state}.${Buffer.from(statePayload).toString('base64url')}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: STATE_MAX_AGE,
    path: '/',
  });

  let authUrl: string;
  if (provider === 'gmail') {
    authUrl = getGmailAuthUrl(redirectUri, state);
  } else {
    authUrl = getOutlookAuthUrl(redirectUri, state);
  }

  return NextResponse.redirect(authUrl);
}
