'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import Link from 'next/link';
import { Users, Building2, Loader2, AlertCircle, Pencil } from 'lucide-react';
import type { OrgDeal } from '@/app/api/org/deals/route';
import { getDealDisplayName } from '@/lib/utils';
import { DealDetailsDialog } from '@/components/deal-details-dialog';

type MemberInfo = {
  userId: string;
  email: string | null;
  fullName: string | null;
};

function getStageStyle(stage: string) {
  const s = stage.toLowerCase().replace(/[\s_\-]/g, '');
  if (s.includes('qualifiedtobuy')) return 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-300';
  if (s.includes('decisionmakerboughtin')) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300';
  if (s.includes('closedwon')) return 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300';
  if (s.includes('closedlost')) return 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300';
  if (s.includes('contractsent')) return 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300';
  if (s.includes('appointmentscheduled')) return 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300';
  if (s.includes('presentationscheduled')) return 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300';
  return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
}

function memberLabel(m: MemberInfo) {
  return m.fullName || m.email || 'Unknown';
}

export default function MyOrganizationPage() {
  const [deals, setDeals] = useState<OrgDeal[]>([]);
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [org, setOrg] = useState<{ id: string; name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [memberFilter, setMemberFilter] = useState<string>('all');
  const [dealDialogOpen, setDealDialogOpen] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState<OrgDeal | null>(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/org/deals');
        const data = await res.json();

        if (!res.ok) {
          if (res.status === 403) {
            setError('Only organization leaders can view this page.');
          } else {
            setError(data.error || 'Failed to load organization deals');
          }
          setDeals([]);
          setMembers([]);
          setOrg(null);
          return;
        }

        setDeals(data.deals || []);
        setMembers(data.members || []);
        setOrg(data.org || null);
      } catch (e) {
        setError('Failed to load organization deals');
        setDeals([]);
        setMembers([]);
        setOrg(null);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const filteredDeals =
    memberFilter === 'all'
      ? deals
      : deals.filter((d) => d.userId === memberFilter);

  const totalValue = filteredDeals.reduce((sum, d) => sum + (d.amount || 0), 0);

  if (loading) {
    return (
      <div className="container mx-auto py-12 flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto py-12">
        <Card className="border-amber-200 dark:border-amber-800">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 text-amber-700 dark:text-amber-400">
              <AlertCircle className="h-6 w-6 shrink-0" />
              <p>{error}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            My Organization
          </h1>
          <p className="text-muted-foreground mt-1">
            View deals across your organization
          </p>
        </div>
        {org && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            <span>{org.name}</span>
            <span>•</span>
            <span>{members.length} member{members.length !== 1 ? 's' : ''}</span>
            <Link
              href="/settings?section=team"
              className="inline-flex items-center gap-1 ml-2 text-muted-foreground/80 hover:text-muted-foreground text-xs transition-colors"
            >
              <Pencil className="h-3 w-3" />
              <span>Edit members</span>
            </Link>
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Organization Deals</CardTitle>
          <CardDescription>
            All deals from members of your organization. Filter by member to focus on specific team members.
          </CardDescription>
          <div className="flex flex-wrap items-center gap-4 pt-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Filter by member:</span>
              <Select value={memberFilter} onValueChange={setMemberFilter}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="All members" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All members</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.userId} value={m.userId}>
                      {memberLabel(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="text-sm font-medium">
              Total: {filteredDeals.length} deal{filteredDeals.length !== 1 ? 's' : ''}
              {filteredDeals.length > 0 && (
                <span className="text-muted-foreground ml-2">
                  (${totalValue.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })})
                </span>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredDeals.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {deals.length === 0
                ? 'No deals in your organization yet.'
                : 'No deals match the selected member filter.'}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Deal Name</TableHead>
                    <TableHead>Member</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Deal Owner</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Last Activity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDeals.map((deal) => (
                    <TableRow key={`${deal.id}-${deal.userId}`}>
                      <TableCell className="font-medium">
                        <button
                          type="button"
                          onClick={() => { setSelectedDeal(deal); setDealDialogOpen(true); }}
                          className="text-primary hover:underline text-left"
                        >
                          {getDealDisplayName(deal)}
                        </button>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {deal.memberName || deal.memberEmail || '—'}
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => { setSelectedDeal(deal); setDealDialogOpen(true); }}
                          className="text-primary hover:underline text-left"
                        >
                          {deal.company || <span className="text-gray-400 italic">N/A</span>}
                        </button>
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => { setSelectedDeal(deal); setDealDialogOpen(true); }}
                          className="text-primary hover:underline text-left"
                        >
                          {deal.contact}
                        </button>
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStageStyle(
                            deal.stage
                          )}`}
                        >
                          {deal.stage}
                        </span>
                      </TableCell>
                      <TableCell>{deal.owner}</TableCell>
                      <TableCell className="text-right font-medium">
                        ${deal.amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {deal.lastActivity
                          ? new Date(deal.lastActivity).toLocaleDateString()
                          : 'N/A'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <DealDetailsDialog
        deal={selectedDeal ? { ...selectedDeal, userId: selectedDeal.userId } : null}
        open={dealDialogOpen}
        onOpenChange={setDealDialogOpen}
        onNotesSaved={(id, notes) => {
          setDeals(prev => prev.map(d => (d.id === id && d.userId === selectedDeal?.userId) ? { ...d, notes } : d));
          setSelectedDeal(prev => prev && prev.id === id ? { ...prev, notes } : prev);
        }}
      />
    </div>
  );
}
