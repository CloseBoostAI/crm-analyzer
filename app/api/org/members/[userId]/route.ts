import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function DELETE(
  _request: Request,
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

  const { data: myMembership } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .single();

  const role = myMembership.role?.toLowerCase?.();
  if (!myMembership || !['owner', 'admin'].includes(role ?? '')) {
    return NextResponse.json({ error: 'Only owners and admins can remove members' }, { status: 403 });
  }

  const { error } = await supabase
    .from('organization_members')
    .delete()
    .eq('organization_id', myMembership.organization_id)
    .eq('user_id', userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
