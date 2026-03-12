import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Strip quoted reply/original message from email body.
 * Returns only the new content the sender wrote (before "On ... wrote:", "-----Original Message-----", etc.)
 */
export function extractReplyBody(text: string): string {
  if (!text || typeof text !== 'string') return '';
  const trimmed = text.trim();
  if (!trimmed) return '';

  // Common reply markers - find the earliest one and take content before it
  // Match "On [date] [name] wrote:" - date format "Tue, Mar 10, 2026" or "3/10/2026" to avoid "is on Tuesday"
  const markers = [
    /\s+On\s+[A-Za-z]{3},\s*[A-Za-z]{3}\s+\d{1,2},\s*\d{4}[\s\S]*?wrote:\s*/i,  // "On Tue, Mar 10, 2026 ... wrote:"
    /\s+On\s+\d{1,2}\/\d{1,2}\/\d{2,4}[\s\S]*?wrote:\s*/i,                     // "On 3/10/2026 ... wrote:"
    /\s+On\s+[\s\S]*?wrote:\s*/i,                                             // Fallback: any "On ... wrote:"
    /\n-{3,}\s*Original Message\s*-{3,}/i,     // Outlook: -----Original Message-----
    /\n-{5,}\s*Original Message\s*-{5,}/i,
    /\nFrom:\s*[\s\S]*?To:\s*[\s\S]*?Subject:/i, // Outlook reply header
    /\n_{5,}\s*Original Message\s*_{5,}/i,
    /\n>+\s*From:\s*[\s\S]*?Subject:/i,        // Quoted Outlook header
  ];

  let earliest = trimmed.length;
  for (const re of markers) {
    const m = trimmed.match(re);
    if (m && m.index !== undefined && m.index < earliest) {
      earliest = m.index;
    }
  }

  let result = earliest < trimmed.length ? trimmed.slice(0, earliest) : trimmed;

  // Strip trailing lines that are entirely "> " quoted (leftover from partial matches)
  const lines = result.split('\n');
  let cut = lines.length;
  for (let i = lines.length - 1; i >= 0; i--) {
    const t = lines[i].trim();
    if (!t) continue;
    if (!/^>\s*/.test(lines[i])) {
      cut = i + 1; // Keep this line and everything before
      break;
    }
  }
  result = lines.slice(0, cut).join('\n');

  return result.replace(/\s+/g, ' ').trim();
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

/** Default deal stages (fixed order - no customization) */
export const DEFAULT_DEAL_STAGE_KEYS = [
  'appointmentscheduled',
  'closedlost',
  'closedwon',
  'contractsent',
  'decisionmakerboughtin',
  'demo',
  'lead',
  'qualifiedtobuy',
];

