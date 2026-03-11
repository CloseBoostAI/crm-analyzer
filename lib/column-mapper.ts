export const TARGET_FIELDS = [
  { key: 'record_id', label: 'Record ID' },
  { key: 'deal_name', label: 'Deal Name' },
  { key: 'company', label: 'Company' },
  { key: 'contact', label: 'Contact' },
  { key: 'email', label: 'Email' },
  { key: 'deal_stage', label: 'Deal Stage' },
  { key: 'deal_owner', label: 'Deal Owner' },
  { key: 'amount', label: 'Amount' },
  { key: 'last_activity', label: 'Last Activity' },
  { key: 'notes', label: 'Notes' },
  { key: 'close_date', label: 'Close Date' },
  { key: 'service_of_interest', label: 'Service of Interest' },
] as const;

export type TargetFieldKey = typeof TARGET_FIELDS[number]['key'];
export type ColumnMapping = Record<string, TargetFieldKey | null>;

const FIELD_ALIASES: Record<TargetFieldKey, string[]> = {
  record_id: [
    'record id', 'id', 'deal id', 'record number', 'row id', 'entry id',
    'identifier', 'uid', 'ref', 'reference', 'record', 'rec id',
  ],
  deal_name: [
    'deal name', 'deal', 'opportunity', 'opportunity name', 'opp name',
    'project', 'project name', 'title', 'deal title', 'opp',
  ],
  company: [
    'company', 'company name', 'organization', 'org', 'account',
    'account name', 'business', 'business name', 'client', 'client name', 'firm',
  ],
  contact: [
    'contact', 'contact name', 'contact person', 'point of contact', 'poc',
    'customer name', 'customer', 'full name', 'lead name', 'lead',
    'prospect', 'prospect name', 'name', 'person',
  ],
  email: [
    'email', 'email address', 'e mail', 'contact email', 'mail', 'email id',
  ],
  deal_stage: [
    'deal stage', 'stage', 'status', 'pipeline stage', 'sales stage',
    'phase', 'deal status', 'pipeline', 'lifecycle stage', 'funnel stage',
  ],
  deal_owner: [
    'deal owner', 'owner', 'assigned to', 'sales rep', 'salesperson', 'rep',
    'agent', 'account manager', 'assigned', 'account executive',
    'responsible', 'handled by', 'manager',
  ],
  amount: [
    'amount', 'value', 'deal value', 'deal amount', 'revenue', 'price',
    'total', 'contract value', 'arr', 'mrr', 'worth', 'budget',
    'total value', 'contract amount', 'deal size',
  ],
  last_activity: [
    'last activity', 'last contact', 'last interaction', 'last touched',
    'last updated', 'activity date', 'last activity date', 'last engagement',
  ],
  notes: [
    'notes', 'note', 'comments', 'comment', 'description', 'details',
    'associated note', 'remarks', 'memo', 'info', 'additional info', 'summary',
  ],
  close_date: [
    'close date', 'close', 'expected close', 'expected close date',
    'closing date', 'completion date', 'due date', 'target date',
    'closed date', 'end date', 'deadline',
  ],
  service_of_interest: [
    'service of interest', 'service', 'product', 'product of interest',
    'interest', 'category', 'type of service', 'offering',
    'product name', 'service name', 'solution', 'package',
  ],
};

export function tryAutoMap(headers: string[]): { mapping: ColumnMapping; matchedCount: number } {
  const mapping: ColumnMapping = {};
  const usedFields = new Set<string>();
  let matchedCount = 0;

  for (const header of headers) {
    const normalized = header.toLowerCase().trim()
      .replace(/[_\-\.\/\\]/g, ' ')
      .replace(/\s+/g, ' ');

    let bestMatch: TargetFieldKey | null = null;

    for (const [field, aliases] of Object.entries(FIELD_ALIASES) as [TargetFieldKey, string[]][]) {
      if (usedFields.has(field)) continue;
      if (aliases.includes(normalized)) {
        bestMatch = field;
        break;
      }
    }

    mapping[header] = bestMatch;
    if (bestMatch) {
      usedFields.add(bestMatch);
      matchedCount++;
    }
  }

  return { mapping, matchedCount };
}

export function applyMapping(
  headers: string[],
  rows: string[][],
  mapping: ColumnMapping
): Record<string, string>[] {
  return rows.map(row => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      const targetField = mapping[header];
      if (targetField && row[index] !== undefined) {
        record[targetField] = (row[index] || '').replace(/^"/, '').replace(/"$/, '').trim();
      }
    });
    return record;
  });
}
