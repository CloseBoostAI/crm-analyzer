import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

/**
 * No-op: Emails are now fetched on demand when opening Client Inbox.
 * Kept for backward compatibility; returns success without syncing.
 */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({ ok: true, synced: 0 });
}
