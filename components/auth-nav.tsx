'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';

export default function AuthNav() {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isOrgLeader, setIsOrgLeader] = useState(false);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      if (user) {
        const [adminRes, orgRes] = await Promise.all([
          fetch('/api/admin/check'),
          fetch('/api/org'),
        ]);
        const adminData = await adminRes.json();
        const orgData = await orgRes.json();
        setIsAdmin(adminData.isAdmin);
        const role = orgData.membership?.role;
        setIsOrgLeader(role === 'owner' || role === 'admin');
      } else {
        setIsAdmin(false);
        setIsOrgLeader(false);
      }
      setLoading(false);
    };
    getUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        setIsAdmin(false);
        setIsOrgLeader(false);
      } else {
        const [adminRes, orgRes] = await Promise.all([
          fetch('/api/admin/check'),
          fetch('/api/org'),
        ]);
        const adminData = await adminRes.json();
        const orgData = await orgRes.json();
        setIsAdmin(adminData.isAdmin);
        const role = orgData.membership?.role;
        setIsOrgLeader(role === 'owner' || role === 'admin');
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase.auth]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  };

  if (loading) {
    return <div className="h-4 w-4 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />;
  }

  if (user) {
    return (
      <div className="flex items-center gap-6">
        <Link href="/analytics" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">
          Analytics
        </Link>
        <Link href="/settings" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">
          Settings
        </Link>
        {isOrgLeader && (
          <Link href="/my-organization" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">
            My Organization
          </Link>
        )}
        {isAdmin && (
          <Link href="/admin" className="text-sm font-medium text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300">
            Admin
          </Link>
        )}
        <span className="text-sm text-muted-foreground hidden sm:inline truncate max-w-[140px]">
          {user.email}
        </span>
        <Button variant="outline" size="sm" onClick={handleSignOut} className="font-medium">
          Sign Out
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4">
      <Link href="/login" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">
        Sign In
      </Link>
      <Link href="/signup">
        <Button size="sm" className="font-semibold">Sign Up</Button>
      </Link>
    </div>
  );
}
