'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { type Customer, type CRMLog, type Deal, getDealStageColor, getDealDisplayName, getDealStageLabel, UNIVERSAL_DEAL_STAGES, matchDealStage, htmlToPlainText } from '@/lib/utils';
import { Slider } from "@/components/ui/slider";
import { FileText, CheckSquare, Trash2, Pencil, ArrowUp, ArrowDown, ArrowUpDown, Mail, Phone, Calendar, Clock, Send, Sparkles, AlertTriangle, Eye, X, Target, Plus, Users, Inbox, Check, Reply, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  loadDeals,
  loadCustomers,
  loadLogs,
  loadTasks,
  loadDismissedRecommendations,
  saveDismissedRecommendations,
  saveTask as dbSaveTask,
  updateTask as dbUpdateTask,
  deleteTask as dbDeleteTask,
  deleteDeal as dbDeleteDeal,
  deleteCustomer as dbDeleteCustomer,
  updateDeal as dbUpdateDeal,
} from '@/lib/supabase/data';
import { useSettings, type DealsColumnKey } from '@/lib/settings-context';
import { createClient } from '@/lib/supabase/client';
import { DealDetailsDialog } from '@/components/deal-details-dialog';

type Task = {
  id: string;
  title: string;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'WAITING' | 'COMPLETED';
  dueDate: number;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  associatedDealId?: string;
  associatedDealName?: string;
  assignedTo: string;
  notes?: string;
  userId?: string;
};

type DealWithUserId = Deal & { userId?: string };

type OrgMember = { userId: string; email: string | null; fullName: string | null };

type TaskCategory = 'email' | 'call' | 'meeting' | 'follow_up' | 'update' | 'review' | 'proposal';

type SmartTask = {
  id: string;
  category: TaskCategory;
  title: string;
  description: string;
  reason: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  dueDate: number;
  dealId: string;
  dealName: string;
  dealCompany: string;
  dealAmount: number;
  dealStage: string;
  dealContact: string;
  dealEmail: string;
};

function getCategoryIcon(category: TaskCategory) {
  const icons = { email: Mail, call: Phone, meeting: Calendar, follow_up: Clock, update: Pencil, review: Eye, proposal: Send };
  return icons[category];
}

