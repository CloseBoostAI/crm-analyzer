'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Building2, Users, Shield, Pencil, CreditCard, Trash2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

type OrgRow = {
  id: string;
  name: string;
  seatLimit: number;
  memberCount: number;
  createdAt: string;
  createdBy: string | null;
};

type Stats = {
  totalOrgs: number;
  totalUsers: number;
  totalMembers: number;
};

type MemberRow = {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
  email: string | null;
  fullName: string | null;
};

export default function AdminPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingOrg, setEditingOrg] = useState<OrgRow | null>(null);
  const [editName, setEditName] = useState('');
  const [editSeatLimit, setEditSeatLimit] = useState(1);
  const [saving, setSaving] = useState(false);
  const [membersOrg, setMembersOrg] = useState<OrgRow | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [newSeatLimit, setNewSeatLimit] = useState(5);
  const [newLeaderEmail, setNewLeaderEmail] = useState('');
  const [createdInviteLink, setCreatedInviteLink] = useState<string | null>(null);
  const [orgToDelete, setOrgToDelete] = useState<OrgRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [addingMember, setAddingMember] = useState(false);
  const [memberInviteLink, setMemberInviteLink] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const [statsRes, orgsRes] = await Promise.all([
        fetch('/api/admin/stats'),
        fetch('/api/admin/orgs'),
      ]);
      const statsData = await statsRes.json();
      const orgsData = await orgsRes.json();
      if (statsRes.ok && statsData.totalOrgs !== undefined) setStats(statsData);
      if (orgsRes.ok && orgsData.orgs) setOrgs(orgsData.orgs);
    } catch {
      toast.error('Failed to load admin data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openEdit = (org: OrgRow) => {
    setEditingOrg(org);
    setEditName(org.name);
    setEditSeatLimit(org.seatLimit);
  };

  const openMembers = async (org: OrgRow) => {
    setMembersOrg(org);
    setMembers([]);
    setMembersLoading(true);
    setNewMemberEmail('');
    setMemberInviteLink(null);
    try {
      const res = await fetch(`/api/admin/orgs/${org.id}/members`);
      const data = await res.json();
      if (res.ok && data.members) setMembers(data.members);
      else toast.error(data.error || 'Failed to load members');
    } catch {
      toast.error('Failed to load members');
    } finally {
      setMembersLoading(false);
    }
  };

  const addMember = async () => {
    if (!membersOrg || !newMemberEmail.trim()) return;
    setAddingMember(true);
    setMemberInviteLink(null);
    try {
      const res = await fetch(`/api/admin/orgs/${membersOrg.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newMemberEmail.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add member');
      toast.success(data.message);
      setNewMemberEmail('');
      if (data.inviteLink) {
        setMemberInviteLink(data.inviteLink);
        await navigator.clipboard.writeText(data.inviteLink);
        toast.success('Invite link copied to clipboard');
      }
      const membersRes = await fetch(`/api/admin/orgs/${membersOrg.id}/members`);
      const membersData = await membersRes.json();
      if (membersRes.ok && membersData.members) setMembers(membersData.members);
      loadData();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to add member');
    } finally {
      setAddingMember(false);
    }
  };

  const createOrg = async () => {
    if (!newOrgName.trim() || !newLeaderEmail.trim()) {
      toast.error('Company name and leader email are required');
      return;
    }
    if (newSeatLimit < 1) {
      toast.error('Seat limit must be at least 1');
      return;
    }
    setCreatingOrg(true);
    setCreatedInviteLink(null);
    try {
      const res = await fetch('/api/admin/orgs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newOrgName.trim(),
          seatLimit: newSeatLimit,
          leaderEmail: newLeaderEmail.trim().toLowerCase(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create');
      toast.success(data.message || 'Organization created');
      loadData();
      if (data.inviteLink) {
        setCreatedInviteLink(data.inviteLink);
        await navigator.clipboard.writeText(data.inviteLink);
        toast.success('Invite link copied to clipboard');
      } else {
        setCreateDialogOpen(false);
        setNewOrgName('');
        setNewSeatLimit(5);
        setNewLeaderEmail('');
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to create');
    } finally {
      setCreatingOrg(false);
    }
  };

  const closeCreateDialog = () => {
    setCreateDialogOpen(false);
    setNewOrgName('');
    setNewSeatLimit(5);
    setNewLeaderEmail('');
    setCreatedInviteLink(null);
  };

  const deleteOrg = async (org: OrgRow) => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/orgs/${org.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete');
      toast.success('Organization deleted');
      setMembersOrg(null);
      setEditingOrg(null);
      setOrgToDelete(null);
      loadData();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  const removeMember = async (orgId: string, userId: string) => {
    if (!confirm('Remove this member from the organization?')) return;
    try {
      const res = await fetch(`/api/admin/orgs/${orgId}/members/${userId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to remove');
      toast.success('Member removed');
      if (membersOrg?.id === orgId) {
        setMembers((prev) => prev.filter((m) => m.user_id !== userId));
        loadData();
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to remove');
    }
  };

  const saveEdit = async () => {
    if (!editingOrg) return;
    if (editSeatLimit < 1) {
      toast.error('Seat limit must be at least 1');
      return;
    }
    if (editSeatLimit < editingOrg.memberCount) {
      toast.error(`Seat limit cannot be less than current members (${editingOrg.memberCount})`);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/orgs/${editingOrg.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim(), seatLimit: editSeatLimit }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update');
      toast.success('Organization updated');
      setEditingOrg(null);
      loadData();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto py-10 px-4">
        <div className="flex justify-center py-24">
          <div className="animate-spin h-10 w-10 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10 px-4">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Shield className="h-8 w-8" />
            CloseBoost Admin
          </h1>
          <p className="text-muted-foreground mt-1">Manage organizations and platform settings</p>
        </div>
        <Link href="/analytics">
          <Button variant="outline">Back to App</Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Organizations</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats?.totalOrgs ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats?.totalUsers ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Org Members</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats?.totalMembers ?? 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Organizations */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Organizations</CardTitle>
            <CardDescription>
              Manage seat limits and organization names. Seat limit cannot be set below current member count.
            </CardDescription>
          </div>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Building2 className="h-4 w-4 mr-2" />
            Create organization
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organization</TableHead>
                <TableHead>Members</TableHead>
                <TableHead>Seat limit</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-[180px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orgs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8">
                    <div className="space-y-3">
                      <p className="text-muted-foreground">No organizations yet.</p>
                      <p className="text-sm text-muted-foreground">
                        Create an organization for a company. You set the leader and seat limit; they invite their team.
                      </p>
                      <Button onClick={() => setCreateDialogOpen(true)}>
                        <Building2 className="h-4 w-4 mr-2" />
                        Create organization
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                orgs.map((org) => (
                  <TableRow key={org.id}>
                    <TableCell className="font-medium">{org.name}</TableCell>
                    <TableCell>
                      {org.memberCount} / {org.seatLimit}
                    </TableCell>
                    <TableCell>{org.seatLimit}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {org.createdAt ? new Date(org.createdAt).toLocaleDateString() : '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="outline" size="sm" onClick={() => openMembers(org)}>
                          <Users className="h-4 w-4 mr-1" />
                          Members
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => openEdit(org)}>
                          <Pencil className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Placeholder for Stripe */}
      <Card className="mt-6 opacity-75">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Billing (Stripe)
          </CardTitle>
          <CardDescription>
            Stripe integration coming soon. You will be able to manage subscriptions and seat upgrades here.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Create organization dialog */}
      <Dialog open={createDialogOpen} onOpenChange={(open) => !open && closeCreateDialog()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create organization</DialogTitle>
            <DialogDescription>
              Set up a company. The leader will be the org owner and can invite their team. If the leader doesn&apos;t have an account yet, they&apos;ll get an invite link to sign up.
            </DialogDescription>
          </DialogHeader>
          {createdInviteLink ? (
            <div className="space-y-4 py-4">
              <p className="text-sm text-green-600 dark:text-green-400">
                Organization created. The leader doesn&apos;t have an account yet. Send them this invite link:
              </p>
              <div className="flex gap-2">
                <Input readOnly value={createdInviteLink} className="font-mono text-sm" />
                <Button
                  variant="outline"
                  onClick={() => navigator.clipboard.writeText(createdInviteLink)}
                >
                  Copy
                </Button>
              </div>
              <Button onClick={closeCreateDialog}>Done</Button>
            </div>
          ) : (
            <div className="space-y-4 py-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Company name</label>
                <Input
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  placeholder="Acme Corp"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Leader email</label>
                <Input
                  type="email"
                  value={newLeaderEmail}
                  onChange={(e) => setNewLeaderEmail(e.target.value)}
                  placeholder="leader@company.com"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  This person will be the org owner. If they have an account, they&apos;re added immediately. If not, you&apos;ll get an invite link to send them.
                </p>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Seat limit</label>
                <Input
                  type="number"
                  min={1}
                  value={newSeatLimit}
                  onChange={(e) => setNewSeatLimit(parseInt(e.target.value, 10) || 1)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  How many team members the leader can invite.
                </p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={closeCreateDialog}>
                  Cancel
                </Button>
                <Button onClick={createOrg} disabled={creatingOrg}>
                  {creatingOrg ? 'Creating...' : 'Create'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Members dialog */}
      <Dialog open={!!membersOrg} onOpenChange={(open) => !open && (setMembersOrg(null), setMemberInviteLink(null))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Members – {membersOrg?.name}</DialogTitle>
            <DialogDescription>
              View and manage organization members. Add by email; if they have an account they join immediately. Owners cannot be removed.
            </DialogDescription>
          </DialogHeader>
          {membersOrg && (
            <div className="space-y-3 border-b pb-4">
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="teammate@company.com"
                  value={newMemberEmail}
                  onChange={(e) => setNewMemberEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addMember()}
                  disabled={addingMember || (membersOrg.memberCount >= membersOrg.seatLimit)}
                />
                <Button
                  onClick={addMember}
                  disabled={addingMember || !newMemberEmail.trim() || membersOrg.memberCount >= membersOrg.seatLimit}
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  {addingMember ? 'Adding...' : 'Add'}
                </Button>
              </div>
              {memberInviteLink && (
                <div className="space-y-2">
                  <p className="text-sm text-green-600 dark:text-green-400">
                    They don&apos;t have an account yet. Share this invite link:
                  </p>
                  <div className="flex gap-2">
                    <Input readOnly value={memberInviteLink} className="font-mono text-sm" />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigator.clipboard.writeText(memberInviteLink)}
                    >
                      Copy
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
          {membersLoading ? (
            <div className="py-8 flex justify-center">
              <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
            </div>
          ) : members.length === 0 ? (
            <p className="py-4 text-muted-foreground text-sm">No members yet.</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {members.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div>
                    <p className="font-medium text-sm">{m.fullName || m.email || 'Member'}</p>
                    <p className="text-xs text-muted-foreground">
                      {m.email}
                      <span className="ml-2 capitalize">({m.role})</span>
                    </p>
                  </div>
                  {m.role !== 'owner' && membersOrg && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-red-500 hover:text-red-700"
                      onClick={() => removeMember(membersOrg.id, m.user_id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editingOrg} onOpenChange={(open) => !open && setEditingOrg(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit organization</DialogTitle>
            <DialogDescription>
              Update the organization name and seat limit.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Name</label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Organization name"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Seat limit</label>
              <Input
                type="number"
                min={editingOrg?.memberCount ?? 1}
                value={editSeatLimit}
                onChange={(e) => setEditSeatLimit(parseInt(e.target.value, 10) || 1)}
              />
              {editingOrg && (
                <p className="text-xs text-muted-foreground mt-1">
                  Minimum: {editingOrg.memberCount} (current members)
                </p>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditingOrg(null)}>
              Cancel
            </Button>
            <Button onClick={saveEdit} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
          {editingOrg && (
            <div className="border-t pt-4 mt-4">
              <p className="text-sm text-muted-foreground mb-2">Danger zone</p>
              <Button
                variant="outline"
                size="sm"
                className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                onClick={() => editingOrg && setOrgToDelete(editingOrg)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete organization
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!orgToDelete} onOpenChange={(open) => !open && setOrgToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete organization?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &quot;{orgToDelete?.name}&quot; and remove all members from the org. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
              onClick={(e) => {
                e.preventDefault();
                orgToDelete && deleteOrg(orgToDelete);
              }}
              disabled={deleting}
            >
              {deleting ? 'Deleting...' : 'Yes, delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
