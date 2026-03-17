import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { userId } = await params;
  if (!userId) {
    return NextResponse.json({ error: 'User ID required' }, { status: 400 });
  }

  if (userId === user.id) {
    return NextResponse.json({ error: 'Cannot remove yourself' }, { status: 400 });
  }

  // Prefer org from query when provided (ensures correct org when user is in multiple)
  const { searchParams } = new URL(request.url);
  const orgIdFromQuery = searchParams.get('orgId');

  let myMembership: { organization_id: string; role: string } | null = null;

  if (orgIdFromQuery) {
    const { data } = await supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .eq('organization_id', orgIdFromQuery)
      .single();
    myMembership = data;
    if (!myMembership) {
      return NextResponse.json({ error: 'Not a member of this organization' }, { status: 403 });
    }
  }

  if (!myMembership) {
    const { data } = await supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .order('role', { ascending: false }) // owner before admin before member
      .limit(1)
      .single();
    myMembership = data;
  }

  const role = myMembership.role?.toLowerCase?.();
  if (!myMembership || !['owner', 'admin'].includes(role ?? '')) {
    return NextResponse.json({ error: 'Only owners and admins can remove members' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: targetMember } = await admin
    .from('organization_members')
    .select('role')
    .eq('organization_id', myMembership.organization_id)
    .eq('user_id', userId)
    .single();

  if (!targetMember) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 });
  }

  if (targetMember.role === 'owner') {
    return NextResponse.json({ error: 'Cannot remove owner from organization' }, { status: 400 });
  }

  const { error } = await admin
    .from('organization_members')
    .delete()
    .eq('organization_id', myMembership.organization_id)
    .eq('user_id', userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
