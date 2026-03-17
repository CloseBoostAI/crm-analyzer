import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export type OrgDeal = {
  id: string;
  name: string;
  company: string;
  stage: string;
  owner: string;
  contact: string;
  amount: number;
  contactId: string;
  notes: string;
  closeDate: string;
  email: string;
  lastActivity: string;
  userId: string;
  memberEmail: string | null;
  memberName: string | null;
};

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
    return NextResponse.json({ error: 'Not in an organization' }, { status: 403 });
  }

  const isLeader = myMembership.role === 'owner' || myMembership.role === 'admin';
  if (!isLeader) {
    return NextResponse.json({ error: 'Only organization leaders can view org deals' }, { status: 403 });
  }

  const { data: members } = await supabase
    .from('organization_members')
    .select('user_id')
    .eq('organization_id', myMembership.organization_id);

  const userIds = (members || []).map((m) => m.user_id);
  if (userIds.length === 0) {
    return NextResponse.json({ deals: [], org: null, members: [] });
  }

  const admin = createAdminClient();

  const { data: dealsRows, error: dealsError } = await admin
    .from('deals')
    .select('*')
    .in('user_id', userIds)
    .order('created_at', { ascending: false });

  if (dealsError) {
    return NextResponse.json({ error: dealsError.message }, { status: 500 });
  }

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, email, full_name')
    .in('id', userIds);

  const profileMap = new Map(
    (profiles || []).map((p: { id: string; email?: string; full_name?: string }) => [p.id, p])
  );

  const deals: OrgDeal[] = (dealsRows || []).map((row) => {
    const p = profileMap.get(row.user_id);
    return {
      id: row.id,
      name: row.name,
      company: row.company || '',
      stage: row.stage,
      owner: row.owner,
      contact: row.contact,
      amount: Number(row.amount),
      contactId: row.contact_id || '',
      notes: row.notes || '',
      closeDate: row.close_date || '',
      email: row.email || '',
      lastActivity: row.last_activity || '',
      userId: row.user_id,
      memberEmail: p?.email ?? null,
      memberName: p?.full_name ?? null,
    };
  });

  const { data: org } = await admin
    .from('organizations')
    .select('id, name')
    .eq('id', myMembership.organization_id)
    .single();

  const membersWithProfiles = userIds.map((uid) => {
    const p = profileMap.get(uid);
    return {
      userId: uid,
      email: p?.email ?? null,
      fullName: p?.full_name ?? null,
    };
  });

  return NextResponse.json({
    deals,
    org: org ? { id: org.id, name: org.name } : null,
    members: membersWithProfiles,
  });
}
