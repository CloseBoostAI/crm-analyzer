import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Convert HTML to plain text: strip tags and decode entities (e.g. &lt; &gt; &amp;) */
export function htmlToPlainText(html: string): string {
  if (!html || typeof html !== 'string') return '';
  let text = html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)));
  const entities: Record<string, string> = {
    '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&apos;': "'", '&nbsp;': ' ',
  };
  for (const [k, v] of Object.entries(entities)) {
    text = text.replace(new RegExp(k, 'g'), v);
  }
  return text.replace(/\s+/g, ' ').trim();
}

export type CRMLog = {
  customerId: string;
  timestamp: string;
  type: string;
  notes: string;
  outcome?: string;
};

export type Customer = {
  id: string;
  name: string;
  email: string;
  company: string;
  lastContact: string;
  status: 'Active' | 'Inactive' | 'Lead' | 'Opportunity';
  value: number;
  nextAction: string;
  notes: string[];
  interactions: CRMLog[];
  customerIntent: string;
};

export type Deal = {
  id: string;
  name: string;
  company: string;
  stage: string;
  owner: string;
  contact: string;
  amount: number;
  priority: 'High' | 'Medium' | 'Low';
  contactId: string;
  notes: string;
  closeDate: string;
  email: string;
  lastActivity: string;
};

/** Primary display label for a deal - uses name, company, or contact (none required) */
export function getDealDisplayName(deal: { name?: string; company?: string; contact?: string }): string {
  return (deal.name || deal.company || deal.contact || '—').trim() || '—';
}

export function parseCRMLogs(files: File[]): Promise<{ customers: Customer[], logs: CRMLog[] }> {
  return new Promise((resolve, reject) => {
    const customers = new Map<string, Customer>();
    const allLogs: CRMLog[] = [];

    let filesProcessed = 0;

    files.forEach(file => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          const data = file.name.endsWith('.json') ? JSON.parse(content) : parseCSV(content);

          data.forEach((entry: any) => {
            // Process each log entry
            const log: CRMLog = {
              customerId: entry.customer_id || entry.customerId,
              timestamp: entry.timestamp || entry.date,
              type: entry.type || entry.interaction_type,
              notes: entry.notes || entry.comments || '',
              outcome: entry.outcome || entry.result
            };
            allLogs.push(log);

            // Update or create customer record
            const customerId = log.customerId;
            if (!customers.has(customerId)) {
              customers.set(customerId, {
                id: customerId,
                name: entry.customer_name || entry.customerName || '',
                email: entry.email || '',
                company: entry.company_name || entry.companyName || entry.company || '',
                lastContact: log.timestamp,
                status: determineStatus(log.type, log.outcome),
                value: parseFloat(entry.value || entry.deal_value || '0'),
                nextAction: entry.next_action || entry.nextAction || '',
                notes: [log.notes],
                interactions: [log],
                customerIntent: entry.customerIntent || ''
              });
            } else {
              const customer = customers.get(customerId)!;
              // Update company name if it's empty and new data has it
              if (!customer.company && (entry.company_name || entry.companyName || entry.company)) {
                customer.company = entry.company_name || entry.companyName || entry.company;
              }
              customer.notes.push(log.notes);
              customer.interactions.push(log);
              if (new Date(log.timestamp) > new Date(customer.lastContact)) {
                customer.lastContact = log.timestamp;
              }
              customer.status = determineStatus(log.type, log.outcome);
              customer.customerIntent = entry.customerIntent || '';
            }
          });
        } catch (error) {
          console.error('Error processing file:', file.name, error);
        }

        filesProcessed++;
        if (filesProcessed === files.length) {
          resolve({
            customers: Array.from(customers.values()),
            logs: allLogs
          });
        }
      };

      reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));

      if (file.name.endsWith('.json')) {
        reader.readAsText(file);
      } else if (file.name.endsWith('.csv')) {
        reader.readAsText(file);
      } else {
        reject(new Error(`Unsupported file type: ${file.name}`));
      }
    });
  });
}

function parseCSV(content: string) {
  const lines = content.split('\\n');
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const values = line.split(',');
    return headers.reduce((obj: any, header, index) => {
      obj[header] = values[index]?.trim() || '';
      return obj;
    }, {});
  });
}

