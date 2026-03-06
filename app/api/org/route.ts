import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: membership } = await supabase
    .from('organization_members')
    .select(`
      id,
      role,
      organization:organizations (
        id,
        name,
        seat_limit,
        inbound_email,
        created_at
      )
    `)
    .eq('user_id', user.id)
    .order('role', { ascending: false })
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ org: null, membership: null });
  }

  let org = (membership as any).organization;
  if (Array.isArray(org)) org = org[0] ?? null;
  const memberCount = await supabase
    .from('organization_members')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', org?.id);

  return NextResponse.json({
    org: org ? { ...org, memberCount: memberCount.count ?? 0, inboundEmail: org.inbound_email ?? null } : null,
    membership: { role: membership.role },
  });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .order('role', { ascending: false })
    .limit(1)
    .single();

  if (!membership || membership.role !== 'owner') {
    return NextResponse.json({ error: 'Only org owners can update settings' }, { status: 403 });
  }

  const body = await request.json();
  const { inboundEmail } = body;

  if (inboundEmail !== undefined) {
    const value = typeof inboundEmail === 'string' ? inboundEmail.trim().toLowerCase() || null : null;
    const { error } = await supabase
      .from('organizations')
      .update({ inbound_email: value })
      .eq('id', membership.organization_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