function getCategoryStyle(category: TaskCategory) {
  const styles: Record<TaskCategory, { color: string; bg: string; label: string }> = {
    email: { color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/30', label: 'Email' },
    call: { color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-900/30', label: 'Call' },
    meeting: { color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-900/30', label: 'Meeting' },
    follow_up: { color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-900/30', label: 'Follow Up' },
    update: { color: 'text-gray-600', bg: 'bg-gray-50 dark:bg-gray-800/50', label: 'Update' },
    review: { color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/30', label: 'Review' },
    proposal: { color: 'text-indigo-600', bg: 'bg-indigo-50 dark:bg-indigo-900/30', label: 'Proposal' },
  };
  return styles[category];
}

/** Check if deal stage indicates closed/won (handles "Won", "Closed Won", etc.) */
function isClosedWon(stage: string): boolean {
  const s = stage.toLowerCase().replace(/[\s_\-]/g, '');
  return s.includes('won') && !s.includes('lost');
}

/** Check if deal stage indicates closed/lost (handles "Lost", "Closed Lost", etc.) */
function isClosedLost(stage: string): boolean {
  const s = stage.toLowerCase().replace(/[\s_\-]/g, '');
  return s.includes('lost');
}

/** Check if deal is still in pipeline (not won or lost) */
function isInPipeline(stage: string): boolean {
  return !isClosedWon(stage) && !isClosedLost(stage);
}

/** Format amount for display in range labels (e.g. $1.5k, $50k, $1.2M) */
function formatDealAmount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'k';
  return Math.round(n).toLocaleString();
}

/** Build dynamic deal size ranges from actual data (quartile-based, adapts to user's deal sizes) */
function getDynamicDealSizeRanges(deals: Deal[]): Array<{ label: string; min?: number; max?: number; color: string }> {
  const amounts = deals.map(d => d.amount).filter(a => typeof a === 'number' && !isNaN(a)).sort((a, b) => a - b);
  if (amounts.length === 0) return [];

  const colors = ['bg-gray-600', 'bg-green-600', 'bg-blue-600', 'bg-purple-600'];
  const min = amounts[0]!;
  const max = amounts[amounts.length - 1]!;

  if (min === max) {
    return [{ label: `$${formatDealAmount(min)}`, min, max, color: colors[0]! }];
  }

  const p25Idx = Math.floor(amounts.length * 0.25);
  const p50Idx = Math.floor(amounts.length * 0.5);
  const p75Idx = Math.floor(amounts.length * 0.75);
  const p25 = amounts[p25Idx] ?? min;
  const p50 = amounts[p50Idx] ?? min;
  const p75 = amounts[p75Idx] ?? max;

  const ranges: Array<{ label: string; min?: number; max?: number; color: string }> = [];

  if (p25 > min) {
    ranges.push({ label: `Under $${formatDealAmount(p25)}`, max: p25, color: colors[0]! });
  }
  if (p50 > p25) {
    ranges.push({ label: `$${formatDealAmount(p25)}–$${formatDealAmount(p50)}`, min: p25, max: p50, color: colors[1]! });
  }
  if (p75 > p50) {
    ranges.push({ label: `$${formatDealAmount(p50)}–$${formatDealAmount(p75)}`, min: p50, max: p75, color: colors[2]! });
  }
  ranges.push({ label: `$${formatDealAmount(p75)}+`, min: p75, color: colors[3]! });

  return ranges;
}

function formatSmartDueDate(timestamp: number): string {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  const diffDays = Math.round((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < -1) return `${Math.abs(diffDays)}d overdue`;
  if (diffDays === -1) return 'Yesterday';
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays <= 7) return `In ${diffDays} days`;
  return new Date(timestamp).toLocaleDateString();
}

type InboundEmailForTasks = {
  senderEmail: string;
  subject: string;
  status: string;
  receivedAt: string;
};

function buildSmartTasks(deals: Deal[], inboundEmails: InboundEmailForTasks[] = []): SmartTask[] {
  const results: SmartTask[] = [];
  const now = Date.now();
  const pendingBySender = new Map<string, InboundEmailForTasks[]>();
  for (const em of inboundEmails) {
    if (em.status !== 'pending') continue;
    const sender = em.senderEmail.toLowerCase();
    if (!pendingBySender.has(sender)) pendingBySender.set(sender, []);
    pendingBySender.get(sender)!.push(em);
  }

  for (const deal of deals) {
    const stageLower = deal.stage.toLowerCase().replace(/[\s_\-]/g, '');
    if (stageLower === 'closedwon' || stageLower === 'closedlost') continue;

    const daysSinceActivity = deal.lastActivity
      ? Math.floor((now - new Date(deal.lastActivity).getTime()) / (1000 * 60 * 60 * 24))
      : 999;
    const isHighValue = deal.amount >= 20000;
    const base = {
      dealId: deal.id, dealName: getDealDisplayName(deal), dealCompany: deal.company || '',
      dealAmount: deal.amount, dealStage: deal.stage, dealContact: deal.contact, dealEmail: deal.email,
    };

    const staleThreshold = isHighValue ? 5 : 14;
    if (daysSinceActivity > staleThreshold) {
      results.push({
        id: `stale_${deal.id}`, category: 'email',
        title: daysSinceActivity > 30
          ? `Re-engage ${deal.contact} — deal at risk`
          : `Send follow-up email to ${deal.contact}`,
        description: `${getDealDisplayName(deal)} has had no activity in ${daysSinceActivity} days. Re-engage with a personalized follow-up.`,
        reason: `No activity in ${daysSinceActivity} days`,
        priority: isHighValue || daysSinceActivity > 21 ? 'HIGH' : daysSinceActivity > 14 ? 'MEDIUM' : 'LOW',
        dueDate: now, ...base,
      });
    }

    if (stageLower.includes('appointmentscheduled')) {
      results.push({
        id: `prep_${deal.id}`, category: 'meeting',
        title: `Prepare for meeting with ${deal.contact}`,
        description: `Review notes and prepare talking points for ${getDealDisplayName(deal)}.`,
        reason: 'Appointment scheduled — preparation needed',
        priority: isHighValue ? 'HIGH' : 'MEDIUM',
        dueDate: now + 86400000, ...base,
      });
    }

    if (stageLower.includes('qualifiedtobuy')) {
      results.push({
        id: `proposal_${deal.id}`, category: 'proposal',
        title: `Send proposal to ${deal.contact}`,
        description: `${deal.contact} at ${deal.company || getDealDisplayName(deal)} is qualified. Send a tailored proposal.`,
        reason: 'Qualified to buy — proposal needed',
        priority: isHighValue ? 'HIGH' : 'MEDIUM',
        dueDate: now + 86400000 * 2, ...base,
      });
    }

    if (stageLower.includes('presentationscheduled')) {
      results.push({
        id: `pres_${deal.id}`, category: 'meeting',
        title: `Prepare presentation for ${deal.company || deal.contact}`,
        description: `Build a customized presentation for ${getDealDisplayName(deal)} highlighting value propositions.`,
        reason: 'Presentation scheduled',
        priority: isHighValue ? 'HIGH' : 'MEDIUM',
        dueDate: now + 86400000, ...base,
      });
    }

    if (stageLower.includes('decisionmakerboughtin')) {
      results.push({
        id: `contract_${deal.id}`, category: 'proposal',
        title: `Send contract to ${deal.contact}`,
        description: `Decision maker is on board for ${getDealDisplayName(deal)}. Draft and send the contract to close.`,
        reason: 'Decision maker bought in — send contract',
        priority: 'HIGH',
        dueDate: now, ...base,
      });
    }

    if (stageLower.includes('contractsent')) {
      results.push({
        id: `cfollow_${deal.id}`, category: 'follow_up',
        title: `Follow up on contract with ${deal.contact}`,
        description: `Contract was sent for ${getDealDisplayName(deal)}. Check for questions or concerns.`,
        reason: 'Contract sent — awaiting response',
        priority: isHighValue ? 'HIGH' : 'MEDIUM',
        dueDate: now + 86400000 * 2, ...base,
      });
    }

    if (deal.email) {
      const pendingFromContact = pendingBySender.get(deal.email.toLowerCase());
      if (pendingFromContact?.length) {
        const recent = pendingFromContact.filter((em) => {
          const received = new Date(em.receivedAt).getTime();
          return now - received < 48 * 60 * 60 * 1000;
        });
        if (recent.length > 0) {
          const latest = recent.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())[0];
          results.push({
            id: `reply_${deal.id}`, category: 'email',
            title: `Reply to ${deal.contact} — they emailed you`,
            description: `${deal.contact} emailed about "${(latest.subject || '').slice(0, 60)}${(latest.subject || '').length > 60 ? '...' : ''}". Respond to keep the conversation moving.`,
            reason: 'Unreplied email from deal contact',
            priority: isHighValue ? 'HIGH' : 'MEDIUM',
            dueDate: now, ...base,
          });
        }
      }
    } else {
      results.push({
        id: `noemail_${deal.id}`, category: 'update',
        title: `Get email address for ${deal.contact}`,
        description: `Cannot send emails to ${deal.contact}. Look up or request their email address.`,
        reason: 'Missing contact email',
        priority: isHighValue ? 'MEDIUM' : 'LOW',
        dueDate: now + 86400000 * 3, ...base,
      });
    }

    if (isHighValue && daysSinceActivity > 3) {
      results.push({
        id: `hvreview_${deal.id}`, category: 'review',
        title: `Review strategy for ${getDealDisplayName(deal)}`,
        description: `$${deal.amount.toLocaleString()} deal needs attention. Review approach and next steps.`,
        reason: `High-value deal — $${deal.amount.toLocaleString()}`,
        priority: 'HIGH',
        dueDate: now, ...base,
      });
    }

    if (deal.closeDate) {
      const closeTs = new Date(deal.closeDate).getTime();
      const daysUntilClose = Math.floor((closeTs - now) / (1000 * 60 * 60 * 24));
      if (daysUntilClose < 0) {
        results.push({
          id: `overdue_${deal.id}`, category: 'update',
          title: `Update overdue deal: ${getDealDisplayName(deal)}`,
          description: `Close date was ${Math.abs(daysUntilClose)} days ago. Update stage or extend timeline.`,
          reason: `Close date passed ${Math.abs(daysUntilClose)} days ago`,
          priority: 'HIGH', dueDate: now, ...base,
        });
      } else if (daysUntilClose <= 7) {
        results.push({
          id: `closing_${deal.id}`, category: 'follow_up',
          title: `Push to close: ${getDealDisplayName(deal)}`,
          description: `Close date is in ${daysUntilClose} days. Take action to finalize this deal.`,
          reason: `Close date in ${daysUntilClose} days`,
          priority: 'HIGH', dueDate: now, ...base,
        });
      }
    }

    const notes = (deal.notes || '').toLowerCase();

    if (notes.includes('competitor') || notes.includes('alternative') || notes.includes('comparing')) {
      results.push({
        id: `comp_${deal.id}`, category: 'review',
        title: `Competitive analysis for ${getDealDisplayName(deal)}`,
        description: `Deal notes mention competitors. Prepare a comparison to strengthen your position.`,
        reason: 'Competitor mentioned in notes',
        priority: 'HIGH', dueDate: now + 86400000, ...base,
      });
    }

    if ((notes.includes('demo') || notes.includes('demonstration')) && !stageLower.includes('presentationscheduled')) {
      results.push({
        id: `demo_${deal.id}`, category: 'meeting',
        title: `Schedule demo for ${deal.contact}`,
        description: `Notes indicate interest in a product demo. Arrange a demonstration.`,
        reason: 'Demo interest in notes',
        priority: 'MEDIUM', dueDate: now + 86400000 * 2, ...base,
      });
    }

    if ((notes.includes('pricing') || notes.includes('quote') || notes.includes('cost')) &&
        !stageLower.includes('contractsent') && !stageLower.includes('decisionmakerboughtin')) {
      results.push({
        id: `pricing_${deal.id}`, category: 'proposal',
        title: `Send pricing to ${deal.contact}`,
        description: `${deal.contact} has inquired about pricing. Prepare and send a customized quote.`,
        reason: 'Pricing inquiry in notes',
        priority: 'HIGH', dueDate: now + 86400000, ...base,
      });
    }

    if (notes.includes('call back') || notes.includes('callback') || notes.includes('call me') || notes.includes('phone')) {
      results.push({
        id: `call_${deal.id}`, category: 'call',
        title: `Call ${deal.contact}`,
        description: `Notes indicate a call is needed regarding ${getDealDisplayName(deal)}.`,
        reason: 'Call requested in notes',
        priority: 'MEDIUM', dueDate: now, ...base,
      });
    }

    if (notes.includes('urgent') || notes.includes('asap') || notes.includes('immediately')) {
      results.push({
        id: `urgent_${deal.id}`, category: 'follow_up',
        title: `Urgent: Respond to ${deal.contact}`,
        description: `Notes contain urgent language for ${getDealDisplayName(deal)}. Prioritize immediately.`,
        reason: 'Urgent language in notes',
        priority: 'HIGH', dueDate: now, ...base,
      });
    }

    if (notes.includes('referral') || notes.includes('introduction') || notes.includes('introduce')) {
      results.push({
        id: `referral_${deal.id}`, category: 'email',
        title: `Send referral email for ${getDealDisplayName(deal)}`,
        description: `Notes mention a referral or introduction opportunity. Draft an email.`,
        reason: 'Referral opportunity in notes',
        priority: 'MEDIUM', dueDate: now + 86400000, ...base,
      });
    }
  }

  const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  results.sort((a, b) => {
    if (priorityOrder[a.priority] !== priorityOrder[b.priority])
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    return a.dueDate - b.dueDate;
  });

  const seen = new Set<string>();
  return results.filter(t => { if (seen.has(t.id)) return false; seen.add(t.id); return true; });
}

export default function AnalyticsPage() {
  const { settings, orderedDealsColumns } = useSettings();
  const cols = settings.dealsColumns;
  const visibleColumns = orderedDealsColumns.filter((c) => cols[c.key]);
  const [sortColumn, setSortColumn] = useState<DealsColumnKey | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [activeTab, setActiveTab] = useState("deals");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [logs, setLogs] = useState<CRMLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [generatedEmail, setGeneratedEmail] = useState('');
  const [generating, setGenerating] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [progress, setProgress] = useState(0);
  const [emailTone, setEmailTone] = useState<number>(0);
  const [dismissedTaskIds, setDismissedTaskIds] = useState<Set<string>>(new Set());
  const [taskCategoryFilter, setTaskCategoryFilter] = useState<TaskCategory | 'all'>('all');
  const [showAllSmartTasks, setShowAllSmartTasks] = useState(false);
  const [completedTasksOpen, setCompletedTasksOpen] = useState(false);
  const [taskSortColumn, setTaskSortColumn] = useState<'title' | 'status' | 'dueDate' | 'deal' | 'assignedTo' | null>(null);
  const [taskSortDirection, setTaskSortDirection] = useState<'asc' | 'desc'>('asc');
  const [emailTaskTarget, setEmailTaskTarget] = useState<SmartTask | null>(null);
  const [taskEmailContent, setTaskEmailContent] = useState('');
  const [generatingTaskEmail, setGeneratingTaskEmail] = useState(false);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [savingDeal, setSavingDeal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editTaskDialogOpen, setEditTaskDialogOpen] = useState(false);
  const [confirmTaskDelete, setConfirmTaskDelete] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const [isOrgLeader, setIsOrgLeader] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [memberFilter, setMemberFilter] = useState<string | null>(null);
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [dealDetailsOpen, setDealDetailsOpen] = useState(false);
  const [dealDetailsDeal, setDealDetailsDeal] = useState<Deal | null>(null);
  const [inboundEmails, setInboundEmails] = useState<Array<{
    id: string;
    senderEmail: string;
    senderName: string | null;
    toEmail: string;
    subject: string;
    bodyText: string | null;
    bodyHtml: string | null;
    dealId: string | null;
    dealName: string | null;
    status: 'pending' | 'acknowledged' | 'replied';
    receivedAt: string;
  }>>([]);
  const [inboundEmailsLoading, setInboundEmailsLoading] = useState(false);
  const [inboundEmailSyncing, setInboundEmailSyncing] = useState(false);
  const [inboundEmailFilter, setInboundEmailFilter] = useState<'all' | 'pending' | 'acknowledged' | 'replied'>('all');
  const [generatingReplyForId, setGeneratingReplyForId] = useState<string | null>(null);
  const [sendingReplyForId, setSendingReplyForId] = useState<string | null>(null);
  const [generatedReplyForId, setGeneratedReplyForId] = useState<string | null>(null);
  const [generatedReplyText, setGeneratedReplyText] = useState('');

  const filteredDeals = useMemo(() => {
    if (!memberFilter || !currentUserId) return deals;
    return deals.filter((d) => {
      const uid = (d as DealWithUserId).userId;
      if (!uid) return true;
      return memberFilter === 'me' ? uid === currentUserId : uid === memberFilter;
    });
  }, [deals, memberFilter, currentUserId]);

  const filteredTasks = useMemo(() => {
    if (!memberFilter || !currentUserId) return tasks;
    return tasks.filter((t) => {
      const uid = t.userId;
      if (!uid) return true;
      return memberFilter === 'me' ? uid === currentUserId : uid === memberFilter;
    });
  }, [tasks, memberFilter, currentUserId]);

  const getMemberLabel = useCallback((userId: string) => {
    if (userId === currentUserId) return 'Me';
    const m = orgMembers.find((x) => x.userId === userId);
    return m?.fullName || m?.email || 'Unknown';
  }, [currentUserId, orgMembers]);

  const smartTasks = useMemo(
    () => buildSmartTasks(
      filteredDeals,
      inboundEmails.map((e) => ({
        senderEmail: e.senderEmail,
        subject: e.subject,
        status: e.status,
        receivedAt: e.receivedAt,
      }))
    ),
    [filteredDeals, inboundEmails]
  );
  const visibleSmartTasks = useMemo(() => {
    let filtered = smartTasks.filter(t => !dismissedTaskIds.has(t.id));
    if (taskCategoryFilter !== 'all') filtered = filtered.filter(t => t.category === taskCategoryFilter);
    return filtered;
  }, [smartTasks, dismissedTaskIds, taskCategoryFilter]);

  const insights = useMemo(() => {
    const now = Date.now();
    const msPerDay = 1000 * 60 * 60 * 24;
    const getDaysSince = (d: Deal) => {
      const ts = d.lastActivity ? new Date(d.lastActivity).getTime() : (d.closeDate ? new Date(d.closeDate).getTime() : now);
      return Math.floor((now - ts) / msPerDay);
    };

    const activeDeals = filteredDeals.filter(d => isInPipeline(d.stage));
    const closedDeals = filteredDeals.filter(d => isClosedWon(d.stage) || isClosedLost(d.stage));
    const wonDeals = filteredDeals.filter(d => isClosedWon(d.stage));
    const winRate = closedDeals.length > 0 ? Math.round(wonDeals.length / closedDeals.length * 100) : 0;
    const pipelineValue = activeDeals.reduce((s, d) => s + d.amount, 0);

    const actionItems = activeDeals
      .map(d => ({ ...d, daysSinceActivity: getDaysSince(d) }))
      .filter(d => d.daysSinceActivity > 7 || (d.amount >= 15000 && d.daysSinceActivity > 3))
      .sort((a, b) => {
        const scoreA = (a.amount / 1000) + (a.daysSinceActivity * 2);
        const scoreB = (b.amount / 1000) + (b.daysSinceActivity * 2);
        return scoreB - scoreA;
      });

    const dealsByStage = filteredDeals.reduce((acc: { [key: string]: { count: number; value: number } }, d) => {
      if (!acc[d.stage]) acc[d.stage] = { count: 0, value: 0 };
      acc[d.stage].count++;
      acc[d.stage].value += d.amount;
      return acc;
    }, {});

    const topOpportunities = [...activeDeals].sort((a, b) => b.amount - a.amount).slice(0, 5);

    return { actionItems, dealsByStage, topOpportunities, pipelineValue, winRate, activeCount: activeDeals.length };
  }, [filteredDeals]);

  const topScrollRef = useRef<HTMLDivElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const [tableScrollWidth, setTableScrollWidth] = useState(0);
  const syncing = useRef(false);

  const emailGenScrollRef = useRef<HTMLDivElement>(null);
  const emailGenTopScrollRef = useRef<HTMLDivElement>(null);
  const [emailGenScrollWidth, setEmailGenScrollWidth] = useState(0);
  const [emailGenClientWidth, setEmailGenClientWidth] = useState(0);
  const emailSyncing = useRef(false);

  const syncEmailTopScroll = useCallback(() => {
    if (emailSyncing.current) return;
    emailSyncing.current = true;
    if (emailGenScrollRef.current && emailGenTopScrollRef.current) {
      emailGenScrollRef.current.scrollLeft = emailGenTopScrollRef.current.scrollLeft;
    }
    emailSyncing.current = false;
  }, []);

  const syncEmailScroll = useCallback(() => {
    if (emailSyncing.current) return;
    emailSyncing.current = true;
    if (emailGenTopScrollRef.current && emailGenScrollRef.current) {
      emailGenTopScrollRef.current.scrollLeft = emailGenScrollRef.current.scrollLeft;
    }
    emailSyncing.current = false;
  }, []);

  const syncTopScroll = useCallback(() => {
    if (syncing.current) return;
    syncing.current = true;
    if (tableScrollRef.current && topScrollRef.current) {
      tableScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft;
    }
    syncing.current = false;
  }, []);

  const syncTableScroll = useCallback(() => {
    if (syncing.current) return;
    syncing.current = true;
    if (topScrollRef.current && tableScrollRef.current) {
      topScrollRef.current.scrollLeft = tableScrollRef.current.scrollLeft;
    }
    syncing.current = false;
  }, []);

  useEffect(() => {
    if (!settings.dealsOverview.horizontalScroll) return;
    const el = tableScrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setTableScrollWidth(el.scrollWidth);
    });
    observer.observe(el);
    setTableScrollWidth(el.scrollWidth);
    return () => observer.disconnect();
  }, [settings.dealsOverview.horizontalScroll, visibleColumns.length, filteredDeals.length]);

  useEffect(() => {
    const el = emailGenScrollRef.current;
    if (!el) return;
    const update = () => {
      setEmailGenScrollWidth(el.scrollWidth);
      setEmailGenClientWidth(el.clientWidth);
    };
    const observer = new ResizeObserver(update);
    observer.observe(el);
    update();
    return () => observer.disconnect();
  }, [activeTab, filteredDeals.length]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        const userId = user?.id ?? null;

        const [orgRes, customersData, logsData, dismissedIds, inboundRes] = await Promise.all([
          fetch('/api/org'),
          loadCustomers(),
          loadLogs(),
          loadDismissedRecommendations(),
          fetch('/api/org/inbound-emails?status=pending&limit=100'),
        ]);
        const orgData = await orgRes.json();
        const role = orgData?.membership?.role;
        const leader = !orgData?.error && (role === 'owner' || role === 'admin');

        setCurrentUserId(userId);
        setIsOrgLeader(leader);

        if (leader) {
          const [dealsRes, tasksRes] = await Promise.all([
            fetch('/api/org/deals'),
            fetch('/api/org/tasks'),
          ]);
          const dealsJson = await dealsRes.json();
          const tasksJson = await tasksRes.json();
          if (dealsJson.error || tasksJson.error) {
            toast.error(dealsJson.error || tasksJson.error || 'Error loading org data');
            setDeals([]);
            setTasks([]);
            setOrgMembers([]);
          } else {
            const orgDeals = (dealsJson.deals || []).map((d: { id: string; name: string; company: string; stage: string; owner: string; contact: string; amount: number; contactId: string; notes: string; closeDate: string; email: string; lastActivity: string; userId: string }) => ({
              id: d.id,
              name: d.name,
              company: d.company,
              stage: d.stage,
              owner: d.owner,
              contact: d.contact,
              amount: d.amount,
              contactId: d.contactId,
              notes: d.notes,
              closeDate: d.closeDate,
              email: d.email,
              lastActivity: d.lastActivity,
              userId: d.userId,
            }));
            const orgTasks = (tasksJson.tasks || []).map((t: { id: string; title: string; status: string; dueDate: number; priority: string; associatedDealId?: string; associatedDealName?: string; assignedTo: string; notes?: string; userId: string }) => ({
              id: t.id,
              title: t.title,
              status: t.status as Task['status'],
              dueDate: t.dueDate,
              priority: t.priority as Task['priority'],
              associatedDealId: t.associatedDealId,
              associatedDealName: t.associatedDealName,
              assignedTo: t.assignedTo,
              notes: t.notes,
              userId: t.userId,
            }));
            setDeals(orgDeals);
            setTasks(orgTasks);
            setOrgMembers(dealsJson.members || tasksJson.members || []);
          }
        } else {
          const [dealsData, tasksData] = await Promise.all([
            loadDeals(),
            loadTasks(),
          ]);

          setDeals(dealsData);
          setTasks(tasksData);
        }

        setCustomers(customersData);
        setLogs(logsData);
        setDismissedTaskIds(new Set(dismissedIds));
        try {
          const inboundJson = await inboundRes.json();
          if (inboundJson.emails) setInboundEmails(inboundJson.emails);
        } catch { /* ignore */ }

        // One-time migration: if Supabase was empty but localStorage had data, persist it
        if (typeof window !== 'undefined' && dismissedIds.length === 0) {
          try {
            const stored = localStorage.getItem('closeboost-dismissed-tasks');
            if (stored) {
              const ids = JSON.parse(stored) as string[];
              if (ids.length > 0) {
                await saveDismissedRecommendations(ids);
                setDismissedTaskIds(new Set(ids));
                localStorage.removeItem('closeboost-dismissed-tasks');
              }
            }
          } catch { /* ignore migration errors */ }
        }
      } catch (error) {
        console.error('Error loading data:', error);
        toast.error('Error loading data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const fetchInboundOnly = useCallback(async () => {
    const params = inboundEmailFilter !== 'all' ? `?status=${inboundEmailFilter}` : '';
    const res = await fetch(`/api/org/inbound-emails${params}`);
    const data = await res.json();
    if (data.error) {
      if (data.error === 'Not in an organization') setInboundEmails([]);
      else toast.error(data.error);
    } else {
      setInboundEmails(data.emails || []);
    }
  }, [inboundEmailFilter]);

  const refreshInbound = useCallback(async () => {
    if (activeTab !== 'inbox') return;
    setInboundEmailSyncing(true);
    try {
      await fetchInboundOnly();
    } catch {
      toast.error('Failed to load emails');
    } finally {
      setInboundEmailSyncing(false);
    }
  }, [activeTab, fetchInboundOnly]);

  useEffect(() => {
    if (activeTab !== 'inbox') return;
    setInboundEmailsLoading(true);
    fetchInboundOnly()
      .catch(() => toast.error('Failed to load emails'))
      .finally(() => setInboundEmailsLoading(false));
  }, [activeTab, inboundEmailFilter, fetchInboundOnly]);

  if (loading) {
    return (
      <div className="container mx-auto py-10 px-4">
        <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4">
          <div className="h-10 w-10 rounded-full border-4 border-primary/30 border-t-primary animate-spin" />
          <h1 className="font-heading text-2xl font-bold tracking-tight text-muted-foreground">Loading analytics...</h1>
        </div>
      </div>
    );
  }

  const getToneDescription = (value: number | null) => {
    if (value === null) return "Select tone";
    if (value === 0) return "Very Warm";
    if (value === 33) return "Professional";
    if (value === 67) return "Direct";
    if (value === 100) return "Very Direct";
    if (value < 17) return "Very Warm";
    if (value < 50) return "Professional";
    if (value < 84) return "Direct";
    return "Very Direct";
  };

  const generateEmail = async (customer: Customer | null) => {
    if (!customer || emailTone === null) return;
    
    setGenerating(true);
    setSelectedCustomer(customer);
    setProgress(0);
    
    try {
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 500);

      const toneValue = Number(emailTone);

      let toneInstructions = '';
      if (toneValue === 0) {
        toneInstructions = `TONE: VERY WARM
- Greeting: "Hey [Name],"
- Style: Casual, friendly, uses contractions
- Body: 4-5 lines
- Closing: "Best," or "Thanks,"`;
      } else if (toneValue === 33) {
        toneInstructions = `TONE: PROFESSIONAL
- Greeting: "Hi [Name],"
- Style: Balanced, courteous, no slang
- Body: 4-5 lines
- Closing: "Best regards,"`;
      } else if (toneValue === 67) {
        toneInstructions = `TONE: DIRECT
- Greeting: "Hi [Name],"
- Style: Clear, focused, no-nonsense
- Body: 4-5 lines
- Closing: "Best,"`;
      } else {
        toneInstructions = `TONE: VERY DIRECT
- Greeting: "[Name]," or "Hi [Name],"
- Style: Extremely direct, zero fluff
- Body: 3-4 lines total
- Closing: "Best,"`;
      }

      const systemMessage = `You are an AI email writer for sales follow-ups. Every email you generate MUST follow this exact 3-part structure in the body:

1. CHRIS VOSS LABEL: Open with exactly one sentence starting with "It seems like...", "It sounds like...", or "It looks like..." that names the prospect's current situation, emotion, or concern. This is a labeling technique — you are mirroring what the prospect is likely feeling or experiencing.

2. JEREMY MINER LINE: Follow with exactly one sentence that creates curiosity or validates the prospect. Use phrasing like "I'm curious whether...", "What I'm wondering is...", or "I'm wondering if...". This line should gently move toward a next step without being pushy.

3. NO-ORIENTED QUESTION: End the body with exactly one of these four questions (choose whichever fits the context best):
   - "Is now a bad time to talk?"
   - "Are you opposed to [specific action]?"
   - "Are you against [specific action]?"
   - "Have you given up on this project?" (ONLY use this if the prospect has been very disconnected or unresponsive for a long time)

${toneInstructions}

STRICTLY FORBIDDEN (never include any of these):
- "Looking forward to connecting with you"
- "Hope you're doing well" as an opener
- "I hope this email finds you well"
- "It was great speaking with you"
- "Dear [Name]"
- Any yes-oriented question (e.g. "Would you be open to..." or "Is now a good time?")
- Multiple paragraphs or long explanations
- Post scripts or contact details in the body

OUTPUT: The complete email only — greeting, body (label → Miner line → no-oriented question), closing, and "[Your name]". No commentary, no subject line.`;

      const response = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            {
              role: "system",
              content: systemMessage
            },
            {
              role: "user",
              content: `Generate a follow-up email for this prospect:
Name: ${customer.name}
Company: ${customer.company}
Status: ${customer.status}
Next Action: ${customer.nextAction}
Deal Value: $${customer.value}
Recent Interactions: ${customer.interactions.map(i => i.notes).join(', ')}`
            }
          ]
        })
      });

      if (!response.ok) throw new Error('Failed to generate email');

      const result = await response.json();
      let generatedText = '';
      
      if (result.choices?.[0]?.message?.content) {
        generatedText = result.choices[0].message.content;
      } else {
        throw new Error('Unexpected API response format');
      }

      const signOff = settings.email.signature || settings.profile.name;
      if (signOff) {
        generatedText = generatedText.replace(/\[Your name\]/gi, signOff);
      }

      clearInterval(progressInterval);
      setProgress(100);
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
      setGeneratedEmail(generatedText);
      toast.success('Email generated successfully!');
    } catch (error) {
      console.error('Error generating email:', error);
      toast.error('Failed to generate email. Please try again.');
    } finally {
      setGenerating(false);
      setProgress(0);
    }
  };

  const handleSaveSmartTask = async (smartTask: SmartTask) => {
    try {
      const deal = filteredDeals.find(d => d.id === smartTask.dealId);
      const newTask: Task = {
        id: 'task_' + Math.random().toString(36).substr(2, 9),
        title: smartTask.title,
        status: 'NOT_STARTED',
        dueDate: smartTask.dueDate,
        priority: 'MEDIUM',
        associatedDealId: smartTask.dealId,
        associatedDealName: smartTask.dealName,
        assignedTo: deal?.owner || '',
        notes: `${smartTask.description}\n\nReason: ${smartTask.reason}`,
      };
      await dbSaveTask(newTask);
      setTasks(prev => [...prev, newTask]);
      handleDismissSmartTask(smartTask.id);
      toast.success('Task saved');
    } catch (error) {
      console.error('Error saving task:', error);
      toast.error('Failed to save task');
    }
  };

  const handleDismissSmartTask = async (taskId: string) => {
    const next = new Set(dismissedTaskIds);
    next.add(taskId);
    setDismissedTaskIds(next);
    try {
      await saveDismissedRecommendations([...next]);
    } catch (error) {
      console.error('Error saving dismissed:', error);
      setDismissedTaskIds(dismissedTaskIds); // revert on error
    }
  };

  const handleClearDismissed = async () => {
    setDismissedTaskIds(new Set());
    try {
      await saveDismissedRecommendations([]);
    } catch (error) {
      console.error('Error clearing dismissed:', error);
    }
  };

  const handleGenerateTaskEmail = async (task: SmartTask) => {
    setEmailTaskTarget(task);
    setGeneratingTaskEmail(true);
    setTaskEmailContent('');
    try {
      const deal = filteredDeals.find(d => d.id === task.dealId);
      const toneValue = Number(emailTone);
      let toneInstructions = '';
      if (toneValue === 0) {
        toneInstructions = `TONE: VERY WARM\n- Greeting: "Hey [Name],"\n- Style: Casual, friendly, uses contractions\n- Body: 4-5 lines\n- Closing: "Best," or "Thanks,"`;
      } else if (toneValue === 33) {
        toneInstructions = `TONE: PROFESSIONAL\n- Greeting: "Hi [Name],"\n- Style: Balanced, courteous, no slang\n- Body: 4-5 lines\n- Closing: "Best regards,"`;
      } else if (toneValue === 67) {
        toneInstructions = `TONE: DIRECT\n- Greeting: "Hi [Name],"\n- Style: Clear, focused, no-nonsense\n- Body: 4-5 lines\n- Closing: "Best,"`;
      } else {
        toneInstructions = `TONE: VERY DIRECT\n- Greeting: "[Name]," or "Hi [Name],"\n- Style: Extremely direct, zero fluff\n- Body: 3-4 lines total\n- Closing: "Best,"`;
      }

      const systemMessage = `You are an AI email writer for sales follow-ups. Every email you generate MUST follow this exact 3-part structure in the body:

1. CHRIS VOSS LABEL: Open with exactly one sentence starting with "It seems like...", "It sounds like...", or "It looks like..." that names the prospect's current situation, emotion, or concern. This is a labeling technique — you are mirroring what the prospect is likely feeling or experiencing.

2. JEREMY MINER LINE: Follow with exactly one sentence that creates curiosity or validates the prospect. Use phrasing like "I'm curious whether...", "What I'm wondering is...", or "I'm wondering if...". This line should gently move toward a next step without being pushy.

3. NO-ORIENTED QUESTION: End the body with exactly one of these four questions (choose whichever fits the context best):
   - "Is now a bad time to talk?"
   - "Are you opposed to [specific action]?"
   - "Are you against [specific action]?"
   - "Have you given up on this project?" (ONLY use this if the prospect has been very disconnected or unresponsive for a long time)

${toneInstructions}

STRICTLY FORBIDDEN (never include any of these):
- "Looking forward to connecting with you"
- "Hope you're doing well" as an opener
- "I hope this email finds you well"
- "It was great speaking with you"
- "Dear [Name]"
- Any yes-oriented question (e.g. "Would you be open to..." or "Is now a good time?")
- Multiple paragraphs or long explanations
- Post scripts or contact details in the body

OUTPUT: The complete email only — greeting, body (label → Miner line → no-oriented question), closing, and "[Your name]". No commentary, no subject line.`;

      const response = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: "system", content: systemMessage },
            {
              role: "user",
              content: `Generate a follow-up email for this prospect:\nName: ${task.dealContact}\nCompany: ${deal?.company || task.dealName}\nDeal Stage: ${task.dealStage}\nDeal Value: $${task.dealAmount}\nNotes: ${deal?.notes || 'No notes available'}\nLast Activity: ${deal?.lastActivity || 'Unknown'}\nContext: ${task.description}\nReason for outreach: ${task.reason}`
            }
          ]
        })
      });

      if (!response.ok) throw new Error('Failed to generate email');
      const result = await response.json();
      let text = result.choices?.[0]?.message?.content || '';
      const signOff = settings.email.signature || settings.profile.name;
      if (signOff) {
        text = text.replace(/\[Your name\]/gi, signOff);
      }
      setTaskEmailContent(text);
      toast.success('Email generated!');
    } catch (error) {
      console.error('Error:', error);
      toast.error('Failed to generate email');
    } finally {
      setGeneratingTaskEmail(false);
    }
  };

  const handleUpdateTask = async (taskId: string, updates: Partial<Task>) => {
    try {
      await dbUpdateTask(taskId, updates);
      const updatedTasks = tasks.map(t => 
        t.id === taskId ? { ...t, ...updates } : t
      );
      setTasks(updatedTasks);
      toast.success('Task updated');
    } catch (error) {
      console.error('Error updating task:', error);
      toast.error('Failed to update task');
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      await dbDeleteTask(taskId);
      setTasks(tasks.filter(t => t.id !== taskId));
      setEditTaskDialogOpen(false);
      setEditingTask(null);
      setConfirmTaskDelete(false);
      toast.success('Task deleted');
    } catch (error) {
      console.error('Error deleting task:', error);
      toast.error('Failed to delete task');
    }
  };

  const openEditTaskDialog = (task: Task) => {
    setEditingTask({ ...task });
    setConfirmTaskDelete(false);
    setEditTaskDialogOpen(true);
  };

  const handleSaveEditedTask = async () => {
    if (!editingTask) return;
    setSavingTask(true);
    try {
      await dbUpdateTask(editingTask.id, editingTask);
      setTasks(tasks.map(t => t.id === editingTask.id ? editingTask : t));
      setEditTaskDialogOpen(false);
      setEditingTask(null);
      toast.success('Task updated');
    } catch (error) {
      console.error('Error updating task:', error);
      toast.error('Failed to update task');
    } finally {
      setSavingTask(false);
    }
  };

  const handleDeleteDeal = async (dealId: string) => {
    try {
      await dbDeleteDeal(dealId);
      await dbDeleteCustomer(dealId); // Customer shares id with deal
      setDeals(deals.filter(d => d.id !== dealId));
      setCustomers(customers.filter(c => c.id !== dealId));
      setEditDialogOpen(false);
      setEditingDeal(null);
      setConfirmDelete(false);
      toast.success('Deal deleted');
    } catch (error) {
      console.error('Error deleting deal:', error);
      toast.error('Failed to delete deal');
    }
  };

  const openEditDialog = (deal: Deal) => {
    setEditingDeal({ ...deal });
    setConfirmDelete(false);
    setEditDialogOpen(true);
  };

  const handleSaveDeal = async () => {
    if (!editingDeal) return;
    setSavingDeal(true);
    try {
      await dbUpdateDeal(editingDeal.id, editingDeal);
      setDeals(deals.map(d => d.id === editingDeal.id ? editingDeal : d));
      setEditDialogOpen(false);
      setEditingDeal(null);
      toast.success('Deal updated');
    } catch (error) {
      console.error('Error updating deal:', error);
      toast.error('Failed to update deal');
    } finally {
      setSavingDeal(false);
    }
  };

  return (
    <div className="container mx-auto py-10 px-4">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-10">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold mb-4">
            Dashboard
          </div>
          <h1 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight text-foreground">CRM Analytics</h1>
          <p className="text-muted-foreground mt-2">Pipeline, tasks & AI-powered insights</p>
        </div>
        {isOrgLeader && orgMembers.length > 1 && (
          <div className="flex items-center gap-2 shrink-0">
            <Users className="h-4 w-4 text-muted-foreground" />
            <Select value={memberFilter ?? 'all'} onValueChange={(v) => setMemberFilter(v === 'all' ? null : v)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by member" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All members</SelectItem>
                <SelectItem value="me">Me</SelectItem>
                {orgMembers
                  .filter((m) => m.userId !== currentUserId)
                  .map((m) => (
                    <SelectItem key={m.userId} value={m.userId}>
                      {getMemberLabel(m.userId)}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-muted/50 border-2 border-border p-1.5 h-auto flex-wrap gap-1">
          <TabsTrigger 
            value="deals" 
            className="font-heading text-sm font-medium px-4 py-2.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md rounded-md transition-all"
          >
            Deals
          </TabsTrigger>
          <TabsTrigger 
            value="tasks" 
            className="font-heading text-sm font-medium px-4 py-2.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md rounded-md transition-all"
          >
            Tasks
          </TabsTrigger>
          <TabsTrigger 
            value="inbox" 
            className="font-heading text-sm font-medium px-4 py-2.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md rounded-md transition-all"
          >
            Client Inbox
          </TabsTrigger>
          <TabsTrigger 
            value="emails" 
            className="font-heading text-sm font-medium px-4 py-2.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md rounded-md transition-all"
          >
            Email Generator
          </TabsTrigger>
          <TabsTrigger 
            value="stats" 
            className="font-heading text-sm font-medium px-4 py-2.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md rounded-md transition-all"
          >
            Statistics & Insights
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="deals">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle className="font-heading">Deals Overview</CardTitle>
                <CardDescription>
                  View and manage your deals pipeline
                </CardDescription>
              </div>
              <Link href="/upload">
                <Button size="sm" variant="outline" className="gap-1.5 shrink-0">
                  <Plus className="h-4 w-4" />
                  Add deals
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {settings.dealsOverview.horizontalScroll && (
                <div
                  ref={topScrollRef}
                  onScroll={syncTopScroll}
                  className="overflow-x-auto overflow-y-hidden mb-0 scrollbar-light"
                >
                  <div style={{ width: tableScrollWidth, height: 1 }} />
                </div>
              )}
              <div
                ref={tableScrollRef}
                onScroll={settings.dealsOverview.horizontalScroll ? syncTableScroll : undefined}
                className={settings.dealsOverview.horizontalScroll ? "overflow-x-auto scrollbar-hidden" : ""}
              >
              <Table
                className={settings.dealsOverview.horizontalScroll ? "whitespace-nowrap" : ""}
                wrapperClassName={settings.dealsOverview.horizontalScroll ? "!overflow-visible" : ""}
              >
                <TableHeader>
                  <TableRow>
                    {visibleColumns.map((col) => {
                      const sortable = !["notes", "actions"].includes(col.key);
                      const isActive = sortColumn === col.key;

                      const handleSort = () => {
                        if (!sortable) return;
                        if (!isActive) {
                          setSortColumn(col.key);
                          setSortDirection("asc");
                        } else if (sortDirection === "asc") {
                          setSortDirection("desc");
                        } else {
                          setSortColumn(null);
                        }
                      };

                      return (
                        <TableHead key={col.key}>
                          {sortable ? (
                            <button
                              onClick={handleSort}
                              className="flex items-center gap-1 hover:text-foreground transition-colors -my-1"
                            >
                              {col.label}
                              {isActive && sortDirection === "asc" ? (
                                <ArrowUp className="h-3.5 w-3.5 text-blue-600" />
                              ) : isActive && sortDirection === "desc" ? (
                                <ArrowDown className="h-3.5 w-3.5 text-blue-600" />
                              ) : (
                                <ArrowUpDown className="h-3.5 w-3.5 opacity-30" />
                              )}
                            </button>
                          ) : (
                            col.label
                          )}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(() => {
                    let sortedDeals = settings.dealsOverview.hideClosedDeals
                      ? (filteredDeals ?? []).filter((d) => isInPipeline(d.stage))
                      : [...(filteredDeals ?? [])];

                    if (sortColumn) {
                      const dir = sortDirection === "asc" ? 1 : -1;

                      sortedDeals.sort((a, b) => {
                        let av: string | number, bv: string | number;
                        switch (sortColumn) {
                          case "dealName": av = getDealDisplayName(a).toLowerCase(); bv = getDealDisplayName(b).toLowerCase(); break;
                          case "company": av = (a.company || "").toLowerCase(); bv = (b.company || "").toLowerCase(); break;
                          case "contact": av = a.contact.toLowerCase(); bv = b.contact.toLowerCase(); break;
                          case "email": av = (a.email || "").toLowerCase(); bv = (b.email || "").toLowerCase(); break;
                          case "dealStage": av = a.stage.toLowerCase(); bv = b.stage.toLowerCase(); break;
                          case "dealOwner": av = a.owner.toLowerCase(); bv = b.owner.toLowerCase(); break;
                          case "amount": av = a.amount; bv = b.amount; break;
                          case "lastActivity":
                            av = a.lastActivity ? new Date(a.lastActivity).getTime() : 0;
                            bv = b.lastActivity ? new Date(b.lastActivity).getTime() : 0;
                            break;
                          default: return 0;
                        }
                        if (av < bv) return -1 * dir;
                        if (av > bv) return 1 * dir;
                        return 0;
                      });
                    } else if (settings.customDealOrder.length > 0) {
                      const orderMap = new Map(settings.customDealOrder.map((id, i) => [id, i]));
                      sortedDeals.sort((a, b) => {
                        const ai = orderMap.get(a.id) ?? Infinity;
                        const bi = orderMap.get(b.id) ?? Infinity;
                        return ai - bi;
                      });
                    } else if (settings.dealsOverview.dealStages.length > 0) {
                      const stageOrder = new Map(settings.dealsOverview.dealStages.map((k, i) => [k, i]));
                      sortedDeals.sort((a, b) => {
                        const aKey = matchDealStage(a.stage) ?? '';
                        const bKey = matchDealStage(b.stage) ?? '';
                        const ai = stageOrder.get(aKey) ?? Infinity;
                        const bi = stageOrder.get(bKey) ?? Infinity;
                        return ai - bi;
                      });
                    }

                    return sortedDeals;
                  })().map((deal) => (
                    <TableRow key={deal.id}>
                      {visibleColumns.map((col) => {
                        switch (col.key) {
                          case "dealName":
                            return (
                              <TableCell key={col.key} className="font-medium">
                                <button
                                  type="button"
                                  onClick={() => { setDealDetailsDeal(deal); setDealDetailsOpen(true); }}
                                  className="text-primary hover:underline text-left"
                                >
                                  {getDealDisplayName(deal)}
                                </button>
                              </TableCell>
                            )
                          case "company":
                            return (
                              <TableCell key={col.key}>
                                <button
                                  type="button"
                                  onClick={() => { setDealDetailsDeal(deal); setDealDetailsOpen(true); }}
                                  className="text-primary hover:underline text-left"
                                >
                                  {deal.company || <span className="text-gray-400 italic">N/A</span>}
                                </button>
                              </TableCell>
                            )
                          case "contact":
                            return (
                              <TableCell key={col.key}>
                                <button
                                  type="button"
                                  onClick={() => { setDealDetailsDeal(deal); setDealDetailsOpen(true); }}
                                  className="text-primary hover:underline text-left"
                                >
                                  {deal.contact}
                                </button>
                              </TableCell>
                            )
                          case "email":
                            return <TableCell key={col.key}>{deal.email || <span className="text-gray-400 italic">—</span>}</TableCell>
                          case "dealStage":
                            return (
                              <TableCell key={col.key}>
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getDealStageColor(deal.stage).bg} ${getDealStageColor(deal.stage).text}`}>
                                  {deal.stage}
                                </span>
                              </TableCell>
                            )
                          case "dealOwner":
                            return <TableCell key={col.key}>{deal.owner}</TableCell>
                          case "amount":
                            return (
                              <TableCell key={col.key} className="font-medium">
                                ${deal.amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                              </TableCell>
                            )
                          case "lastActivity":
                            return (
                              <TableCell key={col.key}>
                                {deal.lastActivity ? (
                                  <span className="text-sm">
                                    {new Date(deal.lastActivity).toLocaleDateString()}
                                  </span>
                                ) : (
                                  <span className="text-gray-400 italic text-sm">N/A</span>
                                )}
                              </TableCell>
                            )
                          case "notes":
                            return (
                              <TableCell key={col.key}>
                                <Dialog>
                                  <DialogTrigger asChild>
                                    <Button 
                                      variant="ghost" 
                                      size="icon"
                                      onClick={() => setSelectedDeal(deal)}
                                    >
                                      <FileText className="h-4 w-4" />
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent className="max-w-2xl">
                                    <DialogHeader>
                                      <DialogTitle>Deal Notes - {getDealDisplayName(deal)}</DialogTitle>
                                      <DialogDescription>
                                        Stage: {deal.stage} | Owner: {deal.owner} | Amount: ${Number(deal.amount).toLocaleString()}
                                      </DialogDescription>
                                    </DialogHeader>
                                    <ScrollArea className="h-[300px] w-full rounded-md border p-4">
                                      <div className="whitespace-pre-wrap font-mono text-sm bg-muted/50 rounded-md p-3">
                                        {deal.notes}
                                      </div>
                                    </ScrollArea>
                                  </DialogContent>
                                </Dialog>
                              </TableCell>
                            )
                          case "actions":
                            return (
                              <TableCell key={col.key}>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => openEditDialog(deal)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            )
                          default:
                            return null
                        }
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>

              <Dialog open={editDialogOpen} onOpenChange={(open) => {
                setEditDialogOpen(open);
                if (!open) {
                  setEditingDeal(null);
                  setConfirmDelete(false);
                }
              }}>
                <DialogContent className="max-w-lg">
                  {editingDeal && !confirmDelete && (
                    <>
                      <DialogHeader>
                        <DialogTitle>Edit Deal</DialogTitle>
                        <DialogDescription>
                          Update deal details or delete this deal.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto pr-2">
                        <div className="grid grid-cols-4 items-center gap-4">
                          <Label className="text-right">Name</Label>
                          <Input
                            className="col-span-3"
                            value={editingDeal.name}
                            onChange={(e) => setEditingDeal({ ...editingDeal, name: e.target.value })}
                          />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                          <Label className="text-right">Company</Label>
                          <Input
                            className="col-span-3"
                            value={editingDeal.company}
                            onChange={(e) => setEditingDeal({ ...editingDeal, company: e.target.value })}
                          />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                          <Label className="text-right">Contact</Label>
                          <Input
                            className="col-span-3"
                            value={editingDeal.contact}
                            onChange={(e) => setEditingDeal({ ...editingDeal, contact: e.target.value })}
                          />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                          <Label className="text-right">Email</Label>
                          <Input
                            className="col-span-3"
                            value={editingDeal.email}
                            onChange={(e) => setEditingDeal({ ...editingDeal, email: e.target.value })}
                          />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                          <Label className="text-right">Stage</Label>
                          <div className="col-span-3">
                            <Select
                              value={(() => {
                                const normalized = getDealStageLabel(editingDeal.stage);
                                const configuredLabels = settings.dealsOverview.dealStages.length > 0
                                  ? settings.dealsOverview.dealStages
                                      .map((k) => UNIVERSAL_DEAL_STAGES.find((x) => x.key === k)?.label)
                                      .filter(Boolean) as string[]
                                  : UNIVERSAL_DEAL_STAGES.map((s) => s.label);
                                return configuredLabels.includes(normalized) ? normalized : editingDeal.stage;
                              })()}
                              onValueChange={(value) => setEditingDeal({ ...editingDeal, stage: value })}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {(() => {
                                  const configuredStages = settings.dealsOverview.dealStages.length > 0
                                    ? settings.dealsOverview.dealStages
                                        .map((key) => UNIVERSAL_DEAL_STAGES.find((x) => x.key === key))
                                        .filter(Boolean) as typeof UNIVERSAL_DEAL_STAGES
                                    : UNIVERSAL_DEAL_STAGES;
                                  const labels = new Set(configuredStages.map((s) => s.label));
                                  const items = configuredStages.map((s) => (
                                    <SelectItem key={s.key} value={s.label}>{s.label}</SelectItem>
                                  ));
                                  if (editingDeal.stage && !labels.has(editingDeal.stage)) {
                                    items.unshift(
                                      <SelectItem key="current" value={editingDeal.stage}>{editingDeal.stage}</SelectItem>
                                    );
                                  }
                                  return items;
                                })()}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                          <Label className="text-right">Owner</Label>
                          <Input
                            className="col-span-3"
                            value={editingDeal.owner}
                            onChange={(e) => setEditingDeal({ ...editingDeal, owner: e.target.value })}
                          />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                          <Label className="text-right">Amount</Label>
                          <Input
                            className="col-span-3"
                            type="number"
                            value={editingDeal.amount}
                            onChange={(e) => setEditingDeal({ ...editingDeal, amount: Number(e.target.value) })}
                          />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                          <Label className="text-right">Last Activity</Label>
                          <div className="col-span-3 flex gap-2">
                            <Input
                              type="date"
                              value={editingDeal.lastActivity ? editingDeal.lastActivity.split('T')[0] : ''}
                              onChange={(e) => setEditingDeal({ ...editingDeal, lastActivity: e.target.value })}
                              className="flex-1"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setEditingDeal({
                                ...editingDeal,
                                lastActivity: new Date().toISOString().split('T')[0]
                              })}
                            >
                              Today
                            </Button>
                          </div>
                        </div>
                        <div className="grid grid-cols-4 items-start gap-4">
                          <Label className="text-right pt-2">Notes</Label>
                          <Textarea
                            className="col-span-3 min-h-[80px]"
                            value={editingDeal.notes}
                            onChange={(e) => setEditingDeal({ ...editingDeal, notes: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="flex justify-between mt-2">
                        <Button
                          variant="destructive"
                          onClick={() => setConfirmDelete(true)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </Button>
                        <div className="flex gap-3">
                          <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                            Cancel
                          </Button>
                          <Button onClick={handleSaveDeal} disabled={savingDeal}>
                            {savingDeal ? 'Saving...' : 'Save Changes'}
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                  {editingDeal && confirmDelete && (
                    <>
                      <DialogHeader>
                        <DialogTitle>Delete Deal</DialogTitle>
                        <DialogDescription>
                          Are you sure you want to delete &quot;{editingDeal.name}&quot;? This action cannot be undone.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="flex justify-end gap-3 mt-4">
                        <Button variant="outline" onClick={() => setConfirmDelete(false)}>
                          Cancel
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={() => handleDeleteDeal(editingDeal.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </>
                  )}
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tasks">
          <div className="space-y-6">
            {(() => {
              const activeTasks = filteredTasks.filter(t => t.status !== 'COMPLETED');
              const completedTasks = filteredTasks.filter(t => t.status === 'COMPLETED');
              const sortTasks = (tasks: Task[]) =>
                [...tasks].sort((a, b) => {
                  if (!taskSortColumn) return 0;
                  const dir = taskSortDirection === 'asc' ? 1 : -1;
                  const statusOrder: Record<string, number> = { NOT_STARTED: 0, IN_PROGRESS: 1, WAITING: 2, COMPLETED: 3 };
                  let av: string | number, bv: string | number;
                  switch (taskSortColumn) {
                    case 'title': av = a.title.toLowerCase(); bv = b.title.toLowerCase(); break;
                    case 'status': av = statusOrder[a.status]; bv = statusOrder[b.status]; break;
                    case 'dueDate': av = a.dueDate; bv = b.dueDate; break;
                    case 'deal': av = (a.associatedDealName || '').toLowerCase(); bv = (b.associatedDealName || '').toLowerCase(); break;
                    case 'assignedTo': av = a.assignedTo.toLowerCase(); bv = b.assignedTo.toLowerCase(); break;
                    default: return 0;
                  }
                  if (av < bv) return -1 * dir;
                  if (av > bv) return 1 * dir;
                  return 0;
                });
              const activeTasksByCompany = Object.entries(
                sortTasks(activeTasks).reduce<Record<string, Task[]>>((acc, t) => {
                  const key = t.associatedDealName?.trim() || 'Unassigned';
                  if (!acc[key]) acc[key] = [];
                  acc[key].push(t);
                  return acc;
                }, {})
              ).sort(([a], [b]) => (a === 'Unassigned' ? 1 : b === 'Unassigned' ? -1 : a.localeCompare(b)));
              const completedTasksByCompany = Object.entries(
                sortTasks(completedTasks).reduce<Record<string, Task[]>>((acc, t) => {
                  const key = t.associatedDealName?.trim() || 'Unassigned';
                  if (!acc[key]) acc[key] = [];
                  acc[key].push(t);
                  return acc;
                }, {})
              ).sort(([a], [b]) => (a === 'Unassigned' ? 1 : b === 'Unassigned' ? -1 : a.localeCompare(b)));

              const renderTaskRow = (task: Task) => (
                <div key={task.id} className="flex items-center gap-3 py-2 px-3 rounded-md border bg-card">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{task.title}</p>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                      <span className={task.dueDate < Date.now() && task.status !== 'COMPLETED' ? 'text-red-600 font-medium' : ''}>
                        {formatSmartDueDate(task.dueDate)}
                      </span>
                      <span>·</span>
                      <span>{task.assignedTo || '—'}</span>
                    </div>
                  </div>
                  <Select
                    value={task.status}
                    onValueChange={(value: Task['status']) => handleUpdateTask(task.id, { status: value })}
                  >
                    <SelectTrigger className="w-[130px] h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NOT_STARTED">Not Started</SelectItem>
                      <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                      <SelectItem value="WAITING">Waiting</SelectItem>
                      <SelectItem value="COMPLETED">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => openEditTaskDialog(task)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              );

              const savedTasksSection = (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="font-heading text-lg">Saved Tasks</CardTitle>
                    <CardDescription>
                      {filteredTasks.length === 0
                        ? 'No saved tasks yet — save recommendations below to track them here'
                        : `${activeTasks.length} active${completedTasks.length > 0 ? `, ${completedTasks.length} completed` : ''}`}
                    </CardDescription>
                  </CardHeader>
                  {activeTasks.length > 0 && (
                    <CardContent className="pt-0">
                      <div className="space-y-3">
                        {activeTasksByCompany.map(([groupLabel, tasks]) => (
                          <div key={groupLabel} className="space-y-1.5">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
                              {groupLabel}
                              {tasks.length > 1 && (
                                <span className="font-normal normal-case ml-1">({tasks.length})</span>
                              )}
                            </p>
                            <div className="space-y-1">{tasks.map(t => renderTaskRow(t))}</div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  )}
                </Card>
              );

              const completedTasksSection = completedTasks.length > 0 && (
                <Collapsible open={completedTasksOpen} onOpenChange={setCompletedTasksOpen} className="mb-4">
                  <CollapsibleTrigger asChild>
                    <Button variant="outline" className="w-full justify-between h-11 font-medium">
                      <span className="flex items-center gap-2">
                        <CheckSquare className="h-4 w-4 opacity-60" />
                        Completed Tasks ({completedTasks.length})
                      </span>
                      {completedTasksOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <Card className="mt-2">
                      <CardContent className="pt-4">
                        <div className="space-y-3">
                          {completedTasksByCompany.map(([groupLabel, tasks]) => (
                            <div key={groupLabel} className="space-y-1.5 opacity-75">
                              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
                                {groupLabel}
                                {tasks.length > 1 && (
                                  <span className="font-normal normal-case ml-1">({tasks.length})</span>
                                )}
                              </p>
                              <div className="space-y-1">{tasks.map(t => renderTaskRow(t))}</div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </CollapsibleContent>
                </Collapsible>
              );

              const smartTasksSection = (
                <div className="space-y-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="font-heading flex items-center gap-2 text-lg">
                            <Sparkles className="h-4 w-4 text-blue-500" />
                            Recommendations
                          </CardTitle>
                          <CardDescription>
                            Based on deal stage, activity, notes, and close dates
                          </CardDescription>
                        </div>
                        {dismissedTaskIds.size > 0 && (
                          <Button variant="ghost" size="sm" onClick={handleClearDismissed} className="text-muted-foreground text-xs">
                            Reset dismissed ({dismissedTaskIds.size})
                          </Button>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                        <div className="p-2.5 rounded-lg border border-border/80 bg-card">
                          <p className="font-heading text-xl font-bold">{visibleSmartTasks.length}</p>
                          <p className="text-[11px] text-muted-foreground">Recommendations</p>
                        </div>
                        <div className="p-2.5 rounded-lg border border-border/80 bg-card">
                          <p className="font-heading text-xl font-bold text-red-600">
                            {visibleSmartTasks.filter(t => t.dueDate <= Date.now()).length}
                          </p>
                          <p className="text-[11px] text-muted-foreground">Due Today</p>
                        </div>
                        <div className="p-2.5 rounded-lg border border-border/80 bg-card">
                          <p className="font-heading text-xl font-bold text-blue-600">
                            {filteredTasks.filter(t => t.status !== 'COMPLETED').length}
                          </p>
                          <p className="text-[11px] text-muted-foreground">Saved Tasks</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <Button
                          variant={taskCategoryFilter === 'all' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setTaskCategoryFilter('all')}
                        >
                          All ({smartTasks.filter(t => !dismissedTaskIds.has(t.id)).length})
                        </Button>
                        {(['email', 'call', 'meeting', 'follow_up', 'update', 'review', 'proposal'] as TaskCategory[]).map(cat => {
                          const style = getCategoryStyle(cat);
                          const CatIcon = getCategoryIcon(cat);
                          const count = smartTasks.filter(t => t.category === cat && !dismissedTaskIds.has(t.id)).length;
                          if (count === 0) return null;
                          return (
                            <Button
                              key={cat}
                              variant={taskCategoryFilter === cat ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => setTaskCategoryFilter(cat)}
                            >
                              <CatIcon className="h-3.5 w-3.5 mr-1.5" />
                              {style.label} ({count})
                            </Button>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>

                  {visibleSmartTasks.length > 0 ? (
                    <Card className="mt-6 border-2 shadow-sm">
                      <CardContent className="pt-6 pb-6">
                        <div className="space-y-2">
                      {(() => {
                        const tasksToShow = showAllSmartTasks ? visibleSmartTasks : visibleSmartTasks.slice(0, 20);
                        const getRecGroupLabel = (t: SmartTask) =>
                          (t.dealName || t.dealCompany || t.dealContact || 'Other').trim() || 'Other';
                        const recsByCompany = Object.entries(
                          tasksToShow.reduce<Record<string, SmartTask[]>>((acc, t) => {
                            const key = getRecGroupLabel(t);
                            if (!acc[key]) acc[key] = [];
                            acc[key].push(t);
                            return acc;
                          }, {})
                        ).sort(([a], [b]) => (a === 'Other' ? 1 : b === 'Other' ? -1 : a.localeCompare(b)));

                        const renderRecTask = (task: SmartTask) => {
                          const CatIcon = getCategoryIcon(task.category);
                          const style = getCategoryStyle(task.category);
                          const isOverdue = task.dueDate <= Date.now();
                          const stageColor = getDealStageColor(task.dealStage);
                          return (
                            <div key={task.id} className="border rounded-lg p-3 hover:shadow-sm transition-shadow bg-card">
                              <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-lg ${style.bg} shrink-0`}>
                                  <CatIcon className={`h-4 w-4 ${style.color}`} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h4 className="font-medium text-sm truncate">{task.title}</h4>
                                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                                    <span>${task.dealAmount.toLocaleString()}</span>
                                    <span>·</span>
                                    <span className={`px-1.5 py-0.5 rounded-full ${stageColor.bg} ${stageColor.text}`}>
                                      {task.dealStage}
                                    </span>
                                    <span>·</span>
                                    <span className={isOverdue ? 'text-red-600 font-medium' : ''}>
                                      {formatSmartDueDate(task.dueDate)}
                                    </span>
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                    <AlertTriangle className="h-3 w-3 shrink-0" />
                                    {task.reason}
                                  </p>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  {task.category === 'email' && task.dealEmail && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleGenerateTaskEmail(task)}
                                      className="text-blue-600 hover:text-blue-700 h-8 text-xs"
                                    >
                                      <Mail className="h-3.5 w-3.5 mr-1" />
                                      Email
                                    </Button>
                                  )}
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleSaveSmartTask(task)}
                                    className="text-green-600 hover:text-green-700 h-8 text-xs"
                                  >
                                    <CheckSquare className="h-3.5 w-3.5 mr-1" />
                                    Save
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleDismissSmartTask(task.id)}
                                    className="text-muted-foreground h-8 w-8 p-0"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          );
                        };

                        return (
                          <>
                            {recsByCompany.map(([groupLabel, companyTasks]) => (
                              <div key={groupLabel} className="space-y-1.5">
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1 pt-1">
                                  {groupLabel}
                                  {companyTasks.length > 1 && (
                                    <span className="font-normal normal-case ml-1">({companyTasks.length})</span>
                                  )}
                                </p>
                                <div className="space-y-2">
                                  {companyTasks.map(task => renderRecTask(task))}
                                </div>
                              </div>
                            ))}
                            {!showAllSmartTasks && visibleSmartTasks.length > 20 && (
                              <Button
                                variant="ghost"
                                className="w-full text-muted-foreground hover:text-foreground"
                                onClick={() => setShowAllSmartTasks(true)}
                              >
                                Show {visibleSmartTasks.length - 20} more recommendations
                              </Button>
                            )}
                            {showAllSmartTasks && visibleSmartTasks.length > 20 && (
                              <Button
                                variant="ghost"
                                className="w-full text-muted-foreground hover:text-foreground"
                                onClick={() => setShowAllSmartTasks(false)}
                              >
                                Show less
                              </Button>
                            )}
                          </>
                        );
                      })()}
                        </div>
                      </CardContent>
                    </Card>
                  ) : (
                    <Card>
                      <CardContent className="py-8">
                        <div className="text-center text-muted-foreground">
                          <CheckSquare className="h-10 w-10 mx-auto mb-3 opacity-20" />
                          <p className="font-medium">
                            {filteredDeals.length === 0 ? 'No deals found' : 'All caught up!'}
                          </p>
                          <p className="text-sm mt-1">
                            {filteredDeals.length === 0
                              ? 'Upload your CRM data to get task recommendations.'
                              : dismissedTaskIds.size > 0
                                ? 'You\'ve addressed all recommendations. Click "Reset dismissed" to see them again.'
                                : 'No action items needed for your current pipeline.'}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              );

              if (settings.tasks.layout === 'sideBySide') {
                return (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div>{savedTasksSection}</div>
                    <div className="space-y-4">
                      {completedTasksSection}
                      {smartTasksSection}
                    </div>
                  </div>
                );
              }

              return (
                <div className="space-y-6">
                  {savedTasksSection}
                  {completedTasksSection}
                  {smartTasksSection}
                </div>
              );
            })()}

            <Dialog open={editTaskDialogOpen} onOpenChange={(open) => {
              setEditTaskDialogOpen(open);
              if (!open) { setEditingTask(null); setConfirmTaskDelete(false); }
            }}>
              <DialogContent className="max-w-lg">
                {editingTask && !confirmTaskDelete && (
                  <>
                    <DialogHeader>
                      <DialogTitle>Edit Task</DialogTitle>
                      <DialogDescription>
                        Update task details or delete this task.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto pr-2">
                      <div className="grid grid-cols-4 items-center gap-4">
                        <Label className="text-right">Title</Label>
                        <Input
                          className="col-span-3"
                          value={editingTask.title}
                          onChange={(e) => setEditingTask({ ...editingTask, title: e.target.value })}
                        />
                      </div>
                      <div className="grid grid-cols-4 items-center gap-4">
                        <Label className="text-right">Status</Label>
                        <div className="col-span-3">
                          <Select
                            value={editingTask.status}
                            onValueChange={(value: Task['status']) => setEditingTask({ ...editingTask, status: value })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="NOT_STARTED">Not Started</SelectItem>
                              <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                              <SelectItem value="WAITING">Waiting</SelectItem>
                              <SelectItem value="COMPLETED">Completed</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="grid grid-cols-4 items-center gap-4">
                        <Label className="text-right">Due Date</Label>
                        <Input
                          className="col-span-3"
                          type="date"
                          value={new Date(editingTask.dueDate).toISOString().split('T')[0]}
                          onChange={(e) => setEditingTask({ ...editingTask, dueDate: new Date(e.target.value).getTime() })}
                        />
                      </div>
                      <div className="grid grid-cols-4 items-center gap-4">
                        <Label className="text-right">Assigned To</Label>
                        <Input
                          className="col-span-3"
                          value={editingTask.assignedTo}
                          onChange={(e) => setEditingTask({ ...editingTask, assignedTo: e.target.value })}
                        />
                      </div>
                      <div className="grid grid-cols-4 items-start gap-4">
                        <Label className="text-right pt-2">Notes</Label>
                        <Textarea
                          className="col-span-3 min-h-[80px]"
                          value={editingTask.notes || ''}
                          onChange={(e) => setEditingTask({ ...editingTask, notes: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="flex justify-between mt-2">
                      <Button
                        variant="destructive"
                        onClick={() => setConfirmTaskDelete(true)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </Button>
                      <div className="flex gap-3">
                        <Button variant="outline" onClick={() => setEditTaskDialogOpen(false)}>
                          Cancel
                        </Button>
                        <Button onClick={handleSaveEditedTask} disabled={savingTask}>
                          {savingTask ? 'Saving...' : 'Save Changes'}
                        </Button>
                      </div>
                    </div>
                  </>
                )}
                {editingTask && confirmTaskDelete && (
                  <>
                    <DialogHeader>
                      <DialogTitle>Delete Task</DialogTitle>
                      <DialogDescription>
                        Are you sure you want to delete &quot;{editingTask.title}&quot;? This action cannot be undone.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="flex justify-end gap-3 mt-4">
                      <Button variant="outline" onClick={() => setConfirmTaskDelete(false)}>
                        Cancel
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => handleDeleteTask(editingTask.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </>
                )}
              </DialogContent>
            </Dialog>

            <Dialog open={!!emailTaskTarget} onOpenChange={(open) => { if (!open) { setEmailTaskTarget(null); setTaskEmailContent(''); } }}>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Generated Email</DialogTitle>
                  <DialogDescription>
                    {emailTaskTarget && `Email for ${emailTaskTarget.dealContact} — ${emailTaskTarget.dealName}`}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  {generatingTaskEmail ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-3">
                      <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
                      <p className="text-sm text-muted-foreground">Generating personalized email...</p>
                    </div>
                  ) : taskEmailContent ? (
                    <>
                      <div className="rounded-lg border p-4 bg-muted/50 min-h-[200px]">
                        <pre className="whitespace-pre-wrap font-sans text-sm">{taskEmailContent}</pre>
                      </div>
                      <div className="flex justify-end gap-3">
                        <Button variant="outline" onClick={() => setTaskEmailContent('')}>Clear</Button>
                        <Button
                          variant="outline"
                          onClick={() => emailTaskTarget && handleGenerateTaskEmail(emailTaskTarget)}
                          disabled={generatingTaskEmail}
                        >
                          Regenerate
                        </Button>
                        <Button
                          className="bg-green-600 hover:bg-green-700 text-white"
                          onClick={() => {
                            navigator.clipboard.writeText(taskEmailContent);
                            toast.success('Email copied to clipboard!');
                          }}
                        >
                          Copy
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-center py-12 text-muted-foreground">
                      Preparing email generation...
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </TabsContent>

        <TabsContent value="inbox">
          <Card>
            <CardHeader>
              <CardTitle className="font-heading flex items-center gap-2">
                <Inbox className="h-5 w-5" />
                Client Inbox
              </CardTitle>
              <CardDescription>
                Emails from clients and prospects sent to your company email. Acknowledge and track how to respond.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 mb-4">
                <Select value={inboundEmailFilter} onValueChange={(v) => setInboundEmailFilter(v as typeof inboundEmailFilter)}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All emails</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="acknowledged">Acknowledged</SelectItem>
                    <SelectItem value="replied">Replied</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refreshInbound()}
                  disabled={inboundEmailSyncing || inboundEmailsLoading}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${inboundEmailSyncing ? 'animate-spin' : ''}`} />
                  {inboundEmailSyncing ? 'Loading...' : 'Refresh emails'}
                </Button>
              </div>
              {inboundEmailsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="h-8 w-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                </div>
              ) : inboundEmails.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Inbox className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p className="font-medium">No client emails yet</p>
                  <p className="text-sm mt-1">Connect your Gmail or Outlook in Settings, then click Refresh to load emails.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {inboundEmails.map((email) => (
                    <div
                      key={email.id}
                      className="border rounded-lg p-4 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">
                              {email.senderName || email.senderEmail}
                            </span>
                            {email.senderName && (
                              <span className="text-sm text-muted-foreground">{email.senderEmail}</span>
                            )}
                            {email.dealName && (
                              <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary">
                                Deal: {email.dealName}
                              </span>
                            )}
                          </div>
                          <p className="text-sm font-medium mt-1 truncate">{email.subject || '(no subject)'}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {new Date(email.receivedAt).toLocaleString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-4 shrink-0">
                          <span className={`text-xs px-2 py-1 rounded ${
                            email.status === 'pending' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200' :
                            email.status === 'acknowledged' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200' :
                            'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200'
                          }`}>
                            {email.status}
                          </span>
                          {email.status !== 'acknowledged' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={async () => {
                                try {
                                  const res = await fetch(`/api/org/inbound-emails/${email.id}`, {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ status: 'acknowledged' }),
                                  });
                                  const data = await res.json();
                                  if (res.status === 404) {
                                    toast.error(data.error || 'Email not found—refreshing inbox.');
                                    fetchInboundOnly();
                                    return;
                                  }
                                  if (data.error) throw new Error(data.error);
                                  setInboundEmails((prev) =>
                                    prev.map((e) => (e.id === email.id ? { ...e, status: 'acknowledged' as const } : e))
                                  );
                                  toast.success('Marked as acknowledged');
                                } catch (e: any) {
                                  toast.error(e?.message || 'Failed to update');
                                }
                              }}
                            >
                              <Check className="h-4 w-4 mr-1" />
                              Acknowledge
                            </Button>
                          )}
                          {email.status !== 'replied' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={async () => {
                                try {
                                  const res = await fetch(`/api/org/inbound-emails/${email.id}`, {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ status: 'replied' }),
                                  });
                                  const data = await res.json();
                                  if (res.status === 404) {
                                    toast.error(data.error || 'Email not found—refreshing inbox.');
                                    fetchInboundOnly();
                                    return;
                                  }
                                  if (data.error) throw new Error(data.error);
                                  setInboundEmails((prev) =>
                                    prev.map((e) => (e.id === email.id ? { ...e, status: 'replied' as const } : e))
                                  );
                                  toast.success('Marked as replied');
                                } catch (e: any) {
                                  toast.error(e?.message || 'Failed to update');
                                }
                              }}
                            >
                              <Reply className="h-4 w-4 mr-1" />
                              Mark replied
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setGeneratedReplyForId(email.id);
                              setGeneratedReplyText('');
                            }}
                          >
                            <Pencil className="h-4 w-4 mr-1" />
                            Compose
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              setGeneratingReplyForId(email.id);
                              setGeneratedReplyForId(null);
                              setGeneratedReplyText('');
                              try {
                                const res = await fetch('/api/ai/generate-email-reply', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ emailId: email.id }),
                                });
                                const data = await res.json();
                                if (data.error) throw new Error(data.error);
                                setGeneratedReplyForId(email.id);
                                setGeneratedReplyText(data.reply || '');
                              } catch (e: any) {
                                toast.error(e.message || 'Failed to generate reply');
                              } finally {
                                setGeneratingReplyForId(null);
                              }
                            }}
                            disabled={generatingReplyForId === email.id}
                          >
                            {generatingReplyForId === email.id ? (
                              <span className="animate-pulse">Generating...</span>
                            ) : (
                              <>
                                <Sparkles className="h-4 w-4 mr-1" />
                                Generate reply
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                      {generatedReplyForId === email.id && (
                        <div className="mt-3 pt-3 border-t">
                          <p className="text-sm font-medium mb-2">Reply (edit before sending)</p>
                          <Textarea
                            value={generatedReplyText}
                            onChange={(e) => setGeneratedReplyText(e.target.value)}
                            className="min-h-[120px] font-sans text-sm resize-y"
                            placeholder="Edit your reply..."
                          />
                          <div className="flex gap-2 mt-2 flex-wrap">
                            <Button
                              size="sm"
                              onClick={async () => {
                                setSendingReplyForId(email.id);
                                try {
                                  const res = await fetch('/api/org/send-email-reply', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ emailId: email.id, replyBody: generatedReplyText }),
                                  });
                                  const data = await res.json();
                                  if (data.error) throw new Error(data.error);
                                  setInboundEmails((prev) =>
                                    prev.map((e) => (e.id === email.id ? { ...e, status: 'replied' as const } : e))
                                  );
                                  setGeneratedReplyForId(null);
                                  setGeneratedReplyText('');
                                  toast.success('Reply sent');
                                } catch (e: any) {
                                  toast.error(e?.message || 'Failed to send');
                                } finally {
                                  setSendingReplyForId(null);
                                }
                              }}
                              disabled={sendingReplyForId === email.id || !generatedReplyText.trim()}
                            >
                              {sendingReplyForId === email.id ? (
                                <span className="animate-pulse">Sending...</span>
                              ) : (
                                <>
                                  <Send className="h-4 w-4 mr-1" />
                                  Send reply
                                </>
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                navigator.clipboard.writeText(generatedReplyText);
                                toast.success('Reply copied to clipboard');
                              }}
                              disabled={!generatedReplyText.trim()}
                            >
                              Copy
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => { setGeneratedReplyForId(null); setGeneratedReplyText(''); }}>
                              Dismiss
                            </Button>
                          </div>
                        </div>
                      )}
                      {(email.bodyText || email.bodyHtml) && (
                        <div className="mt-2 pt-2 border-t text-sm text-muted-foreground line-clamp-3">
                          {htmlToPlainText(email.bodyText || email.bodyHtml || '').slice(0, 350)}
                          {htmlToPlainText(email.bodyText || email.bodyHtml || '').length > 350 ? '...' : ''}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="emails">
          <Card>
            <CardHeader>
              <CardTitle className="font-heading">Email Generator</CardTitle>
              <CardDescription>
                Generate personalized follow-up emails for your deals
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-6">
                <label className="text-sm font-medium">Email Tone</label>
                <div className="flex items-center gap-4 mt-2">
                  <Slider
                    value={[emailTone]}
                    onValueChange={(value) => setEmailTone(value[0])}
                    max={100}
                    step={33}
                    className="w-full max-w-md"
                  />
                  <span className="text-sm text-muted-foreground shrink-0">
                    {getToneDescription(emailTone)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-6 min-w-0">
                {/* Left panel: max 2/3, scrollbar at top when content overflows */}
                <div className="min-w-0 flex flex-col">
                  {emailGenClientWidth > 0 && emailGenScrollWidth > emailGenClientWidth && (
                    <div
                      ref={emailGenTopScrollRef}
                      onScroll={syncEmailTopScroll}
                      className="overflow-x-auto overflow-y-hidden mb-0 scrollbar-light shrink-0"
                    >
                      <div style={{ width: Math.max(1, emailGenScrollWidth), height: 1 }} />
                    </div>
                  )}
                  <div
                    ref={emailGenScrollRef}
                    onScroll={syncEmailScroll}
                    className="overflow-x-auto scrollbar-hidden min-w-0 flex-1"
                  >
                    <div className="border rounded-lg p-4 inline-block min-w-max">
                      <Table className="whitespace-nowrap">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Deal</TableHead>
                        <TableHead>Contact</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredDeals.map((deal) => (
                        <TableRow key={deal.id}>
                          <TableCell className="font-medium">
                            <button
                              type="button"
                              onClick={() => { setDealDetailsDeal(deal); setDealDetailsOpen(true); }}
                              className="text-primary hover:underline text-left"
                            >
                              {getDealDisplayName(deal)}
                            </button>
                          </TableCell>
                          <TableCell>
                            <button
                              type="button"
                              onClick={() => { setDealDetailsDeal(deal); setDealDetailsOpen(true); }}
                              className="text-primary hover:underline text-left"
                            >
                              {deal.contact}
                            </button>
                          </TableCell>
                          <TableCell>{deal.email || <span className="text-gray-400 italic">N/A</span>}</TableCell>
                          <TableCell>${deal.amount.toLocaleString()}</TableCell>
                          <TableCell>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedCustomer({
                                  id: deal.id,
                                  name: deal.contact,
                                  company: getDealDisplayName(deal),
                                  email: deal.email,
                                  status: 'Active',
                                  nextAction: 'Follow up on deal',
                                  value: deal.amount,
                                  notes: [deal.notes],
                                  lastContact: deal.closeDate,
                                  customerIntent: '',
                                  interactions: [{
                                    customerId: deal.id,
                                    timestamp: deal.closeDate || new Date().toISOString(),
                                    type: 'note',
                                    notes: deal.notes,
                                  }],
                                });
                                generateEmail({
                                  id: deal.id,
                                  name: deal.contact,
                                  company: getDealDisplayName(deal),
                                  email: deal.email,
                                  status: 'Active',
                                  nextAction: 'Follow up on deal',
                                  value: deal.amount,
                                  notes: [deal.notes],
                                  lastContact: deal.closeDate,
                                  customerIntent: '',
                                  interactions: [{
                                    customerId: deal.id,
                                    timestamp: deal.closeDate || new Date().toISOString(),
                                    type: 'note',
                                    notes: deal.notes,
                                  }],
                                });
                              }}
                              disabled={generating && selectedCustomer?.id === deal.id}
                            >
                              {generating && selectedCustomer?.id === deal.id ? (
                                <>
                                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                                  Generating...
                                </>
                              ) : (
                                'Generate'
                              )}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                    </div>
                  </div>
                </div>

                <div className="border rounded-lg p-4 min-w-0">
                  {generatedEmail ? (
                    <div className="space-y-4">
                      <div className="rounded-md border p-4 bg-gray-50 dark:bg-gray-900 min-h-[300px]">
                        <pre className="whitespace-pre-wrap font-sans text-sm">
                          {generatedEmail}
                        </pre>
                      </div>
                      <div className="flex justify-end gap-4">
                        <Button
                          variant="outline"
                          onClick={() => setGeneratedEmail('')}
                        >
                          Clear
                        </Button>
                        <Button
                          onClick={() => generateEmail(selectedCustomer)}
                          disabled={generating}
                        >
                          Regenerate
                        </Button>
                        <Button
                          onClick={() => {
                            navigator.clipboard.writeText(generatedEmail);
                            toast.success('Email copied to clipboard!');
                          }}
                          disabled={!generatedEmail}
                          className="bg-green-600 hover:bg-green-700 text-white"
                        >
                          Copy
                        </Button>
                        <Button
                          onClick={async () => {
                            if (!selectedCustomer?.email?.trim()) {
                              toast.error('No email address for this contact. Add an email to the deal to send.');
                              return;
                            }
                            setSendingEmail(true);
                            try {
                              const res = await fetch('/api/org/send-email', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  to: selectedCustomer.email.trim(),
                                  toName: selectedCustomer.name || undefined,
                                  subject: 'Following up',
                                  body: generatedEmail,
                                }),
                              });
                              const data = await res.json();
                              if (!res.ok) throw new Error(data.error || 'Failed to send');
                              toast.success('Email sent successfully!');
                            } catch (err: any) {
                              toast.error(err?.message || 'Failed to send email');
                            } finally {
                              setSendingEmail(false);
                            }
                          }}
                          disabled={!generatedEmail || sendingEmail}
                          className="bg-primary hover:bg-primary/90"
                        >
                          {sendingEmail ? (
                            <>
                              <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                              Sending...
                            </>
                          ) : (
                            <>
                              <Send className="h-4 w-4 mr-2" />
                              Send
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                      Select a deal to generate an email
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="stats">
          <Card className="p-6">
            <CardHeader>
              <CardTitle className="font-heading">Pipeline Statistics</CardTitle>
              <CardDescription>Interactive overview of your deals pipeline</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                <Card className="p-4 border rounded-lg border-border/80 bg-card hover:shadow-md hover:border-primary/20 transition-all">
                  <p className="text-sm text-muted-foreground font-medium">Total Pipeline</p>
                  <p className="font-heading text-2xl font-bold">
                    ${filteredDeals.reduce((sum, d) => sum + d.amount, 0).toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {filteredDeals.length} total deals
                  </p>
                </Card>
                
                <Card className="p-4 border rounded-lg border-border/80 bg-card hover:shadow-md hover:border-primary/20 transition-all">
                  <p className="text-sm text-muted-foreground font-medium">Won Deals</p>
                  <div className="flex items-end gap-2">
                    <p className="font-heading text-2xl font-bold">
                      ${filteredDeals.filter(d => d.stage === 'Closed Won')
                             .reduce((sum, d) => sum + d.amount, 0)
                             .toLocaleString()}
                    </p>
                    <p className="text-sm text-green-600 mb-1">
                      ({filteredDeals.filter(d => d.stage === 'Closed Won').length} deals)
                    </p>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    {Math.round(filteredDeals.filter(d => d.stage === 'Closed Won').length / Math.max(1, filteredDeals.length) * 100)}% win rate
                  </p>
                </Card>
                
                <Card className="p-4 border rounded-lg border-border/80 bg-card hover:shadow-md hover:border-primary/20 transition-all">
                  <p className="text-sm text-muted-foreground font-medium">Active Pipeline</p>
                  <div className="flex items-end gap-2">
                    <p className="font-heading text-2xl font-bold">
                      ${filteredDeals.filter(d => !['Closed Won', 'Closed Lost'].includes(d.stage))
                             .reduce((sum, d) => sum + d.amount, 0)
                             .toLocaleString()}
                    </p>
                    <p className="text-sm text-blue-600 mb-1">
                      ({filteredDeals.filter(d => !['Closed Won', 'Closed Lost'].includes(d.stage)).length} deals)
                    </p>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    open opportunities
                  </p>
                </Card>
                
                <Card className="p-4 border rounded-lg border-border/80 bg-card hover:shadow-md hover:border-primary/20 transition-all">
                  <p className="text-sm text-muted-foreground font-medium">Avg Closed Deal Size</p>
                  <p className="font-heading text-2xl font-bold">
                    {(() => {
                      const closed = filteredDeals.filter(d => isClosedWon(d.stage) || isClosedLost(d.stage));
                      const total = closed.reduce((sum, d) => sum + d.amount, 0);
                      const avg = closed.length > 0 ? Math.round(total / closed.length) : 0;
                      return `$${avg.toLocaleString()}`;
                    })()}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    across won & lost deals
                  </p>
                </Card>

                <Card className="p-4 border rounded-lg border-border/80 bg-card hover:shadow-md hover:border-primary/20 transition-all">
                  <p className="text-sm text-muted-foreground font-medium">Avg Pipeline Deal Size</p>
                  <p className="font-heading text-2xl font-bold">
                    {(() => {
                      const pipeline = filteredDeals.filter(d => isInPipeline(d.stage));
                      const total = pipeline.reduce((sum, d) => sum + d.amount, 0);
                      const avg = pipeline.length > 0 ? Math.round(total / pipeline.length) : 0;
                      return `$${avg.toLocaleString()}`;
                    })()}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    active deals only
                  </p>
                </Card>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                <Card className="p-4 border-border/80">
                  <h4 className="font-heading font-medium mb-4">Deal Stage Distribution</h4>
                  <div className="space-y-3">
                    {Array.from(new Set(filteredDeals.map(d => d.stage))).map(stage => {
                      const stageDeals = filteredDeals.filter(d => d.stage === stage);
                      const percentage = Math.round(stageDeals.length / Math.max(1, filteredDeals.length) * 100);
                      return (
                        <div key={stage} className="relative">
                          <div className="flex justify-between mb-1">
                            <span className="text-sm font-medium">{stage}</span>
                            <span className="text-sm text-gray-500 dark:text-gray-400">
                              {stageDeals.length} deals (${stageDeals.reduce((sum, d) => sum + d.amount, 0).toLocaleString()})
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                            <div 
                              className={`h-2.5 rounded-full ${
                                stage === 'Closed Won' ? 'bg-green-600' :
                                stage === 'Closed Lost' ? 'bg-red-600' :
                                'bg-blue-600'
                              }`}
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>

                <Card className="p-4 border-border/80">
                  <h4 className="font-heading font-medium mb-4">Deal Size Distribution</h4>
                  <div className="space-y-3">
                    {filteredDeals.length === 0 ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400">No deals to analyze.</p>
                    ) : (
                      getDynamicDealSizeRanges(filteredDeals).map(range => {
                        const rangeDeals = filteredDeals.filter(d => 
                          (range.min !== undefined ? d.amount >= range.min! : true) && 
                          (range.max !== undefined ? d.amount < range.max : true)
                        );
                        const percentage = filteredDeals.length > 0 ? Math.round(rangeDeals.length / filteredDeals.length * 100) : 0;
                        return (
                          <div key={range.label} className="relative">
                            <div className="flex justify-between mb-1">
                              <span className="text-sm font-medium">{range.label}</span>
                              <span className="text-sm text-gray-500 dark:text-gray-400">
                                {rangeDeals.length} deals (${rangeDeals.reduce((sum, d) => sum + d.amount, 0).toLocaleString()})
                              </span>
                            </div>
                            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                              <div 
                                className={`h-2.5 rounded-full ${range.color}`}
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </Card>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <Card className="p-4 border-border/80">
                  <h4 className="font-heading font-medium mb-4">Closed Deals</h4>
                  <div className="space-y-2">
                    {(() => {
                      const wonDeals = filteredDeals.filter(d => isClosedWon(d.stage));
                      const lostDeals = filteredDeals.filter(d => isClosedLost(d.stage));
                      const closedDeals = [...wonDeals, ...lostDeals].sort((a, b) => b.amount - a.amount);
                      const closedTotal = closedDeals.length;
                      const wonPct = closedTotal > 0 ? Math.round(wonDeals.length / closedTotal * 100) : 0;

                      if (closedTotal === 0) {
                        return <p className="text-sm text-gray-500 dark:text-gray-400">No closed deals yet.</p>;
                      }
                      return (
                        <>
                          {settings.statistics.showPercentage && (
                            <div className="flex items-center gap-2 mb-3">
                              <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                                <div
                                  className="h-2.5 rounded-full bg-blue-600"
                                  style={{ width: `${wonPct}%` }}
                                />
                              </div>
                              <span className="text-sm font-medium shrink-0">{wonPct}%</span>
                            </div>
                          )}
                          <div className="space-y-3">
                            {closedDeals.map((deal) => (
                              <div
                                key={deal.id}
                                className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-800 last:border-0"
                              >
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium shrink-0 ${
                                      isClosedWon(deal.stage)
                                        ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'
                                        : 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300'
                                    }`}
                                  >
                                    {isClosedWon(deal.stage) ? 'Won' : 'Loss'}
                                  </span>
                                  <div>
                                    <p className="text-sm font-medium">{getDealDisplayName(deal)}</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">{deal.company}</p>
                                  </div>
                                </div>
                                <span className="text-sm font-semibold">${deal.amount.toLocaleString()}</span>
                              </div>
                            ))}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </Card>

                <Card className="p-4 border-border/80">
                  <h4 className="font-heading font-medium mb-4">Top Deals in Pipeline</h4>
                  <div className="space-y-2">
                    {(() => {
                      const pipelineDeals = filteredDeals.filter(d => isInPipeline(d.stage));
                      if (pipelineDeals.length === 0) {
                        return <p className="text-sm text-gray-500 dark:text-gray-400">No active deals in pipeline.</p>;
                      }
                      return [...pipelineDeals]
                        .sort((a, b) => b.amount - a.amount)
                        .slice(0, 5)
                        .map((deal, i) => (
                          <div key={deal.id} className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-gray-400 w-5">{i + 1}</span>
                              <div>
                                <p className="text-sm font-medium">{getDealDisplayName(deal)}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">{deal.stage}</p>
                              </div>
                            </div>
                            <span className="text-sm font-semibold">${deal.amount.toLocaleString()}</span>
                          </div>
                        ));
                    })()}
                  </div>
                </Card>
              </div>

              {/* Insights: Deals Needing Attention */}
              <div className="grid grid-cols-1 gap-8 mt-8">
                <Card className="p-4 border-border/80">
                  <h4 className="font-heading font-medium mb-3 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    Deals Needing Attention
                  </h4>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">High-value or stale deals that may need follow-up</p>
                  <div className="space-y-2">
                    {insights.actionItems.length > 0 ? (
                      insights.actionItems.slice(0, 8).map(d => (
                        <div key={d.id} className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
                          <div>
                            <p className="text-sm font-medium">{d.name}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{d.stage} · {d.owner}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">${d.amount.toLocaleString()}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{d.daysSinceActivity} days since activity</p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-gray-500 dark:text-gray-400">All deals are up to date. Great job!</p>
                    )}
                  </div>
                </Card>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <DealDetailsDialog
        deal={dealDetailsDeal ? { ...dealDetailsDeal, userId: (dealDetailsDeal as DealWithUserId).userId } : null}
        open={dealDetailsOpen}
        onOpenChange={setDealDetailsOpen}
        onNotesSaved={(id, notes) => {
          setDeals(prev => prev.map(d => d.id === id ? { ...d, notes } : d));
          setDealDetailsDeal(prev => prev && prev.id === id ? { ...prev, notes } : prev);
        }}
      />
    </div>
  );
}