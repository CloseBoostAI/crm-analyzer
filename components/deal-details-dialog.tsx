'use client';

import { useState, useEffect } from 'react';
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
import { getDealDisplayName, getDealStageColor } from '@/lib/utils';
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
} from 'lucide-react';
import { toast } from 'sonner';

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

  useEffect(() => {
    if (deal) setNotes(deal.notes || '');
  }, [deal?.id, deal?.notes]);

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
                <Button variant="ghost" className="rounded-b-none border-b-2 border-primary">
                  Overview
                </Button>
                <Button variant="ghost" className="rounded-b-none text-muted-foreground">
                  Activities
                </Button>
              </div>

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
