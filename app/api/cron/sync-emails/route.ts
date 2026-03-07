import { NextRequest, NextResponse } from 'next/server';

/**
 * No-op: Emails are now fetched on demand when opening Client Inbox.
 * Kept for backward compatibility; returns success without syncing.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';

  if (!isVercelCron && cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({ ok: true, synced: 0 });
}
