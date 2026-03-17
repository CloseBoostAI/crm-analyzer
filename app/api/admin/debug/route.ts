import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

/**
 * Debug endpoint to diagnose admin access issues.
 * Visit /api/admin/debug while logged in to see what the server sees.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const adminEmails = (process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  const userEmail = user?.email?.toLowerCase() ?? null;
  const isAdmin = userEmail !== null && adminEmails.includes(userEmail);

  return NextResponse.json({
    loggedIn: !!user,
    userEmail: userEmail || '(not logged in)',
    adminConfigured: adminEmails.length > 0,
    adminCount: adminEmails.length,
    isAdmin,
    hint: !adminEmails.length
      ? 'ADMIN_EMAILS or ADMIN_EMAIL not set. Add to .env.local and restart dev server.'
      : !user
        ? 'Not logged in. Sign in first.'
        : !isAdmin
          ? 'Your email is not in ADMIN_EMAILS. Check for typos or extra spaces.'
          : 'You should have admin access.',
  });
}
