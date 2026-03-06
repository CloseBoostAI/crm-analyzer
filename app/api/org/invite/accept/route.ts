import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { token } = await request.json();
  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'Token required' }, { status: 400 });
  }

  const { data: orgId, error } = await supabase.rpc('accept_invite', {
    invite_token: token,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const fullName = (user.user_metadata?.full_name ?? '').toString().trim() || undefined;
  await supabase.from('profiles').upsert(
    { id: user.id, email: user.email ?? '', full_name: fullName, updated_at: new Date().toISOString() },
    { onConflict: 'id' }
  );

  return NextResponse.json({ organizationId: orgId });
}
