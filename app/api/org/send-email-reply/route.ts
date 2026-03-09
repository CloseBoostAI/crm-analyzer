import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseOauthEmailId, fetchEmailForReply } from '@/lib/email/fetch';
import { sendGmailMessage, refreshGmailToken } from '@/lib/email/gmail';
import {
  sendOutlookMessage,
  replyOutlookMessage,
  refreshOutlookToken,
} from '@/lib/email/outlook';

/**
 * Send an email reply.
 * POST body: { emailId: string, replyBody: string }
 * emailId: UUID (webhook) or "connectionId:messageId" (OAuth)
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
  const { emailId, replyBody } = body;

  if (!emailId || typeof replyBody !== 'string') {
    return NextResponse.json(
      { error: 'emailId and replyBody are required' },
      { status: 400 }
    );
  }

  const trimmed = replyBody.trim();
  if (!trimmed) {
    return NextResponse.json({ error: 'Reply body cannot be empty' }, { status: 400 });
  }

  const UNSUBSCRIBE_FOOTER = '\n\n---\nTo unsubscribe from these emails, reply with "unsubscribe" or visit https://closeboost.ai/unsubscribe';
  const bodyWithFooter = trimmed + UNSUBSCRIBE_FOOTER;

  const admin = createAdminClient();
  const orgId = myMembership.organization_id;

  const oauth = parseOauthEmailId(emailId);

  if (oauth) {
    // OAuth email: use connection to send reply in thread
    const emailData = await fetchEmailForReply(
      oauth.connectionId,
      oauth.messageId,
      user.id,
      orgId
    );

    if (!emailData) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 });
    }

    const { data: conn } = await admin
      .from('email_connections')
      .select('id, provider, access_token, refresh_token, token_expires_at, email')
      .eq('id', oauth.connectionId)
      .single();

    if (!conn) {
      return NextResponse.json({ error: 'Email connection not found' }, { status: 404 });
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
        .eq('id', oauth.connectionId);
    }

    const to = emailData.senderEmail;
    const subject = emailData.subject.startsWith('Re:')
      ? emailData.subject
      : `Re: ${emailData.subject}`;

    try {
      if (conn.provider === 'gmail') {
        await sendGmailMessage(accessToken, {
          to,
          subject,
          body: bodyWithFooter,
          threadId: emailData.threadId || undefined,
          fromEmail: conn.email,
        });
      } else if (conn.provider === 'outlook') {
        await replyOutlookMessage(accessToken, oauth.messageId, bodyWithFooter);
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

    // Update status to replied
    await admin
      .from('email_status')
      .upsert(
        {
          connection_id: oauth.connectionId,
          message_id: oauth.messageId,
          status: 'replied',
          organization_id: orgId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'connection_id,message_id' }
      );

    return NextResponse.json({ ok: true, status: 'replied' });
  }

  // Webhook email: need an org connection to send from
  const { data: email } = await admin
    .from('inbound_emails')
    .select('id, sender_email, sender_name, subject')
    .eq('id', emailId)
    .eq('organization_id', orgId)
    .single();

  if (!email) {
    return NextResponse.json(
      { error: 'Email not found. Try refreshing the inbox.' },
      { status: 404 }
    );
  }

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

  // Prefer current user's connection
  const conn = (connections || []).find((c: any) => c.user_id === user.id)
    || (connections || [])[0];

  if (!conn) {
    return NextResponse.json(
      { error: 'No email connected. Connect Gmail or Outlook in Settings to send replies.' },
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

  const to = email.sender_email || '';
  const subject = (email.subject || '').startsWith('Re:')
    ? email.subject
    : `Re: ${email.subject || '(no subject)'}`;

  try {
    if (conn.provider === 'gmail') {
      await sendGmailMessage(accessToken, {
        to,
        subject,
        body: bodyWithFooter,
        fromEmail: conn.email,
      });
    } else if (conn.provider === 'outlook') {
      await sendOutlookMessage(accessToken, {
        to,
        toName: email.sender_name || undefined,
        subject,
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

  await admin
    .from('inbound_emails')
    .update({ status: 'replied' })
    .eq('id', emailId);

  return NextResponse.json({ ok: true, status: 'replied' });
}
