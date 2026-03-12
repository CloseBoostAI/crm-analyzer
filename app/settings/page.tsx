"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Checkbox } from "@/components/ui/checkbox"
import {
  useSettings,
  type DealsColumnKey,
  type TasksLayout,
  type ThemeMode,
  type BackgroundMode,
} from "@/lib/settings-context"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  RotateCcw,
  LayoutDashboard,
  ChevronRight,
  ChevronDown,
  GripVertical,
  Mail,
  ListTodo,
  User,
  Palette,
  Columns3,
  ArrowUpDown,
  Building2,
  Users,
  UserPlus,
  Trash2,
  BarChart2,
  Link2,
} from "lucide-react"
import { cn, getDealDisplayName } from "@/lib/utils"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { createClient } from "@/lib/supabase/client"
import { loadDeals, deleteDeals } from "@/lib/supabase/data"
import { toast } from "sonner"
import { useTheme } from "next-themes"
import { useSearchParams } from "next/navigation"
import type { Deal } from "@/lib/utils"

const SETTINGS_SECTIONS = [
  { id: "deals-columns", label: "Deals Overview", icon: LayoutDashboard },
  { id: "statistics", label: "Statistics", icon: BarChart2 },
  { id: "profile", label: "Profile", icon: Building2 },
  { id: "team", label: "Team", icon: Users },
  { id: "email-connections", label: "Connected Email", icon: Link2 },
  { id: "email", label: "Email Generator", icon: Mail },
  { id: "tasks", label: "Tasks", icon: ListTodo },
  { id: "account", label: "Account", icon: User },
  { id: "appearance", label: "Appearance", icon: Palette },
] as const

type SectionId = (typeof SETTINGS_SECTIONS)[number]["id"]

function SortableColumnItem({
  column,
  onRemove,
}: {
  column: { key: DealsColumnKey; label: string; required?: boolean }
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: column.key,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center justify-between rounded-lg border p-4 bg-white dark:bg-gray-900",
        isDragging && "shadow-lg ring-2 ring-blue-200 z-10 relative"
      )}
    >
      <div className="flex items-center gap-3">
        <button
          className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-5 w-5" />
        </button>
        <div className="space-y-0.5">
          <p className="text-base font-medium">{column.label}</p>
          {column.required && (
            <p className="text-sm text-muted-foreground">Always visible</p>
          )}
        </div>
      </div>
      {!column.required && (
        <Button variant="ghost" size="sm" onClick={onRemove} className="text-muted-foreground hover:text-destructive">
          Remove
        </Button>
      )}
    </div>
  )
}

