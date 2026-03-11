import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import {
  findAllOAuthThreadsWithContact,
  fetchThreadForDealEmail,
} from '@/lib/email/fetch';
import { extractReplyBody, htmlToPlainText } from '@/lib/utils';

export type ActivityMessage = {
  senderEmail: string;
  senderName: string | null;
  bodyText: string;
  receivedAt: string;
  isFromUser: boolean;
};

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
    .select('organization_id')
    .eq('user_id', user.id)
    .limit(1)
    .single();

  if (!myMembership) {
    return NextResponse.json({ error: 'Not in an organization' }, { status: 403 });
  }

  const organizationId = myMembership.organization_id;

  const admin = createAdminClient();

  const { data: members } = await admin
    .from('organization_members')
    .select('user_id')
    .eq('organization_id', organizationId);
  const userIds = (members || []).map((m: { user_id: string }) => m.user_id);
  if (userIds.length === 0) {
    return NextResponse.json({ messages: [] });
  }

  const { data: deal, error: dealError } = await admin
    .from('deals')
    .select('id, email, user_id')
    .eq('id', dealId)
    .in('user_id', userIds)
    .maybeSingle();

  if (dealError || !deal) {
    return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
  }

  const contactEmail = (deal.email || '').trim();
  if (!contactEmail) {
    return NextResponse.json({ messages: [] });
  }

  const allMessages: ActivityMessage[] = [];
  const seenKeys = new Set<string>();

  const oauthThreads = await findAllOAuthThreadsWithContact(organizationId, contactEmail);

  for (const oauthThread of oauthThreads) {
    const thread = await fetchThreadForDealEmail(
      oauthThread.connectionId,
      oauthThread.messageId,
      user.id,
      organizationId
    );
    if (thread) {
      for (const m of thread.messages) {
        const raw = m.bodyText || '';
        const stripped = extractReplyBody(raw);
        const displayText = stripped.trim() || raw.trim().slice(0, 500);
        if (displayText) {
          const dedupeKey = `${m.receivedAt}|${(m.senderEmail || '').toLowerCase()}|${displayText.slice(0, 80)}`;
          if (seenKeys.has(dedupeKey)) continue;
          seenKeys.add(dedupeKey);

          allMessages.push({
            senderEmail: m.senderEmail,
            senderName: m.senderName,
            bodyText: displayText,
            receivedAt: m.receivedAt,
            isFromUser: m.isFromUser,
          });
        }
      }
    }
  }

  const { data: webhookRows } = await admin
    .from('inbound_emails')
    .select('sender_email, sender_name, body_text, body_html, received_at')
    .eq('organization_id', organizationId)
    .eq('deal_id', dealId)
    .is('connection_id', null)
    .is('message_id', null)
    .order('received_at', { ascending: true });

  for (const row of webhookRows || []) {
    const rawBody = row.body_text || htmlToPlainText(row.body_html || '') || '';
    const stripped = extractReplyBody(rawBody);
    const displayText = stripped.trim() || rawBody.trim().slice(0, 500);
    if (displayText) {
      allMessages.push({
        senderEmail: row.sender_email || '',
        senderName: row.sender_name,
        bodyText: displayText,
        receivedAt: row.received_at,
        isFromUser: false,
      });
    }
  }

  allMessages.sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));

  return NextResponse.json(
    { messages: allMessages },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } }
  );
}
