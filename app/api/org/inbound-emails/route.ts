import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { fetchEmailsForOrg } from '@/lib/email/fetch';

export type InboundEmail = {
  id: string;
  senderEmail: string;
  senderName: string | null;
  toEmail: string;
  subject: string;
  bodyText: string | null;
  bodyHtml: string | null;
  dealId: string | null;
  dealName: string | null;
  status: 'pending' | 'acknowledged' | 'replied';
  receivedAt: string;
};

export async function GET(request: Request) {
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

  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get('status');
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
  const statusFilter = statusParam && ['pending', 'acknowledged', 'replied'].includes(statusParam)
    ? (statusParam as 'pending' | 'acknowledged' | 'replied')
    : undefined;

  const orgId = myMembership.organization_id;

  // 1. Fetch OAuth emails on demand (no storage)
  const oauthEmails = await fetchEmailsForOrg(orgId, statusFilter, limit);

  // 2. Fetch webhook emails from DB (connection_id is null AND message_id is null)
  // Exclude orphaned OAuth emails: when user disconnects Gmail, connection_id becomes null via FK,
  // but message_id stays set - those are old synced emails, not webhook
  let query = supabase
    .from('inbound_emails')
    .select('id, sender_email, sender_name, to_email, subject, body_text, body_html, deal_id, deal_name, status, received_at')
    .eq('organization_id', orgId)
    .is('connection_id', null)
    .is('message_id', null)
    .order('received_at', { ascending: false })
    .limit(limit);

  if (statusFilter) {
    query = query.eq('status', statusFilter);
  }

  const { data: webhookRows, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const webhookEmails: InboundEmail[] = (webhookRows || []).map((row) => ({
    id: row.id,
    senderEmail: row.sender_email || '',
    senderName: row.sender_name,
    toEmail: row.to_email || '',
    subject: row.subject || '',
    bodyText: row.body_text,
    bodyHtml: row.body_html,
    dealId: row.deal_id,
    dealName: row.deal_name,
    status: (row.status || 'pending') as 'pending' | 'acknowledged' | 'replied',
    receivedAt: row.received_at,
  }));

  // 3. Combine and sort by received_at desc
  const oauthAsInbound: InboundEmail[] = oauthEmails.map((e) => ({
    id: e.id,
    senderEmail: e.senderEmail,
    senderName: e.senderName,
    toEmail: e.toEmail,
    subject: e.subject,
    bodyText: e.bodyText,
    bodyHtml: e.bodyHtml,
    dealId: e.dealId,
    dealName: e.dealName,
    status: e.status,
    receivedAt: e.receivedAt,
  }));

  const combined = [...oauthAsInbound, ...webhookEmails].sort(
    (a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
  );

  return NextResponse.json(
    { emails: combined.slice(0, limit) },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } }
  );
}