function determineStatus(type: string, outcome?: string): Customer['status'] {
  if (outcome?.toLowerCase().includes('closed') || type.toLowerCase().includes('won')) {
    return 'Active';
  }
  if (type.toLowerCase().includes('lead')) {
    return 'Lead';
  }
  if (type.toLowerCase().includes('opportunity') || outcome?.toLowerCase().includes('pending')) {
    return 'Opportunity';
  }
  return 'Inactive';
}

/** Universal deal stages - comprehensive list used across CRMs. Key is normalized for matching. */
export const UNIVERSAL_DEAL_STAGES: { key: string; label: string }[] = [
  { key: 'lead', label: 'Lead' },
  { key: 'newlead', label: 'New Lead' },
  { key: 'prospecting', label: 'Prospecting' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'initialcontact', label: 'Initial Contact' },
  { key: 'qualified', label: 'Qualified' },
  { key: 'qualifiedtobuy', label: 'Qualified to Buy' },
  { key: 'disqualified', label: 'Disqualified' },
  { key: 'discovery', label: 'Discovery' },
  { key: 'needsanalysis', label: 'Needs Analysis' },
  { key: 'appointmentscheduled', label: 'Appointment Scheduled' },
  { key: 'meetingscheduled', label: 'Meeting Scheduled' },
  { key: 'demo', label: 'Demo' },
  { key: 'trial', label: 'Trial' },
  { key: 'evaluation', label: 'Evaluation' },
  { key: 'proposal', label: 'Proposal' },
  { key: 'presentationscheduled', label: 'Presentation Scheduled' },
  { key: 'quote', label: 'Quote' },
  { key: 'negotiation', label: 'Negotiation' },
  { key: 'decisionmakerboughtin', label: 'Decision Maker Bought-In' },
  { key: 'verbalagreement', label: 'Verbal Agreement' },
  { key: 'contractsent', label: 'Contract Sent' },
  { key: 'legalreview', label: 'Legal Review' },
  { key: 'awaitingsignature', label: 'Awaiting Signature' },
  { key: 'onhold', label: 'On Hold' },
  { key: 'pending', label: 'Pending' },
  { key: 'closedwon', label: 'Closed Won' },
  { key: 'closedlost', label: 'Closed Lost' },
  { key: 'closednodecision', label: 'Closed - No Decision' },
  { key: 'closedcancelled', label: 'Closed - Cancelled' },
];

