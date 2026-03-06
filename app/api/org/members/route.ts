import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
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
    return NextResponse.json({ members: [], myRole: null, org: null });
  }

  const { data: org } = await supabase
    .from('organizations')
    .select('id, name, seat_limit')
    .eq('id', myMembership.organization_id)
    .single();

  const { data: members, error } = await supabase
    .from('organization_members')
    .select(`
      id,
      user_id,
      role,
      created_at
    `)
    .eq('organization_id', myMembership.organization_id)
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const membersWithExtras = (members || []).map((m) => ({
    ...m,
    email: null as string | null,
    fullName: null as string | null,
  }));

  try {
    const userIds = membersWithExtras.map((m) => m.user_id);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email, full_name')
      .in('id', userIds);

    const profileMap = new Map((profiles || []).map((p: { id: string; email?: string; full_name?: string }) => [p.id, p]));
    membersWithExtras.forEach((m) => {
      const p = profileMap.get(m.user_id);
      if (p) {
        m.email = p.email ?? null;
        m.fullName = p.full_name ?? null;
      }
    });
  } catch {
    // profiles table may not exist yet
  }

  const memberCount = membersWithExtras.length;
  return NextResponse.json({
    members: membersWithExtras,
    myRole: myMembership.role,
    org: org ? { ...org, memberCount } : null,
  });
}
