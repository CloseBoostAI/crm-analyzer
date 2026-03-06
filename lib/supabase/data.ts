import { createClient } from './client';
import type { Deal, Customer, CRMLog } from '@/lib/utils';

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
};

async function getUserId(): Promise<string> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  return user.id;
}

// --- Deals ---

export async function saveDeals(deals: Deal[]) {
  const supabase = createClient();
  const userId = await getUserId();

  // Delete deals that are no longer in the new list (sync deletions from CRM)
  const keepIds = deals.map((d) => d.id);
  if (keepIds.length === 0) {
    const { error: delErr } = await supabase.from('deals').delete().eq('user_id', userId);
    if (delErr) throw delErr;
  } else {
    const { data: existing } = await supabase.from('deals').select('id').eq('user_id', userId);
    const toDelete = (existing || []).filter((r) => !keepIds.includes(r.id)).map((r) => r.id);
    if (toDelete.length > 0) {
      const { error: delErr } = await supabase.from('deals').delete().in('id', toDelete).eq('user_id', userId);
      if (delErr) throw delErr;
    }
  }

  const rows = deals.map((d) => ({
    id: d.id,
    user_id: userId,
    name: d.name || '',
    stage: d.stage || '',
    owner: d.owner || '',
    contact: d.contact || '',
    amount: d.amount || 0,
    priority: d.priority || 'Low',
    contact_id: d.contactId || '',
    notes: d.notes || '',
    close_date: d.closeDate || '',
    email: d.email || '',
    company: d.company || '',
    last_activity: d.lastActivity || '',
  }));

  const { error } = await supabase.from('deals').upsert(rows, {
    onConflict: 'id,user_id',
  });

  if (error) throw error;
}

export async function loadDeals(): Promise<Deal[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('deals')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data || []).map((row) => ({
    id: row.id,
    name: row.name,
    stage: row.stage,
    owner: row.owner,
    contact: row.contact,
    amount: Number(row.amount),
    priority: row.priority as Deal['priority'],
    contactId: row.contact_id,
    notes: row.notes,
    closeDate: row.close_date,
    email: row.email,
    company: row.company,
    lastActivity: row.last_activity || '',
  }));
}

export async function updateDeal(dealId: string, updates: Partial<Deal>) {
  const supabase = createClient();
  const userId = await getUserId();

  const dbUpdates: Record<string, unknown> = {};
  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.company !== undefined) dbUpdates.company = updates.company;
  if (updates.stage !== undefined) dbUpdates.stage = updates.stage;
  if (updates.owner !== undefined) dbUpdates.owner = updates.owner;
  if (updates.contact !== undefined) dbUpdates.contact = updates.contact;
  if (updates.amount !== undefined) dbUpdates.amount = updates.amount;
  if (updates.priority !== undefined) dbUpdates.priority = updates.priority;
  if (updates.email !== undefined) dbUpdates.email = updates.email;
  if (updates.notes !== undefined) dbUpdates.notes = updates.notes;
  if (updates.closeDate !== undefined) dbUpdates.close_date = updates.closeDate;
  if (updates.lastActivity !== undefined) dbUpdates.last_activity = updates.lastActivity;

  const { error } = await supabase
    .from('deals')
    .update(dbUpdates)
    .eq('id', dealId)
    .eq('user_id', userId);

  if (error) throw error;
}

export async function deleteDeal(dealId: string) {
  const supabase = createClient();
  const userId = await getUserId();

  const { error } = await supabase
    .from('deals')
    .delete()
    .eq('id', dealId)
    .eq('user_id', userId);

  if (error) throw error;
}

export async function deleteDeals(dealIds: string[]) {
  if (dealIds.length === 0) return;
  const supabase = createClient();
  const userId = await getUserId();

  const { error: dealsErr } = await supabase
    .from('deals')
    .delete()
    .in('id', dealIds)
    .eq('user_id', userId);

  if (dealsErr) throw dealsErr;

  // Customers share ids with deals; remove them too
  const { error: customersErr } = await supabase
    .from('customers')
    .delete()
    .in('id', dealIds)
    .eq('user_id', userId);

  if (customersErr) throw customersErr;
}

// --- Customers ---

export async function saveCustomers(customers: Customer[]) {
  const supabase = createClient();
  const userId = await getUserId();

  // Delete customers that are no longer in the new list (sync deletions from CRM)
  const keepIds = customers.map((c) => c.id);
  if (keepIds.length === 0) {
    const { error: delErr } = await supabase.from('customers').delete().eq('user_id', userId);
    if (delErr) throw delErr;
  } else {
    const { data: existing } = await supabase.from('customers').select('id').eq('user_id', userId);
    const toDelete = (existing || []).filter((r) => !keepIds.includes(r.id)).map((r) => r.id);
    if (toDelete.length > 0) {
      const { error: delErr } = await supabase.from('customers').delete().in('id', toDelete).eq('user_id', userId);
      if (delErr) throw delErr;
    }
  }

  const rows = customers.map((c) => ({
    id: c.id,
    user_id: userId,
    name: c.name || '',
    email: c.email || '',
    company: c.company || '',
    last_contact: c.lastContact || '',
    status: c.status || 'Lead',
    value: c.value || 0,
    next_action: c.nextAction || '',
    customer_intent: c.customerIntent || '',
    notes: c.notes || [],
    interactions: c.interactions || [],
  }));

  const { error } = await supabase.from('customers').upsert(rows, {
    onConflict: 'id,user_id',
  });

  if (error) throw error;
}

