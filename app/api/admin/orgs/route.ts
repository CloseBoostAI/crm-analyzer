import { createClient } from '@/lib/supabase/server';
import { createAdminClient, isAdminEmail } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: orgs, error } = await admin
    .from('organizations')
    .select('id, name, seat_limit, created_at, created_by')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const memberCounts = await Promise.all(
    (orgs || []).map(async (org) => {
      const { count } = await admin
        .from('organization_members')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', org.id);
      return { orgId: org.id, count: count ?? 0 };
    })
  );

  const countMap = Object.fromEntries(memberCounts.map((m) => [m.orgId, m.count]));

  const result = (orgs || []).map((org) => ({
    id: org.id,
    name: org.name,
    seatLimit: org.seat_limit,
    memberCount: countMap[org.id] ?? 0,
    createdAt: org.created_at,
    createdBy: org.created_by,
  }));

  return NextResponse.json({ orgs: result });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const orgName = (body.name || body.orgName || '').toString().trim();
  const seatLimit = typeof body.seatLimit === 'number' ? body.seatLimit : parseInt(String(body.seatLimit || 1), 10);
  const leaderEmail = (body.leaderEmail || body.leader_email || '').toString().trim().toLowerCase();

  if (!orgName) {
    return NextResponse.json({ error: 'Organization name is required' }, { status: 400 });
  }
  if (!leaderEmail) {
    return NextResponse.json({ error: 'Leader email is required' }, { status: 400 });
  }
  if (seatLimit < 1) {
    return NextResponse.json({ error: 'Seat limit must be at least 1' }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: newOrg, error: orgError } = await admin
    .from('organizations')
    .insert({ name: orgName, seat_limit: seatLimit })
    .select('id')
    .single();

  if (orgError || !newOrg) {
    const msg = orgError?.message || 'Failed to create organization';
    if (msg.toLowerCase().includes('invalid') && msg.toLowerCase().includes('key')) {
      return NextResponse.json({
        error: 'Invalid SUPABASE_SERVICE_ROLE_KEY. Get the correct key from Supabase Dashboard → Project Settings → API → service_role (the secret key, not anon). Update .env.local and restart the dev server.',
      }, { status: 500 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const orgId = newOrg.id;
  let leaderAdded = false;

  const { data: usersData } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const leaderUser = usersData?.users?.find((u) => u.email?.toLowerCase() === leaderEmail);

  if (leaderUser) {
    const { error: memberError } = await admin
      .from('organization_members')
      .upsert(
        { organization_id: orgId, user_id: leaderUser.id, role: 'owner' },
        { onConflict: 'organization_id,user_id' }
      );

    if (!memberError) leaderAdded = true;
  }

  let inviteLink: string | null = null;

  if (!leaderAdded) {
    const token = randomBytes(32).toString('hex');
    const { error: inviteError } = await admin
      .from('pending_invites')
      .insert({
        organization_id: orgId,
        email: leaderEmail,
        token,
        role: 'owner',
      });

    if (inviteError) {
      return NextResponse.json({ error: 'Org created but failed to create leader invite: ' + inviteError.message }, { status: 500 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
      || request.headers.get('origin')
      || 'http://localhost:3000';
    inviteLink = `${baseUrl}/invite/accept?token=${token}`;
  }

  return NextResponse.json({
    organizationId: orgId,
    leaderAdded,
    inviteLink,
    message: leaderAdded
      ? 'Organization created. Leader already has an account and was added as owner.'
      : 'Organization created. Send the invite link to the leader to sign up and become owner.',
  });
}
