import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { exchangeGmailCode, getGmailUserEmail } from '@/lib/email/gmail';
import { exchangeOutlookCode, getOutlookUserEmail } from '@/lib/email/outlook';

const STATE_COOKIE = 'email_oauth_state';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { code, state } = body as { code?: string; state?: string };

  if (!code || !state) {
    return NextResponse.json({ error: 'Missing code or state' }, { status: 400 });
  }

  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(STATE_COOKIE)?.value;
  if (!cookieValue) {
    return NextResponse.json({ error: 'Invalid or expired state' }, { status: 400 });
  }

  const [storedState, payloadB64] = cookieValue.split('.');
  if (storedState !== state) {
    return NextResponse.json({ error: 'State mismatch' }, { status: 400 });
  }

  let statePayload: { provider: string; userId: string; orgId: string | null };
  try {
    statePayload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
  } catch {
    return NextResponse.json({ error: 'Invalid state payload' }, { status: 400 });
  }

  if (statePayload.userId !== user.id) {
    return NextResponse.json({ error: 'User mismatch' }, { status: 403 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  const redirectUri = `${baseUrl}/auth/email/callback`;

  let email: string;
  let accessToken: string;
  let refreshToken: string | undefined;
  let expiresIn: number;
  let scope: string | undefined;

  if (statePayload.provider === 'gmail') {
    const tokens = await exchangeGmailCode(code, redirectUri);
    email = await getGmailUserEmail(tokens.access_token);
    accessToken = tokens.access_token;
    refreshToken = tokens.refresh_token;
    expiresIn = tokens.expires_in;
    scope = tokens.scope;
  } else if (statePayload.provider === 'outlook') {
    const tokens = await exchangeOutlookCode(code, redirectUri);
    email = await getOutlookUserEmail(tokens.access_token);
    accessToken = tokens.access_token;
    refreshToken = tokens.refresh_token;
    expiresIn = tokens.expires_in;
    scope = tokens.scope;
  } else {
    return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
  }

  const tokenExpiresAt = expiresIn
    ? new Date(Date.now() + expiresIn * 1000).toISOString()
    : null;

  const { error } = await supabase.from('email_connections').upsert(
    {
      user_id: user.id,
      organization_id: statePayload.orgId || null,
      provider: statePayload.provider,
      email: email.toLowerCase(),
      access_token: accessToken,
      refresh_token: refreshToken || null,
      token_expires_at: tokenExpiresAt,
      scope: scope || null,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: 'user_id,provider,email',
    }
  );

  if (error) {
    console.error('[email-callback] Insert error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  cookieStore.delete(STATE_COOKIE);

  return NextResponse.json({ ok: true, email });
}