export const dealStageColors: { [key: string]: { bg: string; text: string } } = {
  'lead': { bg: 'bg-slate-100 dark:bg-slate-700/80', text: 'text-slate-800 dark:text-slate-100' },
  'newlead': { bg: 'bg-slate-200 dark:bg-slate-600/80', text: 'text-slate-900 dark:text-slate-100' },
  'prospecting': { bg: 'bg-pink-100 dark:bg-pink-600/80', text: 'text-pink-800 dark:text-pink-100' },
  'contacted': { bg: 'bg-indigo-100 dark:bg-indigo-700/80', text: 'text-indigo-800 dark:text-indigo-100' },
  'initialcontact': { bg: 'bg-indigo-200 dark:bg-indigo-600/80', text: 'text-indigo-900 dark:text-indigo-100' },
  'qualified': { bg: 'bg-sky-100 dark:bg-sky-700/80', text: 'text-sky-800 dark:text-sky-100' },
  'qualifiedtobuy': { bg: 'bg-sky-200 dark:bg-sky-600/80', text: 'text-sky-900 dark:text-sky-100' },
  'disqualified': { bg: 'bg-rose-100 dark:bg-rose-700/80', text: 'text-rose-800 dark:text-rose-100' },
  'discovery': { bg: 'bg-teal-100 dark:bg-teal-700/80', text: 'text-teal-800 dark:text-teal-100' },
  'needsanalysis': { bg: 'bg-teal-200 dark:bg-teal-600/80', text: 'text-teal-900 dark:text-teal-100' },
  'appointmentscheduled': { bg: 'bg-blue-100 dark:bg-blue-700/80', text: 'text-blue-800 dark:text-blue-100' },
  'meetingscheduled': { bg: 'bg-blue-200 dark:bg-blue-600/80', text: 'text-blue-900 dark:text-blue-100' },
  'demo': { bg: 'bg-cyan-100 dark:bg-cyan-700/80', text: 'text-cyan-800 dark:text-cyan-100' },
  'trial': { bg: 'bg-cyan-200 dark:bg-cyan-600/80', text: 'text-cyan-900 dark:text-cyan-100' },
  'evaluation': { bg: 'bg-cyan-300 dark:bg-cyan-600/80', text: 'text-cyan-900 dark:text-cyan-100' },
  'proposal': { bg: 'bg-violet-100 dark:bg-violet-700/80', text: 'text-violet-800 dark:text-violet-100' },
  'presentationscheduled': { bg: 'bg-purple-100 dark:bg-purple-700/80', text: 'text-purple-800 dark:text-purple-100' },
  'quote': { bg: 'bg-fuchsia-100 dark:bg-fuchsia-700/80', text: 'text-fuchsia-800 dark:text-fuchsia-100' },
  'negotiation': { bg: 'bg-amber-100 dark:bg-amber-700/80', text: 'text-amber-800 dark:text-amber-100' },
  'decisionmakerboughtin': { bg: 'bg-yellow-100 dark:bg-yellow-700/80', text: 'text-yellow-800 dark:text-yellow-100' },
  'verbalagreement': { bg: 'bg-lime-100 dark:bg-lime-700/80', text: 'text-lime-800 dark:text-lime-100' },
  'contractsent': { bg: 'bg-orange-100 dark:bg-orange-700/80', text: 'text-orange-800 dark:text-orange-100' },
  'legalreview': { bg: 'bg-amber-200 dark:bg-amber-600/80', text: 'text-amber-900 dark:text-amber-100' },
  'awaitingsignature': { bg: 'bg-orange-200 dark:bg-orange-600/80', text: 'text-orange-900 dark:text-orange-100' },
  'onhold': { bg: 'bg-stone-100 dark:bg-stone-600/80', text: 'text-stone-800 dark:text-stone-100' },
  'pending': { bg: 'bg-stone-200 dark:bg-stone-500/80', text: 'text-stone-900 dark:text-stone-100' },
  'closedwon': { bg: 'bg-green-100 dark:bg-green-700/80', text: 'text-green-800 dark:text-green-100' },
  'closedlost': { bg: 'bg-red-100 dark:bg-red-700/80', text: 'text-red-800 dark:text-red-100' },
  'closednodecision': { bg: 'bg-neutral-100 dark:bg-neutral-600/80', text: 'text-neutral-800 dark:text-neutral-100' },
  'closedcancelled': { bg: 'bg-rose-200 dark:bg-rose-600/80', text: 'text-rose-900 dark:text-rose-100' },
  'default': { bg: 'bg-gray-100 dark:bg-gray-600/80', text: 'text-gray-800 dark:text-gray-100' }
};

/** Normalize a stage string for matching (lowercase, no spaces/special chars) */
export function normalizeDealStage(stage: string): string {
  return stage.toLowerCase().replace(/[\s\-_]/g, '').replace(/[^a-z0-9]/g, '');
}

/** Find the best matching universal stage key for a raw stage string */
export function matchDealStage(stage: string): string | null {
  const normalized = normalizeDealStage(stage);
  if (!normalized) return null;
  // Exact match first
  const exact = UNIVERSAL_DEAL_STAGES.find(s => normalizeDealStage(s.label) === normalized);
  if (exact) return exact.key;
  // Partial match (e.g. "won" matches "closedwon")
  const partial = UNIVERSAL_DEAL_STAGES.find(s => 
    normalized.includes(s.key) || s.key.includes(normalized)
  );
  return partial?.key ?? null;
}

export function getDealStageColor(stage: string) {
  const matchedKey = matchDealStage(stage);
  return dealStageColors[matchedKey || 'default'] || dealStageColors.default;
}

/** Get display label for a stage (from universal list or return as-is if no match) */
export function getDealStageLabel(stage: string): string {
  const matchedKey = matchDealStage(stage);
  if (matchedKey) {
    const found = UNIVERSAL_DEAL_STAGES.find(s => s.key === matchedKey);
    return found?.label ?? stage;
  }
  return stage;
}

