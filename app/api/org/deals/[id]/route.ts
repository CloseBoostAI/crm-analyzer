import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';

export type DealDetail = {
  id: string;
  name: string;
  company: string;
  stage: string;
  owner: string;
  contact: string;
  amount: number;
  priority: string;
  contactId: string;
  notes: string;
  closeDate: string;
  email: string;
  lastActivity: string;
  userId: string;
  memberEmail: string | null;
  memberName: string | null;
  createdAt: string;
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
  const { searchParams } = new URL(_request.url);
  const userIdParam = searchParams.get('userId');

  const { data: myMembership } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .single();

  const isLeader = myMembership && (myMembership.role === 'owner' || myMembership.role === 'admin');

  let targetUserId: string;

  if (userIdParam && isLeader) {
    // Org leader viewing another member's deal - verify member is in same org
    const { data: members } = await supabase
      .from('organization_members')
      .select('user_id')
      .eq('organization_id', myMembership!.organization_id);

    const userIds = (members || []).map((m) => m.user_id);
    if (!userIds.includes(userIdParam)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    targetUserId = userIdParam;
  } else {
    // Viewing own deal
    targetUserId = user.id;
  }

  const admin = createAdminClient();

  const { data: row, error } = await admin
    .from('deals')
    .select('*')
    .eq('id', dealId)
    .eq('user_id', targetUserId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!row) {
    return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('email, full_name')
    .eq('id', targetUserId)
    .maybeSingle();

  const deal: DealDetail = {
    id: row.id,
    name: row.name,
    company: row.company || '',
    stage: row.stage,
    owner: row.owner,
    contact: row.contact,
    amount: Number(row.amount),
    priority: row.priority,
    contactId: row.contact_id || '',
    notes: row.notes || '',
    closeDate: row.close_date || '',
    email: row.email || '',
    lastActivity: row.last_activity || '',
    userId: row.user_id,
    memberEmail: profile?.email ?? null,
    memberName: profile?.full_name ?? null,
    createdAt: row.created_at,
  };

  return NextResponse.json(deal);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: dealId } = await params;
  const { searchParams } = new URL(request.url);
  const userIdParam = searchParams.get('userId');

  const { data: myMembership } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .single();

  const isLeader = myMembership && (myMembership.role === 'owner' || myMembership.role === 'admin');

  let targetUserId: string;

  if (userIdParam && isLeader) {
    const { data: members } = await supabase
      .from('organization_members')
      .select('user_id')
      .eq('organization_id', myMembership!.organization_id);

    const userIds = (members || []).map((m) => m.user_id);
    if (!userIds.includes(userIdParam)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    targetUserId = userIdParam;
  } else {
    targetUserId = user.id;
  }

  let body: { notes?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (typeof body.notes !== 'string') {
    return NextResponse.json({ error: 'notes is required' }, { status: 400 });
  }

  const admin = createAdminClient();

  const { error } = await admin
    .from('deals')
    .update({
      notes: body.notes,
      last_activity: new Date().toISOString(),
    })
    .eq('id', dealId)
    .eq('user_id', targetUserId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
