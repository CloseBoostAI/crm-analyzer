import { createClient } from '@/lib/supabase/server';
import { createAdminClient, isAdminEmail } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  const [
    { count: orgCount },
    { count: userCount },
    { count: memberCount },
  ] = await Promise.all([
    admin.from('organizations').select('*', { count: 'exact', head: true }),
    admin.from('profiles').select('*', { count: 'exact', head: true }),
    admin.from('organization_members').select('*', { count: 'exact', head: true }),
  ]);

  return NextResponse.json({
    totalOrgs: orgCount ?? 0,
    totalUsers: userCount ?? 0,
    totalMembers: memberCount ?? 0,
  });
}
