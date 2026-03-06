'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/**
 * Handles Supabase auth redirects (email confirmation, OAuth).
 * Supabase redirects here with tokens in the URL hash. The client exchanges
 * them for a session, then redirects to the `next` URL.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      const supabase = createClient();
      const next = searchParams.get('next') || '/analytics';

      // Supabase puts tokens in the hash; createBrowserClient auto-exchanges on init.
      // Give it a moment, then verify we have a session.
      await new Promise((r) => setTimeout(r, 100));
      const { data: { session } } = await supabase.auth.getSession();

      if (session) {
        router.replace(next);
        router.refresh();
      } else {
        // No hash/tokens or exchange failed - send to login
        setError('Could not complete sign in. Please try again.');
        setTimeout(() => router.replace('/login'), 2000);
      }
    };

    run();
  }, [searchParams, router]);

  if (error) {
    return (
      <div className="flex min-h-[85vh] items-center justify-center">
        <p className="text-muted-foreground">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[85vh] items-center justify-center">
      <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  );
}
