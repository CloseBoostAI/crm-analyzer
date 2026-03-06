import { createClient } from '@/lib/supabase/server';
import { createAdminClient, isAdminEmail } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const admin = createAdminClient();

  const { data: members, error } = await admin
    .from('organization_members')
    .select('id, user_id, role, created_at')
    .eq('organization_id', id)
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const membersWithExtras = (members || []).map((m) => ({
    ...m,
    email: null as string | null,
    fullName: null as string | null,
  }));

  const userIds = membersWithExtras.map((m) => m.user_id);
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, email, full_name')
    .in('id', userIds);

  const profileMap = new Map((profiles || []).map((p: { id: string; email?: string; full_name?: string }) => [p.id, p]));

  const { data: usersData } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const authUserMap = new Map(
    (usersData?.users || []).map((u) => [u.id, { email: u.email ?? null, fullName: u.user_metadata?.full_name ?? null }])
  );

  membersWithExtras.forEach((m) => {
    const p = profileMap.get(m.user_id);
    const authUser = authUserMap.get(m.user_id);
    m.email = (p?.email ?? authUser?.email ?? null) || null;
    m.fullName = (p?.full_name ?? authUser?.fullName ?? null) || null;
  });

  return NextResponse.json({ members: membersWithExtras });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: orgId } = await params;
  const body = await request.json();
  const email = (body.email || '').toString().trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: 'Email required' }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: org } = await admin
    .from('organizations')
    .select('id, seat_limit')
    .eq('id', orgId)
    .single();

  if (!org) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  }

  const { count } = await admin
    .from('organization_members')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', orgId);

  if (count !== null && count >= (org.seat_limit ?? 1)) {
    return NextResponse.json({ error: 'Seat limit reached. Upgrade the org to add more members.' }, { status: 403 });
  }

  const { data: usersData } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const targetUser = usersData?.users?.find((u) => u.email?.toLowerCase() === email);

  if (targetUser) {
    const { error: memberError } = await admin
      .from('organization_members')
      .upsert(
        { organization_id: orgId, user_id: targetUser.id, role: 'member' },
        { onConflict: 'organization_id,user_id' }
      );

    if (memberError) {
      return NextResponse.json({ error: memberError.message }, { status: 500 });
    }

    return NextResponse.json({
      added: true,
      inviteLink: null,
      message: `${email} was added to the organization.`,
    });
  }

  const token = randomBytes(32).toString('hex');
  const { error: inviteError } = await admin
    .from('pending_invites')
    .insert({
      organization_id: orgId,
      email,
      token,
      role: 'member',
    });

  if (inviteError) {
    return NextResponse.json({ error: inviteError.message }, { status: 500 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
    || request.headers.get('origin')
    || 'http://localhost:3000';
  const inviteLink = `${baseUrl}/invite/accept?token=${token}`;

  return NextResponse.json({
    added: false,
    inviteLink,
    message: `${email} doesn't have an account yet. Share the invite link with them to sign up and join.`,
  });
}
