import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { syncConnectionsForUser } from '@/lib/email/sync';

/**
 * Sync emails from the current user's connected Gmail/Outlook.
 * Call this when the user opens Client Inbox or clicks Refresh.
 */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { synced, errors } = await syncConnectionsForUser(user.id);
    return NextResponse.json({
      ok: true,
      synced,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error('[sync-emails] Error:', err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
