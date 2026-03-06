import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Extract email address from "Name <email@domain.com>" or "email@domain.com"
 */
function extractEmail(addr: string | null): string {
  if (!addr || typeof addr !== 'string') return '';
  const match = addr.match(/<([^>]+)>/);
  return (match ? match[1] : addr).trim().toLowerCase();
}

/**
 * Inbound email webhook - receives emails from SendGrid Inbound Parse or Mailgun.
 * Configure your provider to POST to: https://yourdomain.com/api/webhooks/inbound-email
 *
 * SendGrid: multipart/form-data with from, to, subject, text, html
 * Mailgun: multipart/form-data with similar fields
 */
export async function POST(request: Request) {
  try {
    const contentType = request.headers.get('content-type') || '';
    let from = '';
    let to = '';
    let subject = '';
    let bodyText = '';
    let bodyHtml = '';

    let fromRaw = '';
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      fromRaw = (formData.get('from') || formData.get('sender') || '').toString();
      from = extractEmail(fromRaw);
      to = extractEmail((formData.get('to') || formData.get('recipient') || '').toString());
      subject = (formData.get('subject') || '').toString().trim();
      bodyText = (formData.get('text') || formData.get('body-plain') || '').toString().trim();
      bodyHtml = (formData.get('html') || formData.get('body-html') || '').toString().trim();
    } else if (contentType.includes('application/json')) {
      const body = await request.json();
      const envelope = body.envelope || body;
      fromRaw = envelope.from || body.sender || '';
      from = extractEmail(fromRaw);
      to = extractEmail(body.recipient || envelope.to?.[0] || '');
      subject = (body.subject || '').toString().trim();
      bodyText = (body['body-plain'] || body.text || '').toString().trim();
      bodyHtml = (body['body-html'] || body.html || '').toString().trim();
    } else {
      return NextResponse.json({ error: 'Unsupported content type' }, { status: 400 });
    }

    if (!from || !to) {
      return NextResponse.json({ error: 'Missing from or to' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Find organization by inbound email (to address) - exact match, case-insensitive
    const { data: orgs } = await admin
      .from('organizations')
      .select('id, inbound_email')
      .not('inbound_email', 'is', null);

    const matchingOrg = (orgs || []).find(
      (o: { inbound_email?: string | null }) => o.inbound_email?.toLowerCase() === to
    );

    let orgId: string;
    if (matchingOrg) {
      orgId = matchingOrg.id;
    } else {
      // Fallback: use first org if no inbound_email matches (single-tenant)
      const { data: defaultOrg } = await admin
        .from('organizations')
        .select('id')
        .limit(1)
        .single();

      if (!defaultOrg) {
        console.error('[inbound-email] No organization found for to:', to);
        return NextResponse.json({ error: 'No organization configured' }, { status: 200 });
      }
      orgId = defaultOrg.id;
    }

    await insertInboundEmail(admin, orgId, from, fromRaw, to, subject, bodyText, bodyHtml);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[inbound-email] Error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

async function insertInboundEmail(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  senderEmail: string,
  fromRaw: string,
  toEmail: string,
  subject: string,
  bodyText: string,
  bodyHtml: string
) {
  // Extract sender name from "Name <email>" if present
  let senderName = '';
  const match = fromRaw.match(/^([^<]+)</);
  if (match) senderName = match[1].trim();

  // Match sender to deal/customer in this org
  const { data: members } = await admin
    .from('organization_members')
    .select('user_id')
    .eq('organization_id', orgId);

  const userIds = (members || []).map((m) => m.user_id);
  let dealId: string | null = null;
  let dealName: string | null = null;

  if (userIds.length > 0) {
    const { data: deal } = await admin
      .from('deals')
      .select('id, name')
      .in('user_id', userIds)
      .ilike('email', senderEmail)
      .limit(1)
      .single();

    if (deal) {
      dealId = deal.id;
      dealName = deal.name || null;
    }
  }

  const { error } = await admin.from('inbound_emails').insert({
    organization_id: orgId,
    sender_email: senderEmail,
    sender_name: senderName || null,
    to_email: toEmail,
    subject: subject || '(no subject)',
    body_text: bodyText || null,
    body_html: bodyHtml || null,
    deal_id: dealId,
    deal_name: dealName,
    status: 'pending',
  });

  if (error) throw error;
}
