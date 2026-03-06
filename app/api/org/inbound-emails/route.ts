import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

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
  const status = searchParams.get('status');
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);

  let query = supabase
    .from('inbound_emails')
    .select('id, sender_email, sender_name, to_email, subject, body_text, body_html, deal_id, deal_name, status, received_at')
    .eq('organization_id', myMembership.organization_id)
    .order('received_at', { ascending: false })
    .limit(limit);

  if (status && ['pending', 'acknowledged', 'replied'].includes(status)) {
    query = query.eq('status', status);
  }

  const { data: rows, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const emails: InboundEmail[] = (rows || []).map((row) => ({
    id: row.id,
    senderEmail: row.sender_email || '',
    senderName: row.sender_name,
    toEmail: row.to_email || '',
    subject: row.subject || '',
    bodyText: row.body_text,
    bodyHtml: row.body_html,
    dealId: row.deal_id,
    dealName: row.deal_name,
    status: row.status || 'pending',
    receivedAt: row.received_at,
  }));

  return NextResponse.json({ emails });
}
