import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { fetchEmailsForOrg } from '@/lib/email/fetch';

export type DealEmail = {
  id: string;
  senderEmail: string;
  senderName: string | null;
  toEmail: string;
  subject: string;
  bodyText: string | null;
  bodyHtml: string | null;
  status: 'pending' | 'acknowledged' | 'replied';
  receivedAt: string;
};

/** GET /api/org/deals/[id]/emails - Fetch email exchanges for a deal */
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

  // Verify deal exists and user has access (deal owner or org member)
  const { data: deal } = await admin
    .from('deals')
    .select('id, user_id')
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

  // 1. Webhook emails: inbound_emails with deal_id = dealId
  const { data: webhookRows } = await admin
    .from('inbound_emails')
    .select('id, sender_email, sender_name, to_email, subject, body_text, body_html, status, received_at')
    .eq('organization_id', orgId)
    .eq('deal_id', dealId)
    .order('received_at', { ascending: false });

  const webhookEmails: DealEmail[] = (webhookRows || []).map((row) => ({
    id: row.id,
    senderEmail: row.sender_email || '',
    senderName: row.sender_name,
    toEmail: row.to_email || '',
    subject: row.subject || '',
    bodyText: row.body_text,
    bodyHtml: row.body_html,
    status: (row.status || 'pending') as 'pending' | 'acknowledged' | 'replied',
    receivedAt: row.received_at,
  }));

  // 2. OAuth emails: fetch org emails and filter by dealId
  const oauthEmails = await fetchEmailsForOrg(orgId, undefined, 100);
  const oauthForDeal = oauthEmails
    .filter((e) => e.dealId === dealId)
    .map((e): DealEmail => ({
      id: e.id,
      senderEmail: e.senderEmail,
      senderName: e.senderName,
      toEmail: e.toEmail,
      subject: e.subject,
      bodyText: e.bodyText,
      bodyHtml: e.bodyHtml,
      status: e.status,
      receivedAt: e.receivedAt,
    }));

  // 3. Synced OAuth emails in inbound_emails (connection_id + message_id set)
  const { data: syncedRows } = await admin
    .from('inbound_emails')
    .select('id, sender_email, sender_name, to_email, subject, body_text, body_html, status, received_at')
    .eq('organization_id', orgId)
    .eq('deal_id', dealId)
    .not('connection_id', 'is', null)
    .order('received_at', { ascending: false });

  const syncedEmails: DealEmail[] = (syncedRows || []).map((row) => ({
    id: row.id,
    senderEmail: row.sender_email || '',
    senderName: row.sender_name,
    toEmail: row.to_email || '',
    subject: row.subject || '',
    bodyText: row.body_text,
    bodyHtml: row.body_html,
    status: (row.status || 'pending') as 'pending' | 'acknowledged' | 'replied',
    receivedAt: row.received_at,
  }));

  // Dedupe by id (OAuth ids are connectionId:messageId, synced use UUID)
  const seen = new Set<string>();
  const combined = [...webhookEmails, ...oauthForDeal, ...syncedEmails]
    .filter((e) => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    })
    .sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());

  return NextResponse.json(
    { emails: combined },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } }
  );
}
