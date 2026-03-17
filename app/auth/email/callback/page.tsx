'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function EmailCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      const code = searchParams.get('code');
      const state = searchParams.get('state');

      if (!code || !state) {
        setError('Missing authorization code. Please try connecting again.');
        return;
      }

      try {
        const res = await fetch('/api/auth/email/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, state }),
        });

        const data = await res.json();

        if (!res.ok) {
          setError(data.error || 'Failed to connect email');
          return;
        }

        router.replace('/settings?email=connected');
        router.refresh();
      } catch (err) {
        setError('Something went wrong. Please try again.');
      }
    };

    run();
  }, [searchParams, router]);

  if (error) {
    return (
      <div className="flex min-h-[85vh] flex-col items-center justify-center gap-4 p-4">
        <p className="text-destructive">{error}</p>
        <a href="/settings" className="text-primary underline">
          Return to Settings
        </a>
      </div>
    );
  }

  return (
    <div className="flex min-h-[85vh] flex-col items-center justify-center gap-4">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      <p className="text-muted-foreground">Connecting your email...</p>
    </div>
  );
}
