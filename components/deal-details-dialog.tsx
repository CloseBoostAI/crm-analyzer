'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { getDealDisplayName, getDealStageColor, htmlToPlainText } from '@/lib/utils';
import {
  FileText,
  Mail,
  Phone,
  Calendar,
  CheckSquare,
  MoreHorizontal,
  ChevronDown,
  ChevronUp,
  User,
  Building2,
  Sparkles,
  Copy,
  RefreshCw,
  Loader2,
  Inbox,
} from 'lucide-react';
import { toast } from 'sonner';

type ThreadMessage = {
  senderEmail: string;
  senderName: string | null;
  bodyText: string;
  receivedAt: string;
  isFromUser: boolean;
};

type DealEmailThread = {
  id: string;
  subject: string;
  status: 'pending' | 'acknowledged' | 'replied';
  receivedAt: string;
  messages: ThreadMessage[];
};

export type DealForDialog = {
  id: string;
  name: string;
  company: string;
  stage: string;
  owner: string;
  contact: string;
  amount: number;
  priority: string;
  notes: string;
  closeDate: string;
  email: string;
  lastActivity: string;
  userId?: string;
  memberEmail?: string | null;
  memberName?: string | null;
  createdAt?: string;
};

function getPriorityStyle(priority: string) {
  if (priority === 'High') return 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300';
  if (priority === 'Medium') return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300';
  return 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300';
}

type Props = {
  deal: DealForDialog | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNotesSaved?: (dealId: string, notes: string) => void;
};

