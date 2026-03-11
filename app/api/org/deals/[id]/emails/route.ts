import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { fetchEmailsForOrg, parseOauthEmailId, fetchThreadForDealEmail, findOAuthThreadBySender, findOAuthThreadByRecipient } from '@/lib/email/fetch';
import { htmlToPlainText } from '@/lib/utils';

export type ThreadMessage = {
  senderEmail: string;
  senderName: string | null;
  bodyText: string;
  receivedAt: string;
  isFromUser: boolean;
};

export type DealEmailThread = {
  id: string;
  subject: string;
  status: 'pending' | 'acknowledged' | 'replied';
  receivedAt: string;
  messages: ThreadMessage[];
};

/** GET /api/org/deals/[id]/emails - Fetch email exchanges for a deal (full threads: customer + user replies) */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: dealId } = await params;

  const { data: myMembership } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .single();

  if (!myMembership) {
    return NextResponse.json({ error: 'Not in an organization' }, { status: 403 });
  }

  const admin = createAdminClient();

  const { data: deal } = await admin
    .from('deals')
    .select('id, user_id, email')
    .eq('id', dealId)
    .single();

  if (!deal) {
    return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
  }

  const { data: members } = await admin
    .from('organization_members')
    .select('user_id')
    .eq('organization_id', myMembership.organization_id);
  const orgUserIds = (members || []).map((m: { user_id: string }) => m.user_id);
  if (!orgUserIds.includes(deal.user_id)) {
    return NextResponse.json({ error: 'Deal not in your organization' }, { status: 403 });
  }

  const orgId = myMembership.organization_id;

  type SeedEmail = { id: string; connectionId?: string; messageId?: string; subject: string; status: string; receivedAt: string; bodyText?: string | null; bodyHtml?: string | null; senderEmail: string; senderName?: string | null };
  const seeds: SeedEmail[] = [];

  // 1. Webhook emails (no connection - single message only)
  const { data: webhookRows } = await admin
    .from('inbound_emails')
    .select('id, sender_email, sender_name, subject, body_text, body_html, status, received_at')
    .eq('organization_id', orgId)
    .eq('deal_id', dealId)
    .is('connection_id', null)
    .is('message_id', null)
    .order('received_at', { ascending: false });

  for (const row of webhookRows || []) {
    seeds.push({
      id: row.id,
      subject: row.subject || '',
      status: (row.status || 'pending') as 'pending' | 'acknowledged' | 'replied',
      receivedAt: row.received_at,
      bodyText: row.body_text,
      bodyHtml: row.body_html,
      senderEmail: row.sender_email || '',
      senderName: row.sender_name,
    });
  }

  // 2. OAuth emails (id = connectionId:messageId)
  const oauthEmails = await fetchEmailsForOrg(orgId, undefined, 100);
  for (const e of oauthEmails.filter((x) => x.dealId === dealId)) {
    const parsed = parseOauthEmailId(e.id);
    if (parsed) {
      seeds.push({
        id: e.id,
        connectionId: parsed.connectionId,
        messageId: parsed.messageId,
        subject: e.subject,
        status: e.status,
        receivedAt: e.receivedAt,
        bodyText: e.bodyText,
        bodyHtml: e.bodyHtml,
        senderEmail: e.senderEmail,
        senderName: e.senderName,
      });
    }
  }

  // 3. Synced OAuth emails (have connection_id, message_id)
  const { data: syncedRows } = await admin
    .from('inbound_emails')
    .select('id, connection_id, message_id, sender_email, sender_name, subject, body_text, body_html, status, received_at')
    .eq('organization_id', orgId)
    .eq('deal_id', dealId)
    .not('connection_id', 'is', null)
    .not('message_id', 'is', null)
    .order('received_at', { ascending: false });

  for (const row of syncedRows || []) {
    seeds.push({
      id: row.id,
      connectionId: row.connection_id,
      messageId: row.message_id,
      subject: row.subject || '',
      status: (row.status || 'pending') as 'pending' | 'acknowledged' | 'replied',
      receivedAt: row.received_at,
      bodyText: row.body_text,
      bodyHtml: row.body_html,
      senderEmail: row.sender_email || '',
      senderName: row.sender_name,
    });
  }

  // Dedupe seeds by thread key (connectionId:messageId or id for webhook)
  const seenKeys = new Set<string>();
  const uniqueSeeds = seeds.filter((s) => {
    const key = s.connectionId && s.messageId ? `${s.connectionId}:${s.messageId}` : s.id;
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });

  const threads: DealEmailThread[] = [];
  const seenThreadKeys = new Set<string>();

  for (const seed of uniqueSeeds) {
    if (seed.connectionId && seed.messageId) {
      const threadData = await fetchThreadForDealEmail(
        seed.connectionId,
        seed.messageId,
        user.id,
        orgId
      );
      if (threadData) {
        const threadKey = threadData.threadId
          ? `${seed.connectionId}:${threadData.threadId}`
          : `${seed.connectionId}:${seed.messageId}`;
        if (seenThreadKeys.has(threadKey)) continue;
        seenThreadKeys.add(threadKey);

        threads.push({
          id: seed.id,
          subject: threadData.subject,
          status: seed.status as 'pending' | 'acknowledged' | 'replied',
          receivedAt: threadData.messages.length > 0
            ? threadData.messages[threadData.messages.length - 1].receivedAt
            : seed.receivedAt,
          messages: threadData.messages,
        });
      } else {
        // Fallback: single message
        const body = htmlToPlainText(seed.bodyText || seed.bodyHtml || '');
        threads.push({
          id: seed.id,
          subject: seed.subject,
          status: seed.status as 'pending' | 'acknowledged' | 'replied',
          receivedAt: seed.receivedAt,
          messages: [{ senderEmail: seed.senderEmail, senderName: seed.senderName || null, bodyText: body, receivedAt: seed.receivedAt, isFromUser: false }],
        });
      }
    } else {
      // Webhook email (no connection_id): try to find OAuth thread to get full conversation including user's reply
      const oauthMatch = await findOAuthThreadBySender(orgId, seed.senderEmail);
      if (oauthMatch) {
        const threadData = await fetchThreadForDealEmail(
          oauthMatch.connectionId,
          oauthMatch.messageId,
          user.id,
          orgId
        );
        if (threadData) {
          const threadKey = threadData.threadId
            ? `${oauthMatch.connectionId}:${threadData.threadId}`
            : `${oauthMatch.connectionId}:${oauthMatch.messageId}`;
          if (!seenThreadKeys.has(threadKey)) {
            seenThreadKeys.add(threadKey);
            threads.push({
              id: seed.id,
              subject: threadData.subject,
              status: seed.status as 'pending' | 'acknowledged' | 'replied',
              receivedAt: threadData.messages.length > 0
                ? threadData.messages[threadData.messages.length - 1].receivedAt
                : seed.receivedAt,
              messages: threadData.messages,
            });
          }
        } else {
          const body = htmlToPlainText(seed.bodyText || seed.bodyHtml || '');
          threads.push({
            id: seed.id,
            subject: seed.subject,
            status: seed.status as 'pending' | 'acknowledged' | 'replied',
            receivedAt: seed.receivedAt,
            messages: [{ senderEmail: seed.senderEmail, senderName: seed.senderName || null, bodyText: body, receivedAt: seed.receivedAt, isFromUser: false }],
          });
        }
      } else {
        const body = htmlToPlainText(seed.bodyText || seed.bodyHtml || '');
        threads.push({
          id: seed.id,
          subject: seed.subject,
          status: seed.status as 'pending' | 'acknowledged' | 'replied',
          receivedAt: seed.receivedAt,
          messages: [{ senderEmail: seed.senderEmail, senderName: seed.senderName || null, bodyText: body, receivedAt: seed.receivedAt, isFromUser: false }],
        });
      }
    }
  }

  // 4. User-initiated: no inbound yet, but we sent first - search OAuth by recipient
  if (threads.length === 0 && deal?.email) {
    const recipientEmail = (deal.email as string).trim().toLowerCase();
    if (recipientEmail) {
      const oauthMatch = await findOAuthThreadByRecipient(orgId, recipientEmail);
      if (oauthMatch) {
        const threadData = await fetchThreadForDealEmail(
          oauthMatch.connectionId,
          oauthMatch.messageId,
          user.id,
          orgId
        );
        if (threadData) {
          const threadKey = threadData.threadId
            ? `${oauthMatch.connectionId}:${threadData.threadId}`
            : `${oauthMatch.connectionId}:${oauthMatch.messageId}`;
          if (!seenThreadKeys.has(threadKey)) {
            seenThreadKeys.add(threadKey);
            threads.push({
              id: `user-initiated:${oauthMatch.connectionId}:${oauthMatch.messageId}`,
              subject: threadData.subject,
              status: 'pending' as const,
              receivedAt: threadData.messages.length > 0
                ? threadData.messages[threadData.messages.length - 1].receivedAt
                : new Date().toISOString(),
              messages: threadData.messages,
            });
          }
        }
      }
    }
  }

  threads.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());

  // Merge threads into one conversation: stack all messages chronologically (for same deal/contact)
  const mergedThreads: DealEmailThread[] = [];
  const seenMessageKeys = new Set<string>();
  const allMessages: Array<ThreadMessage & { subject: string; status: string; threadId: string }> = [];
  for (const t of threads) {
    for (const m of t.messages) {
      const key = `${m.senderEmail}:${m.receivedAt}:${(m.bodyText || '').slice(0, 50)}`;
      if (seenMessageKeys.has(key)) continue;
      seenMessageKeys.add(key);
      allMessages.push({
        ...m,
        subject: t.subject,
        status: t.status,
        threadId: t.id,
      });
    }
  }
  allMessages.sort((a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime());

  if (allMessages.length > 0) {
    const latest = allMessages[allMessages.length - 1];
    mergedThreads.push({
      id: threads[0]?.id ?? 'merged',
      subject: threads[0]?.subject ?? latest.subject,
      status: (latest.status as 'pending' | 'acknowledged' | 'replied') ?? threads[0]?.status ?? 'pending',
      receivedAt: latest.receivedAt,
      messages: allMessages.map(({ subject, status, threadId, ...m }) => m),
    });
  } else {
    mergedThreads.push(...threads);
  }

  return NextResponse.json(
    { threads: mergedThreads.length > 0 ? mergedThreads : threads },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } }
  );
}
