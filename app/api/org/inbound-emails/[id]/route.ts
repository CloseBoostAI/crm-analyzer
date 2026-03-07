import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { parseOauthEmailId } from '@/lib/email/fetch';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: myMembership } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .single();

  if (!myMembership) {
    return NextResponse.json({ error: 'Not in an organization' }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const { status } = body;

  if (!status || !['pending', 'acknowledged', 'replied'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  // OAuth email: id is "connectionId:messageId"
  const oauth = parseOauthEmailId(id);
  if (oauth) {
    const { data: conn } = await supabase
      .from('email_connections')
      .select('id, user_id, organization_id')
      .eq('id', oauth.connectionId)
      .single();

    if (!conn) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
    }

    // Allow if org matches, or connection has no org but connection's user is in our org
    const orgMatches = conn.organization_id === myMembership.organization_id;
    let allowed = orgMatches;
    if (!allowed && !conn.organization_id) {
      const { data: member } = await supabase
        .from('organization_members')
        .select('user_id')
        .eq('organization_id', myMembership.organization_id)
        .eq('user_id', conn.user_id)
        .single();
      allowed = !!member;
    }
    if (!allowed) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const { error } = await supabase
      .from('email_status')
      .upsert(
        {
          connection_id: oauth.connectionId,
          message_id: oauth.messageId,
          status,
          organization_id: myMembership.organization_id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'connection_id,message_id' }
      );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, status });
  }

  // Webhook email: id is UUID (from inbound_emails)
  const { data: existing } = await supabase
    .from('inbound_emails')
    .select('id')
    .eq('id', id)
    .eq('organization_id', myMembership.organization_id)
    .single();

  if (!existing) {
    return NextResponse.json(
      { error: 'Email not found. It may have been removed—try refreshing the inbox.' },
      { status: 404 }
    );
  }

  const { error } = await supabase
    .from('inbound_emails')
    .update({ status })
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, status });
}

/** Fully remove email: delete from DB if webhook, or add to dismissals if OAuth */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id } = await params;
  const oauth = parseOauthEmailId(id);

  if (oauth) {
    // OAuth email: add to dismissals (can't delete from Gmail)
    const { error } = await supabase
      .from('email_dismissals')
      .upsert(
        { user_id: user.id, email_id: id },
        { onConflict: 'user_id,email_id' }
      );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    // Webhook email (UUID): fully delete from inbound_emails
    const admin = createAdminClient();
    const { data: existing } = await admin
      .from('inbound_emails')
      .select('id')
      .eq('id', id)
      .eq('organization_id', myMembership.organization_id)
      .single();
    if (existing) {
      await admin.from('inbound_emails').delete().eq('id', id);
    }
    // Also add to dismissals in case it was cached or reappears
    await supabase
      .from('email_dismissals')
      .upsert(
        { user_id: user.id, email_id: id },
        { onConflict: 'user_id,email_id' }
      );
  }

  return NextResponse.json({ ok: true });
}
