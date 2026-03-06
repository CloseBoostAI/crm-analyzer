import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { email } = await request.json();
  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'Email required' }, { status: 400 });
  }

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .single();

  const role = membership?.role?.toLowerCase?.();
  if (!membership || !['owner', 'admin'].includes(role)) {
    return NextResponse.json({ error: 'Only owners and admins can invite' }, { status: 403 });
  }

  const { data: org } = await supabase
    .from('organizations')
    .select('seat_limit')
    .eq('id', membership.organization_id)
    .single();

  const { count } = await supabase
    .from('organization_members')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', membership.organization_id);

  if (count !== null && count >= (org?.seat_limit ?? 1)) {
    return NextResponse.json({ error: 'Seat limit reached. Upgrade your plan to add more members.' }, { status: 403 });
  }

  const token = randomBytes(32).toString('hex');

  const { error: insertError } = await supabase
    .from('pending_invites')
    .insert({
      organization_id: membership.organization_id,
      email: email.toLowerCase().trim(),
      token,
      invited_by: user.id,
    });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.headers.get('origin') || 'http://localhost:3000';
  const inviteLink = `${baseUrl}/invite/accept?token=${token}`;

  return NextResponse.json({ inviteLink, token });
}
