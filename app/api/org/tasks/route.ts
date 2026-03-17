import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export type OrgTask = {
  id: string;
  title: string;
  status: string;
  dueDate: number;
  priority: string;
  associatedDealId?: string;
  associatedDealName?: string;
  assignedTo: string;
  notes?: string;
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
    return NextResponse.json({ error: 'Only organization leaders can view org tasks' }, { status: 403 });
  }

  const { data: members } = await supabase
    .from('organization_members')
    .select('user_id')
    .eq('organization_id', myMembership.organization_id);

  const userIds = (members || []).map((m) => m.user_id);
  if (userIds.length === 0) {
    return NextResponse.json({ tasks: [], members: [] });
  }

  const admin = createAdminClient();

  const { data: tasksRows, error: tasksError } = await admin
    .from('tasks')
    .select('*')
    .in('user_id', userIds)
    .order('created_at', { ascending: false });

  if (tasksError) {
    return NextResponse.json({ error: tasksError.message }, { status: 500 });
  }

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, email, full_name')
    .in('id', userIds);

  const profileMap = new Map(
    (profiles || []).map((p: { id: string; email?: string; full_name?: string }) => [p.id, p])
  );

  const tasks: OrgTask[] = (tasksRows || []).map((row) => {
    const p = profileMap.get(row.user_id);
    return {
      id: row.id,
      title: row.title,
      status: row.status,
      dueDate: Number(row.due_date),
      priority: row.priority,
      associatedDealId: row.associated_deal_id || undefined,
      associatedDealName: row.associated_deal_name || undefined,
      assignedTo: row.assigned_to || '',
      notes: row.notes || undefined,
      userId: row.user_id,
      memberEmail: p?.email ?? null,
      memberName: p?.full_name ?? null,
    };
  });

  const membersWithProfiles = userIds.map((uid) => {
    const p = profileMap.get(uid);
    return {
      userId: uid,
      email: p?.email ?? null,
      fullName: p?.full_name ?? null,
    };
  });

  return NextResponse.json({
    tasks,
    members: membersWithProfiles,
  });
}