export async function deleteCustomer(customerId: string) {
  const supabase = createClient();
  const userId = await getUserId();

  const { error } = await supabase
    .from('customers')
    .delete()
    .eq('id', customerId)
    .eq('user_id', userId);

  if (error) throw error;
}

export async function loadCustomers(): Promise<Customer[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data || []).map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    company: row.company,
    lastContact: row.last_contact,
    status: row.status as Customer['status'],
    value: Number(row.value),
    nextAction: row.next_action,
    customerIntent: row.customer_intent,
    notes: row.notes || [],
    interactions: row.interactions || [],
  }));
}

// --- Logs ---

export async function saveLogs(logs: CRMLog[]) {
  const supabase = createClient();
  const userId = await getUserId();

  const rows = logs.map((l) => ({
    user_id: userId,
    customer_id: l.customerId || '',
    timestamp: l.timestamp || '',
    type: l.type || '',
    notes: l.notes || '',
    outcome: l.outcome || '',
  }));

  const { error } = await supabase.from('logs').insert(rows);
  if (error) throw error;
}

export async function loadLogs(): Promise<CRMLog[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('logs')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data || []).map((row) => ({
    customerId: row.customer_id,
    timestamp: row.timestamp,
    type: row.type,
    notes: row.notes,
    outcome: row.outcome,
  }));
}

// --- Tasks ---

export async function loadTasks(): Promise<Task[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data || []).map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status as Task['status'],
    dueDate: Number(row.due_date),
    priority: row.priority as Task['priority'],
    associatedDealId: row.associated_deal_id || undefined,
    associatedDealName: row.associated_deal_name || undefined,
    assignedTo: row.assigned_to,
    notes: row.notes || undefined,
  }));
}

export async function saveTask(task: Task) {
  const supabase = createClient();
  const userId = await getUserId();

  const { error } = await supabase.from('tasks').upsert(
    {
      id: task.id,
      user_id: userId,
      title: task.title,
      status: task.status,
      due_date: task.dueDate,
      priority: task.priority,
      associated_deal_id: task.associatedDealId || null,
      associated_deal_name: task.associatedDealName || null,
      assigned_to: task.assignedTo,
      notes: task.notes || null,
    },
    { onConflict: 'id,user_id' }
  );

  if (error) throw error;
}

export async function updateTask(taskId: string, updates: Partial<Task>) {
  const supabase = createClient();
  const userId = await getUserId();

  const dbUpdates: Record<string, unknown> = {};
  if (updates.title !== undefined) dbUpdates.title = updates.title;
  if (updates.status !== undefined) dbUpdates.status = updates.status;
  if (updates.dueDate !== undefined) dbUpdates.due_date = updates.dueDate;
  if (updates.priority !== undefined) dbUpdates.priority = updates.priority;
  if (updates.associatedDealId !== undefined) dbUpdates.associated_deal_id = updates.associatedDealId;
  if (updates.associatedDealName !== undefined) dbUpdates.associated_deal_name = updates.associatedDealName;
  if (updates.assignedTo !== undefined) dbUpdates.assigned_to = updates.assignedTo;
  if (updates.notes !== undefined) dbUpdates.notes = updates.notes;

  const { error } = await supabase
    .from('tasks')
    .update(dbUpdates)
    .eq('id', taskId)
    .eq('user_id', userId);

  if (error) throw error;
}

export async function deleteTask(taskId: string) {
  const supabase = createClient();
  const userId = await getUserId();

  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', taskId)
    .eq('user_id', userId);

  if (error) throw error;
}

// --- Dismissed Recommendations (Smart Tasks) ---

export async function loadDismissedRecommendations(): Promise<string[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('dismissed_recommendations')
    .select('task_ids')
    .maybeSingle();

  if (error) throw error;
  const ids = data?.task_ids;
  return Array.isArray(ids) ? ids : [];
}

export async function saveDismissedRecommendations(taskIds: string[]) {
  const supabase = createClient();
  const userId = await getUserId();

  const { error } = await supabase.from('dismissed_recommendations').upsert(
    {
      user_id: userId,
      task_ids: taskIds,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );

  if (error) throw error;
}

// --- User Settings ---

export async function loadUserSettings(): Promise<Record<string, unknown> | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('user_settings')
    .select('settings')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) throw error;
  // Return {} when no row (user exists but hasn't saved settings yet), otherwise the saved settings
  if (!data) return {};
  const s = data.settings;
  return s && typeof s === 'object' ? (s as Record<string, unknown>) : {};
}

export async function saveUserSettings(settings: Record<string, unknown>) {
  const supabase = createClient();
  const userId = await getUserId();

  const { error } = await supabase.from('user_settings').upsert(
    {
      user_id: userId,
      settings,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );

  if (error) throw error;
}