/** Default stages for new users (common sales pipeline) */
export const DEFAULT_DEAL_STAGE_KEYS = [
  'qualifiedtobuy', 'appointmentscheduled', 'presentationscheduled',
  'decisionmakerboughtin', 'contractsent', 'closedwon', 'closedlost'
];

/** Stage keys ordered by pipeline position (early → late). Later stages = higher priority for active deals. */
const STAGE_PRIORITY_ORDER: Record<string, number> = (() => {
  const order: Record<string, number> = {};
  UNIVERSAL_DEAL_STAGES.forEach((s, i) => { order[s.key] = i; });
  return order;
})();

/** Parse date string (MM/DD/YYYY or YYYY-MM-DD) to timestamp, or return 0 if invalid */
function parseActivityDate(s: string): number {
  if (!s || !s.trim()) return 0;
  const d = new Date(s.trim());
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

/**
 * Compute deal priorities based on distribution across the pipeline:
 * - Amount: top tertile = High, middle = Medium, bottom = Low (by deal size)
 * - Stage: later pipeline stages (Proposal, Negotiation, etc.) boost priority; Closed Lost = lower
 * - Last activity: more recent = higher priority; stale (21+ days) = lower
 */
export function computeDealPriorities<T extends { amount: number; stage: string; lastActivity: string }>(
  deals: T[]
): ('High' | 'Medium' | 'Low')[] {
  if (deals.length === 0) return [];

  const now = Date.now();
  const oneDay = 86400000;

  // Score each deal 0–1 (higher = more priority)
  const scores = deals.map((d, idx) => {
    // Amount score: rank by amount (top = 1, bottom = 0)
    const sortedByAmount = [...deals].sort((a, b) => b.amount - a.amount);
    const amountRank = sortedByAmount.findIndex(x => x === d);
    const amountScore = deals.length > 1 ? 1 - amountRank / (deals.length - 1) : 0.5;

    // Stage score: later stages = higher (except closed lost)
    const stageKey = matchDealStage(d.stage);
    const stageIdx = stageKey ? STAGE_PRIORITY_ORDER[stageKey] ?? -1 : -1;
    let stageScore = 0.5;
    if (stageKey === 'closedlost' || stageKey === 'closedcancelled' || stageKey === 'closednodecision') {
      stageScore = 0.2; // Closed lost = low
    } else if (stageKey === 'closedwon') {
      stageScore = 0.4; // Won = medium (no urgent action)
    } else if (stageIdx >= 0) {
      // Active deals: later in pipeline = higher (proposal, negotiation, etc.)
      const maxIdx = Math.max(...Object.values(STAGE_PRIORITY_ORDER));
      stageScore = 0.5 + 0.5 * (stageIdx / Math.max(1, maxIdx));
    }

    // Activity score: recent = higher, stale = lower
    const ts = parseActivityDate(d.lastActivity);
    let activityScore = 0.5;
    if (ts > 0) {
      const daysSince = (now - ts) / oneDay;
      if (daysSince <= 7) activityScore = 1;
      else if (daysSince <= 14) activityScore = 0.8;
      else if (daysSince <= 21) activityScore = 0.6;
      else activityScore = Math.max(0.2, 0.5 - daysSince / 60); // Stale = lower
    }

    // Weighted composite: amount 40%, stage 35%, activity 25%
    const composite = amountScore * 0.4 + stageScore * 0.35 + activityScore * 0.25;
    return { idx, composite };
  });

  // Assign High/Medium/Low by tertiles of composite score (top 33% High, middle 33% Medium, bottom 34% Low)
  const sorted = [...scores].sort((a, b) => b.composite - a.composite);
  const n = sorted.length;
  const highCount = Math.max(1, Math.ceil(n / 3));
  const mediumCount = Math.max(1, Math.ceil(n / 3));
  const highThreshold = sorted[highCount - 1]?.composite ?? 1;
  const mediumThreshold = sorted[highCount + mediumCount - 1]?.composite ?? 0.5;

  return scores.map(s => {
    if (s.composite >= highThreshold) return 'High' as const;
    if (s.composite >= mediumThreshold) return 'Medium' as const;
    return 'Low' as const;
  });
}