export function DealDetailsDialog({ deal, open, onOpenChange, onNotesSaved }: Props) {
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(true);
  const [contactsOpen, setContactsOpen] = useState(true);
  const [aiOpen, setAiOpen] = useState(true);
  const [notes, setNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'activities'>('overview');
  const [dealThreads, setDealThreads] = useState<DealEmailThread[]>([]);
  const [emailsLoading, setEmailsLoading] = useState(false);

  useEffect(() => {
    if (deal) setNotes(deal.notes || '');
  }, [deal?.id, deal?.notes]);

  const fetchDealEmails = useCallback(async () => {
    if (!deal) return;
    setEmailsLoading(true);
    try {
      const res = await fetch(`/api/org/deals/${deal.id}/emails`);
      if (res.ok) {
        const data = await res.json();
        setDealThreads(data.threads || []);
      } else {
        setDealThreads([]);
      }
    } catch {
      setDealThreads([]);
    } finally {
      setEmailsLoading(false);
    }
  }, [deal?.id]);

  useEffect(() => {
    if (deal && activeTab === 'activities') {
      fetchDealEmails();
    }
  }, [deal?.id, activeTab, fetchDealEmails]);

  const saveNotes = async () => {
    if (!deal || notes === (deal.notes || '')) return;
    setSavingNotes(true);
    try {
      const url = deal.userId
        ? `/api/org/deals/${deal.id}?userId=${deal.userId}`
        : `/api/org/deals/${deal.id}`;
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
      if (!res.ok) throw new Error('Failed to save');
      toast.success('Notes saved');
      onNotesSaved?.(deal.id, notes);
    } catch {
      toast.error('Failed to save notes');
    } finally {
      setSavingNotes(false);
    }
  };

  const generateSummary = async () => {
    if (!deal) return;
    setGeneratingSummary(true);
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            {
              role: 'system',
              content: 'You are a sales assistant. Summarize deal information concisely in 2-4 sentences. Focus on key facts: contact, company, stage, amount, and any notable details from notes.',
            },
            {
              role: 'user',
              content: `Summarize this deal:\n\nDeal: ${getDealDisplayName(deal)}\nCompany: ${deal.company}\nContact: ${deal.contact}\nStage: ${deal.stage}\nAmount: $${deal.amount.toLocaleString()}\nOwner: ${deal.owner}\nNotes: ${deal.notes || 'None'}\nLast Activity: ${deal.lastActivity || 'N/A'}`,
            },
          ],
          max_tokens: 300,
        }),
      });

      if (!res.ok) throw new Error('Failed to generate');
      const result = await res.json();
      const text = result.choices?.[0]?.message?.content || '';
      setAiSummary(text);
      toast.success('Summary generated');
    } catch {
      toast.error('Failed to generate summary');
    } finally {
      setGeneratingSummary(false);
    }
  };

  const copyEmail = (email: string) => {
    navigator.clipboard.writeText(email);
    toast.success('Email copied');
  };

  if (!deal) return null;

  const createDate = deal.createdAt
    ? new Date(deal.createdAt).toLocaleString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
      })
    : '—';
  const lastActivityDate = deal.lastActivity
    ? new Date(deal.lastActivity).toLocaleString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
      })
    : '—';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-full max-h-[95vh] h-[95vh] overflow-hidden flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 shrink-0 border-b">
          <DialogTitle className="text-xl font-semibold">
            {getDealDisplayName(deal)}
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="flex-1 px-6 py-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pb-6">
            {/* Left sidebar */}
            <div className="lg:col-span-4 space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg font-semibold">
                    {getDealDisplayName(deal)}
                  </CardTitle>
                  <div className="space-y-1 text-sm text-muted-foreground mt-2">
                    <p><strong className="text-foreground">Amount:</strong> ${deal.amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
                    <p><strong className="text-foreground">Close Date:</strong> {deal.closeDate || '—'}</p>
                    <p><strong className="text-foreground">Pipeline:</strong> Deals pipeline</p>
                    <p>
                      <strong className="text-foreground">Deal Stage:</strong>{' '}
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getDealStageColor(deal.stage).bg} ${getDealStageColor(deal.stage).text}`}>
                        {deal.stage}
                      </span>
                    </p>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex gap-2 flex-wrap">
                    {[
                      { icon: FileText, label: 'Note' },
                      { icon: Mail, label: 'Email' },
                      { icon: Phone, label: 'Call' },
                      { icon: CheckSquare, label: 'Task' },
                      { icon: Calendar, label: 'Meeting' },
                    ].map(({ icon: Icon, label }) => (
                      <Button key={label} variant="outline" size="icon" className="rounded-full h-9 w-9" title={label}>
                        <Icon className="h-4 w-4" />
                      </Button>
                    ))}
                    <Button variant="outline" size="icon" className="rounded-full h-9 w-9" title="More">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Collapsible open={aboutOpen} onOpenChange={setAboutOpen}>
                <Card>
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors rounded-t-lg">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-medium">About this deal</CardTitle>
                        {aboutOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="pt-0 space-y-2 text-sm">
                      <p><strong>Deal owner:</strong> {deal.owner}</p>
                      <p><strong>Last Contacted:</strong> {deal.lastActivity ? new Date(deal.lastActivity).toLocaleDateString() : '—'}</p>
                      <p><strong>Deal Type:</strong> —</p>
                      <p>
                        <strong>Priority:</strong>{' '}
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getPriorityStyle(deal.priority)}`}>
                          {deal.priority}
                        </span>
                      </p>
                      <p><strong>Record source:</strong> Import</p>
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            </div>

            {/* Center content */}
            <div className="lg:col-span-5 space-y-4">
              <div className="flex gap-2 border-b">
                <Button
                  variant="ghost"
                  className={`rounded-b-none ${activeTab === 'overview' ? 'border-b-2 border-primary' : 'text-muted-foreground'}`}
                  onClick={() => setActiveTab('overview')}
                >
                  Overview
                </Button>
                <Button
                  variant="ghost"
                  className={`rounded-b-none ${activeTab === 'activities' ? 'border-b-2 border-primary' : 'text-muted-foreground'}`}
                  onClick={() => setActiveTab('activities')}
                >
                  Activities
                </Button>
              </div>

              {activeTab === 'overview' ? (
                <>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm font-medium">Data highlights</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <p><strong>CREATE DATE:</strong> {createDate}</p>
                      <p><strong>LAST ACTIVITY DATE:</strong> {lastActivityDate}</p>
                      <p><strong>DEAL STAGE:</strong> {deal.stage} (Deals pipeline)</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm font-medium">Notes</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        onBlur={saveNotes}
                        placeholder="Add notes about this deal..."
                        className="min-h-[200px] resize-y font-mono text-sm"
                        disabled={savingNotes}
                      />
                      {savingNotes && (
                        <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                          <Loader2 className="h-3 w-3 animate-spin" /> Saving...
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </>
              ) : (
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-sm font-medium">Email activity</CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={fetchDealEmails}
                      disabled={emailsLoading}
                    >
                      {emailsLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                    </Button>
                  </CardHeader>
                  <CardContent>
                    {emailsLoading && dealThreads.length === 0 ? (
                      <div className="flex items-center justify-center py-8 text-muted-foreground">
                        <Loader2 className="h-6 w-6 animate-spin mr-2" />
                        Loading emails...
                      </div>
                    ) : dealThreads.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <Inbox className="h-10 w-10 mx-auto mb-2 opacity-50" />
                        <p className="text-sm font-medium">No email exchanges yet</p>
                        <p className="text-xs mt-1">
                          Emails from {deal.email || 'this contact'} will appear here when received.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-4 max-h-[400px] overflow-y-auto">
                        {dealThreads.map((thread) => (
                          <div
                            key={thread.id}
                            className="border rounded-lg overflow-hidden"
                          >
                            <div className="flex items-center justify-between gap-2 px-3 py-2 bg-muted/50 border-b">
                              <p className="text-sm font-medium truncate">
                                {thread.subject || '(no subject)'}
                              </p>
                              <span
                                className={`shrink-0 text-xs px-2 py-0.5 rounded ${
                                  thread.status === 'pending'
                                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200'
                                    : thread.status === 'acknowledged'
                                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200'
                                    : 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200'
                                }`}
                              >
                                {thread.status}
                              </span>
                            </div>
                            <div className="p-4 space-y-4 flex flex-col">
                              {thread.messages.map((msg, i) => (
                                <div
                                  key={i}
                                  className={`flex flex-col ${msg.isFromUser ? 'items-end' : 'items-start'}`}
                                >
                                  <p className="text-xs font-medium text-muted-foreground mb-1 px-1">
                                    {msg.isFromUser ? 'You' : (msg.senderName || msg.senderEmail)}
                                    <span className="ml-2 font-normal">
                                      {new Date(msg.receivedAt).toLocaleString()}
                                    </span>
                                  </p>
                                  <div
                                    className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                                      msg.isFromUser
                                        ? 'bg-primary text-primary-foreground rounded-br-sm'
                                        : 'bg-muted rounded-bl-sm'
                                    }`}
                                  >
                                    <p className="whitespace-pre-wrap break-words">
                                      {htmlToPlainText(msg.bodyText || '').replace(/\s+/g, ' ').trim().slice(0, 500)}
                                      {htmlToPlainText(msg.bodyText || '').replace(/\s+/g, ' ').trim().length > 500 ? '...' : ''}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Right sidebar */}
            <div className="lg:col-span-3 space-y-4">
              <Collapsible open={aiOpen} onOpenChange={setAiOpen}>
                <Card>
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors rounded-t-lg">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-medium flex items-center gap-1">
                          <Sparkles className="h-4 w-4 text-primary" /> AI Summary
                        </CardTitle>
                        {aiOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="pt-0">
                      {aiSummary ? (
                        <>
                          <p className="text-xs text-muted-foreground mb-2">
                            Generated {new Date().toLocaleDateString()}
                          </p>
                          <p className="text-sm mb-3">{aiSummary}</p>
                          <div className="flex gap-2">
                            <Button variant="ghost" size="icon" onClick={generateSummary} disabled={generatingSummary}>
                              <RefreshCw className={`h-4 w-4 ${generatingSummary ? 'animate-spin' : ''}`} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                navigator.clipboard.writeText(aiSummary);
                                toast.success('Copied');
                              }}
                            >
                              <Copy className="h-4 w-4 mr-1" /> Copy
                            </Button>
                          </div>
                        </>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={generateSummary}
                          disabled={generatingSummary}
                          className="w-full"
                        >
                          {generatingSummary ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <Sparkles className="h-4 w-4 mr-2" />
                          )}
                          Generate summary
                        </Button>
                      )}
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>

              <Collapsible open={contactsOpen} onOpenChange={setContactsOpen}>
                <Card>
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors rounded-t-lg">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-medium">Contacts (1)</CardTitle>
                        {contactsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="pt-0">
                      <div className="flex items-start gap-3 p-3 rounded-lg border">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
                          <User className="h-4 w-4 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm truncate">{deal.contact || '—'}</p>
                          <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                            <Building2 className="h-3 w-3 shrink-0" />
                            {deal.company || '—'}
                          </p>
                          {deal.email && (
                            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                              {deal.email}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5"
                                onClick={() => copyEmail(deal.email)}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
