import { NextRequest, NextResponse } from 'next/server';
import { syncAllConnections } from '@/lib/email/sync';

// Cron endpoint to sync emails from connected Gmail/Outlook accounts.
// Configure in vercel.json crons array. Or call manually with CRON_SECRET header.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';

  if (!isVercelCron && cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { synced, errors } = await syncAllConnections();
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
