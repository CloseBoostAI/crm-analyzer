'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import Link from 'next/link';

export default function InviteAcceptPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'login'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setErrorMsg('Invalid invite link');
      setStatus('error');
      return;
    }

    const run = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.replace(`/signup?invite=${encodeURIComponent(token)}`);
        setStatus('login');
        return;
      }

      const res = await fetch('/api/org/invite/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || 'Failed to join team');
        setStatus('error');
        return;
      }

      toast.success('You\'ve joined the team!');
      setStatus('success');
      router.push('/analytics');
      router.refresh();
    };

    run();
  }, [searchParams, router]);

  if (status === 'login') {
    return (
      <div className="flex items-center justify-center min-h-[85vh]">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="flex items-center justify-center min-h-[85vh]">
        <Card className="p-8 text-center">
          <p className="text-lg">Redirecting...</p>
        </Card>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex items-center justify-center min-h-[85vh]">
        <Card className="w-full max-w-md p-8">
          <h1 className="text-xl font-bold text-center mb-2">Invalid Invite</h1>
          <p className="text-muted-foreground text-center mb-6">{errorMsg}</p>
          <Link href="/analytics">
            <Button className="w-full">Go to Dashboard</Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[85vh]">
      <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  );
}
