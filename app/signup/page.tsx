'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

export default function SignupPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(true);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [inviteOrgName, setInviteOrgName] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  useEffect(() => {
    const token = searchParams.get('invite');
    if (!token) {
      setInviteLoading(false);
      return;
    }
    setInviteToken(token);
    fetch(`/api/org/invite/${token}`)
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data?.email) {
          setEmail(data.email);
          setInviteOrgName(data.orgName ?? null);
        }
      })
      .catch(() => {})
      .finally(() => setInviteLoading(false));
  }, [searchParams]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error('Please enter your name');
      return;
    }

    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // After email confirmation, Supabase redirects to callback which exchanges tokens and redirects
        emailRedirectTo: inviteToken
          ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(`/invite/accept?token=${inviteToken}`)}`
          : `${window.location.origin}/auth/callback?next=/analytics`,
        data: { full_name: trimmedName },
      },
    });

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    if (inviteToken && data.session) {
      const onboardRes = await fetch('/api/org/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteToken, fullName: trimmedName }),
      });
      if (!onboardRes.ok) {
        const err = await onboardRes.json();
        toast.error(err.error || 'Failed to join team');
      }
    } else if (data.session) {
      await fetch('/api/org/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: trimmedName }),
      });
    }

    if (data.session) {
      toast.success('Account created!');
      router.push('/analytics');
      router.refresh();
    } else {
      toast.success('Check your email to confirm, then sign in.');
      router.push('/login');
    }
    setLoading(false);
  };

  if (inviteLoading) {
    return (
      <div className="flex items-center justify-center min-h-[85vh]">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[85vh]">
      <Card className="w-full max-w-md p-8 border-2 border-border shadow-xl shadow-primary/10">
        <div className="text-center mb-8">
          <h1 className="font-heading text-2xl font-bold tracking-tight">
            {inviteToken ? 'Join Team' : 'Create Account'}
          </h1>
          <p className="text-muted-foreground mt-2">
            {inviteOrgName
              ? `You've been invited to join ${inviteOrgName}`
              : 'Get started with CloseBoostAI'}
          </p>
        </div>

        <form onSubmit={handleSignup} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              type="text"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => !inviteToken && setEmail(e.target.value)}
              readOnly={!!inviteToken}
              required
              className={inviteToken ? 'bg-muted' : ''}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="At least 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm Password</Label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="Confirm your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Creating account...' : inviteToken ? 'Join Team' : 'Create Account'}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Already have an account?{' '}
          <Link href="/login" className="text-blue-600 hover:underline font-medium">
            Sign In
          </Link>
        </p>
      </Card>
    </div>
  );
}
