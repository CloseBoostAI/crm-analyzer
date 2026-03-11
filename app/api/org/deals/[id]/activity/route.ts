import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { extractReplyBody, htmlToPlainText } from '@/lib/utils';

export type ActivityItem = {
  id: string;
  receivedAt: string;
  senderName: string | null;
  senderEmail: string;
  subject: string;
  bodyText: string | null;
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
    return NextResponse.json({ items: [] });
  }

  const { data: deal, error: dealError } = await admin
    .from('deals')
    .select('id, email')
    .eq('id', dealId)
    .in('user_id', userIds)
    .maybeSingle();

  if (dealError || !deal) {
    return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
  }

  const { data: rows } = await admin
    .from('inbound_emails')
    .select('id, sender_email, sender_name, subject, body_text, body_html, received_at')
    .eq('organization_id', organizationId)
    .eq('deal_id', dealId)
    .order('received_at', { ascending: true });

  const { data: conns } = await admin
    .from('email_connections')
    .select('email')
    .in('user_id', userIds);
  const orgEmails = new Set(
    (conns || []).map((c: { email?: string }) => (c.email || '').toLowerCase()).filter(Boolean)
  );

  const items: ActivityItem[] = (rows || []).map((row) => {
    const rawBody = row.body_text || htmlToPlainText(row.body_html || '') || '';
    const stripped = extractReplyBody(rawBody);
    const bodyText = stripped.trim() || rawBody.trim().slice(0, 500) || null;
    const senderLower = (row.sender_email || '').toLowerCase();
    const isFromUser = orgEmails.has(senderLower);

    return {
      id: row.id,
      receivedAt: row.received_at,
      senderName: row.sender_name,
      senderEmail: row.sender_email || '',
      subject: row.subject || '(no subject)',
      bodyText,
      isFromUser,
    };
  });

  return NextResponse.json(
    { items },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } }
  );
}
