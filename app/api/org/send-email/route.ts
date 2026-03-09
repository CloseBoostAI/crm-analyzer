import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendGmailMessage, refreshGmailToken } from '@/lib/email/gmail';
import {
  sendOutlookMessage,
  refreshOutlookToken,
} from '@/lib/email/outlook';

/**
 * Send a new email (e.g. from the email generator).
 * POST body: { to: string, toName?: string, subject: string, body: string }
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: myMembership } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .limit(1)
    .single();

  if (!myMembership) {
    return NextResponse.json({ error: 'Not in an organization' }, { status: 403 });
  }

  const body = await request.json();
  const { to, toName, subject, body: emailBody } = body;

  if (!to || typeof to !== 'string' || !subject || typeof subject !== 'string' || typeof emailBody !== 'string') {
    return NextResponse.json(
      { error: 'to, subject, and body are required' },
      { status: 400 }
    );
  }

  const trimmed = emailBody.trim();
  if (!trimmed) {
    return NextResponse.json({ error: 'Email body cannot be empty' }, { status: 400 });
  }

  const UNSUBSCRIBE_FOOTER = '\n\n---\nTo unsubscribe from these emails, reply with "unsubscribe" or visit https://closeboost.ai/unsubscribe';
  const bodyWithFooter = trimmed + UNSUBSCRIBE_FOOTER;

  const admin = createAdminClient();
  const orgId = myMembership.organization_id;

  const { data: members } = await admin
    .from('organization_members')
    .select('user_id')
    .eq('organization_id', orgId);
  const userIds = (members || []).map((m: { user_id: string }) => m.user_id);

  const { data: connections } = await admin
    .from('email_connections')
    .select('id, user_id, provider, access_token, refresh_token, token_expires_at, email')
    .in('user_id', userIds)
    .not('access_token', 'is', null);

  const conn = (connections || []).find((c: { user_id: string }) => c.user_id === user.id)
    || (connections || [])[0];

  if (!conn) {
    return NextResponse.json(
      { error: 'No email connected. Connect Gmail or Outlook in Settings to send emails.' },
      { status: 400 }
    );
  }

  let accessToken = conn.access_token;
  const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0;
  const now = Date.now();
  const bufferMs = 5 * 60 * 1000;

  if (conn.refresh_token && (expiresAt === 0 || expiresAt < now + bufferMs)) {
    const refreshed =
      conn.provider === 'gmail'
        ? await refreshGmailToken(conn.refresh_token)
        : await refreshOutlookToken(conn.refresh_token);
    accessToken = refreshed.access_token;
    const tokenExpiresAt = refreshed.expires_in
      ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
      : null;
    await admin
      .from('email_connections')
      .update({
        access_token: accessToken,
        token_expires_at: tokenExpiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conn.id);
  }

  try {
    if (conn.provider === 'gmail') {
      await sendGmailMessage(accessToken, {
        to: to.trim(),
        subject: subject.trim(),
        body: bodyWithFooter,
        fromEmail: conn.email,
      });
    } else if (conn.provider === 'outlook') {
      await sendOutlookMessage(accessToken, {
        to: to.trim(),
        toName: typeof toName === 'string' ? toName.trim() : undefined,
        subject: subject.trim(),
        body: bodyWithFooter,
      });
    } else {
      return NextResponse.json({ error: 'Unsupported provider' }, { status: 400 });
    }
  } catch (err: any) {
    console.error('Send email error:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to send email' },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