function AccountSection() {
  const supabase = createClient()
  const [email, setEmail] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setEmail(data.user.email)
    })
  }, [supabase.auth])

  const handleUpdatePassword = async () => {
    if (!newPassword) return
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match")
      return
    }
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters")
      return
    }
    setSaving(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      toast.success("Password updated successfully")
      setNewPassword("")
      setConfirmPassword("")
    } catch (error: any) {
      toast.error(error.message || "Failed to update password")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account</CardTitle>
        <CardDescription>Manage your account details</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label className="text-sm font-medium">Email</Label>
          <Input value={email} disabled className="bg-muted" />
          <p className="text-xs text-muted-foreground">Your email cannot be changed here</p>
        </div>

        <div className="border-t pt-6 space-y-4">
          <h4 className="font-medium">Change Password</h4>
          <div className="space-y-2">
            <Label htmlFor="new-password">New Password</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm Password</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
            />
          </div>
          <Button onClick={handleUpdatePassword} disabled={saving || !newPassword}>
            {saving ? "Updating..." : "Update Password"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function TeamSection() {
  const [org, setOrg] = useState<{ id?: string; name: string; memberCount: number; seatLimit: number; inboundEmail?: string | null } | null>(null)
  const [membership, setMembership] = useState<{ role: string } | null>(null)
  const [members, setMembers] = useState<{ id: string; user_id: string; role: string; email: string | null; fullName: string | null }[]>([])
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [inboundEmail, setInboundEmail] = useState("")
  const [savingInbound, setSavingInbound] = useState(false)

  useEffect(() => {
    const safeJson = async (r: Response) => {
      const text = await r.text()
      if (!text) return {}
      try {
        return JSON.parse(text)
      } catch {
        return {}
      }
    }
    Promise.all([
      fetch("/api/org").then(safeJson),
      fetch("/api/org/members").then(safeJson),
    ]).then(([orgRes, membersRes]) => {
      const orgData = orgRes?.org || membersRes?.org
      if (orgData) {
        setOrg({
          id: orgData.id,
          name: orgData.name ?? 'Organization',
          memberCount: orgData.memberCount ?? membersRes?.members?.length ?? 0,
          seatLimit: orgData.seat_limit ?? 1,
          inboundEmail: orgData.inboundEmail ?? null,
        })
        setInboundEmail(orgData.inboundEmail ?? "")
        setMembership(
          (membersRes?.myRole ? { role: membersRes.myRole } : null) || orgRes?.membership
        )
      }
      if (membersRes?.members) setMembers(membersRes.members)
    }).finally(() => setLoading(false))
  }, [])

  const role = membership?.role?.toLowerCase?.() ?? membership?.role ?? ""
  const canInvite = membership && ["owner", "admin"].includes(role)
  const canRemoveMembers = membership && ["owner", "admin"].includes(role)
  const isOwner = role === "owner"

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return
    setInviteLoading(true)
    try {
      const res = await fetch("/api/org/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to invite")
      toast.success("Invite created! Share the link with your team member.")
      setInviteEmail("")
      setInviteDialogOpen(false)
      const link = data.inviteLink
      if (link) {
        await navigator.clipboard.writeText(link)
        toast.success("Invite link copied to clipboard")
      }
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setInviteLoading(false)
    }
  }

  const handleRemoveMember = async (userId: string) => {
    if (!confirm("Remove this member from the team?")) return
    try {
      const url = org?.id
        ? `/api/org/members/${userId}?orgId=${encodeURIComponent(org.id)}`
        : `/api/org/members/${userId}`
      const res = await fetch(url, { method: "DELETE" })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success("Member removed")
      setMembers((prev) => prev.filter((m) => m.user_id !== userId))
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const handleSaveInboundEmail = async () => {
    setSavingInbound(true)
    try {
      const res = await fetch("/api/org", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inboundEmail: inboundEmail.trim() || null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to save")
      toast.success("Company inbox updated")
      setOrg((prev) => prev ? { ...prev, inboundEmail: inboundEmail.trim() || null } : null)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSavingInbound(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex justify-center">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle>Team</CardTitle>
          <CardDescription>
            Invite team members. Each rep has their own account and data. Your subscription covers all seats.
          </CardDescription>
        </div>
        <Button onClick={() => setInviteDialogOpen(true)}>
          <UserPlus className="h-4 w-4 mr-2" />
          Invite members
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {org && (
          <>
            <div className="rounded-lg border p-4">
              <p className="text-sm font-medium">{org.name}</p>
              <p className="text-sm text-muted-foreground">
                {org.memberCount} of {org.seatLimit} seat{org.seatLimit !== 1 ? "s" : ""} used
              </p>
            </div>
            {isOwner && (
              <div className="rounded-lg border p-4 space-y-2">
                <h4 className="font-medium text-sm">Company inbox</h4>
                <p className="text-sm text-muted-foreground">
                  Email address where clients and prospects send messages. Configure inbound parsing (SendGrid/Mailgun) to forward to your webhook.
                </p>
                <div className="flex gap-2 mt-2">
                  <Input
                    type="email"
                    placeholder="sales@yourcompany.com"
                    value={inboundEmail}
                    onChange={(e) => setInboundEmail(e.target.value)}
                    className="max-w-xs"
                  />
                  <Button size="sm" onClick={handleSaveInboundEmail} disabled={savingInbound}>
                    {savingInbound ? "Saving..." : "Save"}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite team member</DialogTitle>
              <DialogDescription>
                {org
                  ? "Enter their email. An invite link will be copied to your clipboard to share with them."
                  : "You're not in an organization. Ask your admin to invite you or create an org for your company."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {org ? (
                <>
                  <div>
                    <Label htmlFor="invite-email">Email</Label>
                    <Input
                      id="invite-email"
                      type="email"
                      placeholder="teammate@company.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleInvite()}
                      className="mt-2"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setInviteDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleInvite} disabled={inviteLoading}>
                      {inviteLoading ? "Creating invite..." : "Create invite"}
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex justify-end">
                  <Button onClick={() => setInviteDialogOpen(false)}>Close</Button>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <div className="rounded-lg border">
          <div className="p-4 border-b">
            <h4 className="font-medium">Team members</h4>
          </div>
          <div className="divide-y">
            {members.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between p-4"
              >
                <div>
                  <p className="font-medium">{m.fullName || m.email || "Member"}</p>
                  <p className="text-sm text-muted-foreground">
                    {m.email && m.email}
                    <span className="ml-2 capitalize">({m.role})</span>
                  </p>
                </div>
                {canRemoveMembers && m.role !== "owner" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-red-500 hover:text-red-700"
                    onClick={() => handleRemoveMember(m.user_id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function EmailConnectionsSection() {
  const searchParams = useSearchParams()
  const [connections, setConnections] = useState<{ id: string; provider: string; email: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [disconnecting, setDisconnecting] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/auth/email/connections")
      .then((r) => r.json())
      .then((data) => {
        if (data.connections) setConnections(data.connections)
      })
      .catch(() => toast.error("Failed to load connections"))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (searchParams.get("email") === "connected") {
      toast.success("Email connected successfully")
      fetch("/api/auth/email/connections")
        .then((r) => r.json())
        .then((data) => {
          if (data.connections) setConnections(data.connections)
        })
    }
  }, [searchParams])

  const handleConnect = (provider: "gmail" | "outlook") => {
    window.location.href = `/api/auth/email/connect?provider=${provider}`
  }

  const handleDisconnect = async (id: string) => {
    if (!confirm("Disconnect this email? CloseBoost will no longer be able to read or sync emails from this account.")) return
    setDisconnecting(id)
    try {
      const res = await fetch(`/api/auth/email/connections/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error((await res.json()).error)
      setConnections((prev) => prev.filter((c) => c.id !== id))
      toast.success("Email disconnected")
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setDisconnecting(null)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex justify-center">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connected Email</CardTitle>
        <CardDescription>
          Connect your Gmail or Outlook so CloseBoost can see your emails, generate responses, recommend tasks, and fill deal activity.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-lg border p-4 space-y-4">
          <h4 className="font-medium text-sm">Your connections</h4>
          {connections.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No email connected. Connect Gmail or Outlook to enable email features.
            </p>
          ) : (
            <div className="space-y-3">
              {connections.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div>
                    <p className="font-medium text-sm capitalize">{c.provider}</p>
                    <p className="text-sm text-muted-foreground">{c.email}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleDisconnect(c.id)}
                    disabled={disconnecting === c.id}
                  >
                    {disconnecting === c.id ? "Disconnecting..." : "Disconnect"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={() => handleConnect("gmail")}>
            <Mail className="h-4 w-4 mr-2" />
            Connect Gmail
          </Button>
          <Button variant="outline" onClick={() => handleConnect("outlook")}>
            Connect Outlook
          </Button>
          <RemoveEmailsDialog />
        </div>
      </CardContent>
    </Card>
  )
}

function RemoveEmailsDialog() {
  const [open, setOpen] = useState(false)
  const [emails, setEmails] = useState<Array<{ id: string; senderEmail: string; senderName: string | null; subject: string; receivedAt: string }>>([])
  const [loading, setLoading] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    fetch("/api/org/inbound-emails?includeDismissed=true&limit=100")
      .then((r) => r.json())
      .then((data) => {
        if (data.emails) setEmails(data.emails)
        else setEmails([])
      })
      .catch(() => {
        toast.error("Failed to load emails")
        setEmails([])
      })
      .finally(() => setLoading(false))
  }, [open])

  const handleRemove = async (emailId: string) => {
    setRemoving(emailId)
    try {
      const res = await fetch(`/api/org/inbound-emails/${emailId}`, { method: "DELETE" })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setEmails((prev) => prev.filter((e) => e.id !== emailId))
      toast.success("Email removed")
    } catch (e: any) {
      toast.error(e?.message || "Failed to remove")
    } finally {
      setRemoving(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="text-destructive hover:text-destructive hover:bg-destructive/10">
          <Trash2 className="h-4 w-4 mr-2" />
          Remove emails
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Remove emails</DialogTitle>
          <DialogDescription>
            Permanently remove emails from your inbox. Webhook emails are deleted from the database. OAuth emails (Gmail/Outlook) are hidden from your view.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : emails.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No emails to remove.</p>
        ) : (
          <ScrollArea className="flex-1 min-h-0 -mx-6 px-6">
            <div className="space-y-2 pr-4">
              {emails.map((email) => (
                <div
                  key={email.id}
                  className="flex items-center justify-between gap-4 rounded-lg border p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">
                      {email.senderName || email.senderEmail}
                    </p>
                    <p className="text-sm text-muted-foreground truncate">
                      {email.subject || "(no subject)"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(email.receivedAt).toLocaleString()}
                    </p>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleRemove(email.id)}
                    disabled={removing === email.id}
                  >
                    {removing === email.id ? "Removing..." : "Remove"}
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  )
}

function SortableDealItem({
  deal,
  selected,
  onToggleSelect,
}: {
  deal: Deal
  selected: boolean
  onToggleSelect: (checked: boolean) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: deal.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-4 rounded-lg border p-3 bg-white dark:bg-gray-900",
        isDragging && "shadow-lg ring-2 ring-blue-200 z-10 relative"
      )}
    >
      <div
        className="shrink-0 flex items-center"
        onClick={(e) => e.stopPropagation()}
      >
        <Checkbox
          checked={selected}
          onCheckedChange={(checked) => onToggleSelect(checked === true)}
        />
      </div>
      <button
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none shrink-0"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-5 w-5" />
      </button>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{getDealDisplayName(deal)}</p>
        <p className="text-sm text-muted-foreground truncate">
          {deal.contact}{deal.company ? ` · ${deal.company}` : ""}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="font-medium">${deal.amount.toLocaleString()}</p>
      </div>
    </div>
  )
}

function DealOrderDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { settings, setCustomDealOrder } = useSettings()
  const [deals, setDeals] = useState<Deal[]>([])
  const [orderedIds, setOrderedIds] = useState<string[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  useEffect(() => {
    if (!open) return
    setSelectedIds(new Set())
    setLoading(true)
    loadDeals()
      .then((data) => {
        setDeals(data)
        if (settings.customDealOrder.length > 0) {
          const existing = new Set(data.map((d) => d.id))
          const validOrder = settings.customDealOrder.filter((id) => existing.has(id))
          const missing = data.filter((d) => !validOrder.includes(d.id)).map((d) => d.id)
          setOrderedIds([...validOrder, ...missing])
        } else {
          setOrderedIds(data.map((d) => d.id))
        }
      })
      .catch(() => toast.error("Failed to load deals"))
      .finally(() => setLoading(false))
  }, [open, settings.customDealOrder])

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setOrderedIds((prev) => {
      const oldIndex = prev.indexOf(active.id as string)
      const newIndex = prev.indexOf(over.id as string)
      return arrayMove(prev, oldIndex, newIndex)
    })
  }

  const handleSave = () => {
    setCustomDealOrder(orderedIds)
    toast.success("Custom deal order saved")
    onOpenChange(false)
  }

  const handleReset = () => {
    setOrderedIds(deals.map((d) => d.id))
  }

  const toggleSelect = (dealId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(dealId)
      else next.delete(dealId)
      return next
    })
  }

  const selectAll = () => {
    setSelectedIds(new Set(orderedIds))
  }

  const deselectAll = () => {
    setSelectedIds(new Set())
  }

  const handleDeleteSelected = async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) {
      toast.error("Select at least one deal to delete")
      return
    }
    if (!confirm(`Delete ${ids.length} deal${ids.length === 1 ? "" : "s"}? This cannot be undone.`)) return
    setDeleting(true)
    try {
      await deleteDeals(ids)
      setDeals((prev) => prev.filter((d) => !ids.includes(d.id)))
      setOrderedIds((prev) => prev.filter((id) => !ids.includes(id)))
      setSelectedIds((prev) => {
        const next = new Set(prev)
        ids.forEach((id) => next.delete(id))
        return next
      })
      setCustomDealOrder(settings.customDealOrder.filter((id) => !ids.includes(id)))
      toast.success(`${ids.length} deal${ids.length === 1 ? "" : "s"} deleted`)
    } catch {
      toast.error("Failed to delete deals")
    } finally {
      setDeleting(false)
    }
  }

  const dealsMap = new Map(deals.map((d) => [d.id, d]))
  const orderedDeals = orderedIds.map((id) => dealsMap.get(id)).filter(Boolean) as Deal[]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit Custom Deal Order</DialogTitle>
          <DialogDescription>
            Select deals to delete, or drag to reorder. This order is used when &quot;Custom&quot; sort is active.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex-1 flex items-center justify-center py-12">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : orderedDeals.length === 0 ? (
          <div className="flex-1 flex items-center justify-center py-12 text-muted-foreground">
            No deals found. Upload CRM data first.
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={selectAll}>
                  Select All
                </Button>
                <Button variant="outline" size="sm" onClick={deselectAll}>
                  Deselect All
                </Button>
                {selectedIds.size > 0 && (
                  <span className="text-sm text-muted-foreground self-center">
                    {selectedIds.size} selected
                  </span>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto pr-1 -mr-1">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {orderedDeals.map((deal) => (
                      <SortableDealItem
                        key={deal.id}
                        deal={deal}
                        selected={selectedIds.has(deal.id)}
                        onToggleSelect={(checked) => toggleSelect(deal.id, checked)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          </>
        )}
        <div className="flex justify-between pt-4 border-t">
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleReset}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset Order
            </Button>
            {selectedIds.size > 0 && (
              <Button
                variant="destructive"
                onClick={handleDeleteSelected}
                disabled={deleting}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {deleting ? "Deleting..." : `Delete ${selectedIds.size} deal${selectedIds.size === 1 ? "" : "s"}`}
              </Button>
            )}
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              Save Order
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default function SettingsPage() {
  const searchParams = useSearchParams()
  const {
    settings,
    orderedDealsColumns,
    updateDealsColumn,
    reorderDealsColumns,
    resetDealsColumns,
    updateDealsOverview,
    updateStatistics,
    updateProfile,
    updateEmailSettings,
    updateTaskSettings,
    updateAppearance,
  } = useSettings()
  const sectionParam = searchParams.get("section")
  const initialSection: SectionId =
    sectionParam && SETTINGS_SECTIONS.some((s) => s.id === sectionParam)
      ? (sectionParam as SectionId)
      : "deals-columns"
  const [activeSection, setActiveSection] = useState<SectionId>(initialSection)

  useEffect(() => {
    if (sectionParam && SETTINGS_SECTIONS.some((s) => s.id === sectionParam)) {
      setActiveSection(sectionParam as SectionId)
    }
  }, [sectionParam])
  const [dealOrderOpen, setDealOrderOpen] = useState(false)
  const { setTheme } = useTheme()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = settings.dealsColumnOrder.indexOf(active.id as DealsColumnKey)
    const newIndex = settings.dealsColumnOrder.indexOf(over.id as DealsColumnKey)
    const newOrder = arrayMove(settings.dealsColumnOrder, oldIndex, newIndex)
    reorderDealsColumns(newOrder)
  }

  const handleThemeChange = (theme: ThemeMode) => {
    updateAppearance({ theme })
    setTheme(theme)
  }

  return (
    <div className="container mx-auto py-10 px-4">
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold mb-3">
          Preferences
        </div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">Customize your CloseBoostAI experience</p>
      </div>

      <div className="flex gap-8">
        <nav className="w-56 shrink-0">
          <div className="space-y-1">
            {SETTINGS_SECTIONS.map((section) => {
              const Icon = section.icon
              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    activeSection === section.id
                      ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                      : "text-muted-foreground hover:bg-gray-100 hover:text-foreground dark:hover:bg-gray-800"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {section.label}
                  <ChevronRight
                    className={cn(
                      "ml-auto h-4 w-4 transition-opacity",
                      activeSection === section.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                </button>
              )
            })}
          </div>
        </nav>

        <div className="flex-1 min-w-0">
          {/* ── Deals Overview ── */}
          {activeSection === "deals-columns" && (
            <Card>
              <CardHeader>
                <CardTitle>Deals Overview</CardTitle>
                <CardDescription>
                  Configure the Deals Overview table
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="hide-closed-deals" className="text-base font-medium">
                      Hide Closed Deals
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Hide won and lost deals from the Deals Overview table
                    </p>
                  </div>
                  <Switch
                    id="hide-closed-deals"
                    checked={settings.dealsOverview.hideClosedDeals}
                    onCheckedChange={(checked) => updateDealsOverview({ hideClosedDeals: checked })}
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="horizontal-scroll" className="text-base font-medium">
                      Horizontal Scroll
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Allow the table to scroll left and right when columns overflow the screen
                    </p>
                  </div>
                  <Switch
                    id="horizontal-scroll"
                    checked={settings.dealsOverview.horizontalScroll}
                    onCheckedChange={(checked) => updateDealsOverview({ horizontalScroll: checked })}
                  />
                </div>

                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <button className="flex w-full items-center justify-between rounded-lg border p-4 hover:bg-muted/50 transition-colors cursor-pointer group">
                      <div className="flex items-center gap-3">
                        <Columns3 className="h-4 w-4 text-muted-foreground" />
                        <div className="text-left">
                          <p className="text-sm font-medium">Column Visibility & Order</p>
                          <p className="text-xs text-muted-foreground">
                            {Object.values(settings.dealsColumns).filter(Boolean).length} of{" "}
                            {Object.keys(settings.dealsColumns).length} columns visible
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className="text-xs text-muted-foreground group-hover:text-foreground transition-colors"
                          onClick={(e) => { e.stopPropagation(); resetDealsColumns(); }}
                        >
                          <Button variant="outline" size="sm" asChild tabIndex={-1}>
                            <span>
                              <RotateCcw className="h-4 w-4 mr-2" />
                              Reset
                            </span>
                          </Button>
                        </span>
                        <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
                      </div>
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-3">
                    <div className="space-y-4">
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                      >
                      <SortableContext
                        items={settings.dealsColumnOrder.filter((k) => settings.dealsColumns[k])}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="space-y-2">
                          {orderedDealsColumns
                            .filter((col) => settings.dealsColumns[col.key])
                            .map((col) => (
                              <SortableColumnItem
                                key={col.key}
                                column={col}
                                onRemove={() => updateDealsColumn(col.key, false)}
                              />
                            ))}
                        </div>
                        </SortableContext>
                      </DndContext>
                      {orderedDealsColumns.some((col) => !col.required && !settings.dealsColumns[col.key]) && (
                        <div className="pt-2 border-t">
                          <p className="text-xs font-medium text-muted-foreground mb-2">Add column</p>
                          <div className="flex flex-wrap gap-2">
                            {orderedDealsColumns
                              .filter((col) => !col.required && !settings.dealsColumns[col.key])
                              .map((col) => (
                                <Button
                                  key={col.key}
                                  variant="outline"
                                  size="sm"
                                  onClick={() => updateDealsColumn(col.key, true)}
                                  className="gap-1"
                                >
                                  <Plus className="h-3 w-3" />
                                  {col.label}
                                </Button>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="flex items-center gap-3">
                    <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">Custom Deal Order</p>
                      <p className="text-xs text-muted-foreground">
                        {settings.customDealOrder.length > 0
                          ? `${settings.customDealOrder.length} deals ordered`
                          : "No custom order set — using default"}
                      </p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setDealOrderOpen(true)}>
                    Edit Order
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <DealOrderDialog open={dealOrderOpen} onOpenChange={setDealOrderOpen} />

          {/* ── Statistics ── */}
          {activeSection === "statistics" && (
            <Card>
              <CardHeader>
                <CardTitle>Statistics</CardTitle>
                <CardDescription>
                  Configure the Statistics tab in Analytics
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="show-percentage" className="text-base font-medium">
                      Show percentage
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Display win rate percentage in the Closed Deals section
                    </p>
                  </div>
                  <Switch
                    id="show-percentage"
                    checked={settings.statistics.showPercentage}
                    onCheckedChange={(checked) => updateStatistics({ showPercentage: checked })}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Profile ── */}
          {activeSection === "profile" && (
            <Card>
              <CardHeader>
                <CardTitle>Profile</CardTitle>
                <CardDescription>
                  Your name and company info — used for emails, signatures, and across the app
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="rounded-lg border p-4 space-y-3">
                  <Label htmlFor="profile-name" className="text-base font-medium">
                    Your Name
                  </Label>
                  <Input
                    id="profile-name"
                    value={settings.profile.name}
                    onChange={(e) => updateProfile({ name: e.target.value })}
                    placeholder="e.g. John Smith"
                  />
                  <p className="text-sm text-muted-foreground">
                    Used in email signatures and generated content
                  </p>
                </div>

                <div className="rounded-lg border p-4 space-y-3">
                  <Label htmlFor="profile-company" className="text-base font-medium">
                    Company Name
                  </Label>
                  <Input
                    id="profile-company"
                    value={settings.profile.companyName}
                    onChange={(e) => updateProfile({ companyName: e.target.value })}
                    placeholder="e.g. Acme Inc"
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Team ── */}
          {activeSection === "team" && <TeamSection />}

          {/* ── Email Connections ── */}
          {activeSection === "email-connections" && <EmailConnectionsSection />}

          {/* ── Email Generator ── */}
          {activeSection === "email" && (
            <Card>
              <CardHeader>
                <CardTitle>Email Generator</CardTitle>
                <CardDescription>
                  Configure defaults for the email generator
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="rounded-lg border p-4 space-y-3">
                  <div className="space-y-0.5">
                    <Label htmlFor="signature" className="text-base font-medium">
                      Email Signature Name
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Replaces &quot;[Your name]&quot; at the end of generated emails. Leave blank to use your Profile name.
                    </p>
                  </div>
                  <Input
                    id="signature"
                    value={settings.email.signature}
                    onChange={(e) => updateEmailSettings({ signature: e.target.value })}
                    placeholder="e.g. John Smith"
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Tasks ── */}
          {activeSection === "tasks" && (
            <Card>
              <CardHeader>
                <CardTitle>Tasks</CardTitle>
                <CardDescription>
                  Configure defaults for task management
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label className="text-base font-medium">Tasks Layout</Label>
                    <p className="text-sm text-muted-foreground">
                      How Saved Tasks and Smart Recommendations are arranged
                    </p>
                  </div>
                  <Select
                    value={settings.tasks.layout}
                    onValueChange={(v) => updateTaskSettings({ layout: v as TasksLayout })}
                  >
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="topBottom">Top / Bottom</SelectItem>
                      <SelectItem value="sideBySide">Side by Side</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="show-completed" className="text-base font-medium">
                      Show Completed Tasks
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Display completed tasks in the tasks table
                    </p>
                  </div>
                  <Switch
                    id="show-completed"
                    checked={settings.tasks.showCompleted}
                    onCheckedChange={(checked) => updateTaskSettings({ showCompleted: checked })}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Account ── */}
          {activeSection === "account" && <AccountSection />}

          {/* ── Appearance ── */}
          {activeSection === "appearance" && (
            <Card>
              <CardHeader>
                <CardTitle>Appearance</CardTitle>
                <CardDescription>
                  Customize how CloseBoostAI looks
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label className="text-base font-medium">Theme</Label>
                    <p className="text-sm text-muted-foreground">
                      Choose between light, dark, or system theme
                    </p>
                  </div>
                  <Select
                    value={settings.appearance.theme}
                    onValueChange={(v) => handleThemeChange(v as ThemeMode)}
                  >
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light">Light</SelectItem>
                      <SelectItem value="dark">Dark</SelectItem>
                      <SelectItem value="system">System</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label className="text-base font-medium">Background</Label>
                    <p className="text-sm text-muted-foreground">
                      Plain, graph paper, or notebook style
                    </p>
                  </div>
                  <Select
                    value={settings.appearance.background ?? "graph"}
                    onValueChange={(v) => updateAppearance({ background: v as BackgroundMode })}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="plain">Plain</SelectItem>
                      <SelectItem value="graph">Graph Paper</SelectItem>
                      <SelectItem value="lined">Lined Paper</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
