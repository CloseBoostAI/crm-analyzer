import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: existing } = await supabase
    .from('organization_members')
    .select('id')
    .eq('user_id', user.id)
    .limit(1)
    .single();

  if (existing) {
    return NextResponse.json({ message: 'Already in an organization' });
  }

  const body = await request.json().catch(() => ({}));
  const inviteToken = body.inviteToken as string | undefined;
  const fullName = (body.fullName ?? body.full_name ?? user.user_metadata?.full_name ?? '').toString().trim();

  if (inviteToken) {
    const { data: orgId, error } = await supabase.rpc('accept_invite', {
      invite_token: inviteToken,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    await supabase.from('profiles').upsert(
      { id: user.id, email: user.email ?? '', full_name: fullName || undefined, updated_at: new Date().toISOString() },
      { onConflict: 'id' }
    );
    return NextResponse.json({ organizationId: orgId });
  }

  const orgName = body.orgName as string | undefined;
  const { data: orgId, error } = await supabase.rpc('create_organization', {
    org_name: orgName || 'My Organization',
  });

  if (error) {
    console.error('create_organization error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase.from('profiles').upsert(
    { id: user.id, email: user.email ?? '', full_name: fullName || undefined, updated_at: new Date().toISOString() },
    { onConflict: 'id' }
  );

  return NextResponse.json({ organizationId: orgId });
}
