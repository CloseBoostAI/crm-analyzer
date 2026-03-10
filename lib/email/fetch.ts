/**
 * Fetch emails from Gmail/Outlook on demand (no DB storage).
 */

import { createAdminClient } from '@/lib/supabase/admin';
import {
  listGmailMessages,
  getGmailMessage,
  parseGmailMessage,
  refreshGmailToken,
} from '@/lib/email/gmail';
import {
  getOutlookMessage,
  listOutlookMessages,
  parseOutlookMessage,
  refreshOutlookToken,
} from '@/lib/email/outlook';

const MAX_MESSAGES_PER_CONNECTION = 50;

export type FetchedEmail = {
  id: string; // connectionId:messageId for OAuth
  connectionId: string;
  messageId: string;
  threadId: string | null;
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
};

interface EmailConnection {
  id: string;
  user_id: string;
  organization_id: string | null;
  provider: string;
  email: string;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
}

function extractSenderName(fromRaw: string): string {
  const match = fromRaw.match(/^([^<]+)</);
  return match ? match[1].trim() : '';
}

/** OAuth email composite id */
export function oauthEmailId(connectionId: string, messageId: string): string {
  return `${connectionId}:${messageId}`;
}

/** Parse composite id back to connectionId and messageId */
export function parseOauthEmailId(id: string): { connectionId: string; messageId: string } | null {
  const idx = id.indexOf(':');
  if (idx <= 0 || idx >= id.length - 1) return null;
  return { connectionId: id.slice(0, idx), messageId: id.slice(idx + 1) };
}

export async function fetchEmailsForOrg(
  organizationId: string,
  statusFilter?: 'pending' | 'acknowledged' | 'replied',
  limit = 50
): Promise<FetchedEmail[]> {
  const admin = createAdminClient();

  const { data: members } = await admin
    .from('organization_members')
    .select('user_id')
    .eq('organization_id', organizationId);
  const userIds = (members || []).map((m: { user_id: string }) => m.user_id);
  if (userIds.length === 0) return [];

  const { data: connections, error: connError } = await admin
    .from('email_connections')
    .select('id, user_id, organization_id, provider, email, access_token, refresh_token, token_expires_at')
    .in('user_id', userIds)
    .not('access_token', 'is', null);

  if (connError || !connections?.length) return [];

  const statusMap = await loadEmailStatusMap(admin, connections as EmailConnection[]);

  const allEmails: FetchedEmail[] = [];

  for (const conn of connections as EmailConnection[]) {
    try {
      let accessToken = conn.access_token;
      const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0;
      const now = Date.now();
      const bufferMs = 5 * 60 * 1000;

      if (conn.refresh_token && (expiresAt === 0 || expiresAt < now + bufferMs)) {
        const refreshed =
          conn.provider === 'gmail'
            ? await refreshGmailToken(conn.refresh_token)
            : await refreshOutlookToken(conn.refresh_token);
        accessToken = refreshed.access_token;
        const tokenExpiresAt = refreshed.expires_in
          ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
          : null;
        await admin
          .from('email_connections')
          .update({
            access_token: accessToken,
            token_expires_at: tokenExpiresAt,
            updated_at: new Date().toISOString(),
          })
          .eq('id', conn.id);
      }

      const emails =
        conn.provider === 'gmail'
          ? await fetchGmailEmails(admin, conn, accessToken, organizationId, statusMap)
          : await fetchOutlookEmails(admin, conn, accessToken, organizationId, statusMap);

      allEmails.push(...emails);
    } catch (err) {
      console.error(`[fetch] ${conn.email} (${conn.provider}):`, err);
    }
  }

  allEmails.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());

  let filtered = allEmails;
  if (statusFilter) {
    filtered = allEmails.filter((e) => e.status === statusFilter);
  }
  return filtered.slice(0, limit);
}

async function loadEmailStatusMap(
  admin: ReturnType<typeof createAdminClient>,
  connections: EmailConnection[]
): Promise<Map<string, 'pending' | 'acknowledged' | 'replied'>> {
  const connectionIds = connections.map((c) => c.id);
  const { data: rows } = await admin
    .from('email_status')
    .select('connection_id, message_id, status')
    .in('connection_id', connectionIds);

  const map = new Map<string, 'pending' | 'acknowledged' | 'replied'>();
  for (const r of rows || []) {
    const key = `${r.connection_id}:${r.message_id}`;
    if (['pending', 'acknowledged', 'replied'].includes(r.status || '')) {
      map.set(key, r.status as 'pending' | 'acknowledged' | 'replied');
    }
  }
  return map;
}

async function fetchGmailEmails(
  admin: ReturnType<typeof createAdminClient>,
  conn: EmailConnection,
  accessToken: string,
  orgId: string,
  statusMap: Map<string, 'pending' | 'acknowledged' | 'replied'>
): Promise<FetchedEmail[]> {
  const list = await listGmailMessages(accessToken, MAX_MESSAGES_PER_CONNECTION);
  const messages = list.messages || [];
  const results: FetchedEmail[] = [];

  for (const m of messages) {
    try {
      const full = await getGmailMessage(accessToken, m.id);
      const parsed = parseGmailMessage(full);
      const statusKey = `${conn.id}:${m.id}`;
      const status = statusMap.get(statusKey) || 'pending';
      const { dealId, dealName } = await matchSenderToDeal(admin, orgId, parsed.from);
      const receivedAt = parsed.date ? new Date(parsed.date).toISOString() : new Date().toISOString();

      results.push({
        id: oauthEmailId(conn.id, m.id),
        connectionId: conn.id,
        messageId: m.id,
        threadId: m.threadId || null,
        senderEmail: parsed.from,
        senderName: extractSenderName(parsed.fromRaw) || null,
        toEmail: parsed.to,
        subject: parsed.subject || '(no subject)',
        bodyText: parsed.bodyText || null,
        bodyHtml: parsed.bodyHtml || null,
        dealId,
        dealName,
        status,
        receivedAt,
      });
    } catch {
      // Skip message on error
    }
  }
  return results;
}

async function fetchOutlookEmails(
  admin: ReturnType<typeof createAdminClient>,
  conn: EmailConnection,
  accessToken: string,
  orgId: string,
  statusMap: Map<string, 'pending' | 'acknowledged' | 'replied'>
): Promise<FetchedEmail[]> {
  const list = await listOutlookMessages(accessToken, MAX_MESSAGES_PER_CONNECTION);
  const messages = list.value || [];
  const results: FetchedEmail[] = [];

  for (const m of messages) {
    try {
      const parsed = parseOutlookMessage(m);
      const statusKey = `${conn.id}:${m.id}`;
      const status = statusMap.get(statusKey) || 'pending';
      const { dealId, dealName } = await matchSenderToDeal(admin, orgId, parsed.from);
      const receivedAt = parsed.date ? new Date(parsed.date).toISOString() : new Date().toISOString();

      results.push({
        id: oauthEmailId(conn.id, m.id),
        connectionId: conn.id,
        messageId: m.id,
        threadId: m.conversationId || null,
        senderEmail: parsed.from,
        senderName: extractSenderName(parsed.fromRaw) || null,
        toEmail: parsed.to,
        subject: parsed.subject || '(no subject)',
        bodyText: parsed.bodyText || null,
        bodyHtml: parsed.bodyHtml || null,
        dealId,
        dealName,
        status,
        receivedAt,
      });
    } catch {
      // Skip
    }
  }
  return results;
}

async function matchSenderToDeal(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  senderEmail: string
): Promise<{ dealId: string | null; dealName: string | null }> {
  const { data: members } = await admin
    .from('organization_members')
    .select('user_id')
    .eq('organization_id', orgId);
  const userIds = (members || []).map((m: { user_id: string }) => m.user_id);
  if (userIds.length === 0) return { dealId: null, dealName: null };

  const { data: deal } = await admin
    .from('deals')
    .select('id, name')
    .in('user_id', userIds)
    .ilike('email', senderEmail)
    .limit(1)
    .single();

  return deal
    ? { dealId: deal.id, dealName: deal.name || null }
    : { dealId: null, dealName: null };
}

/** Fetch a single email by connectionId+messageId for AI reply (with optional thread).
 * Verifies user is in the same org as the connection. */
export async function fetchEmailForReply(
  connectionId: string,
  messageId: string,
  userId: string,
  organizationId: string
): Promise<{
  senderEmail: string;
  senderName: string | null;
  subject: string;
  bodyText: string | null;
  bodyHtml: string | null;
  threadId: string | null;
  receivedAt: string;
  threadEmails: Array<{ senderEmail: string; senderName: string | null; subject: string; bodyText: string; receivedAt: string }>;
} | null> {
  const admin = createAdminClient();

  const { data: conn, error: connError } = await admin
    .from('email_connections')
    .select('id, user_id, organization_id, provider, access_token, refresh_token, token_expires_at')
    .eq('id', connectionId)
    .single();

  if (connError || !conn) return null;

  const connTyped = conn as EmailConnection & { organization_id: string | null };
  const orgMatches = connTyped.organization_id === organizationId;
  if (!orgMatches) {
    if (connTyped.organization_id != null) return null;
    const { data: member } = await admin
      .from('organization_members')
      .select('user_id')
      .eq('organization_id', organizationId)
      .eq('user_id', connTyped.user_id)
      .single();
    if (!member) return null;
  }

  const { data: membership } = await admin
    .from('organization_members')
    .select('user_id')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .single();
  if (!membership) return null;

  let accessToken = connTyped.access_token;
  const expiresAt = connTyped.token_expires_at ? new Date(connTyped.token_expires_at).getTime() : 0;
  const now = Date.now();
  const bufferMs = 5 * 60 * 1000;

  if (connTyped.refresh_token && (expiresAt === 0 || expiresAt < now + bufferMs)) {
    const refreshed =
      connTyped.provider === 'gmail'
        ? await refreshGmailToken(connTyped.refresh_token)
        : await refreshOutlookToken(connTyped.refresh_token);
    accessToken = refreshed.access_token;
    const tokenExpiresAt = refreshed.expires_in
      ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
      : null;
    await admin
      .from('email_connections')
      .update({
        access_token: accessToken,
        token_expires_at: tokenExpiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', connectionId);
  }

  if (connTyped.provider === 'gmail') {
    const msg = await getGmailMessage(accessToken, messageId);
    const parsed = parseGmailMessage(msg);
    const threadEmails: Array<{ senderEmail: string; senderName: string | null; subject: string; bodyText: string; receivedAt: string }> = [
      {
        senderEmail: parsed.from,
        senderName: extractSenderName(parsed.fromRaw) || null,
        subject: parsed.subject,
        bodyText: parsed.bodyText || parsed.bodyHtml || '',
        receivedAt: parsed.date ? new Date(parsed.date).toISOString() : new Date().toISOString(),
      },
    ];

    if (msg.threadId) {
      const threadList = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/threads/${msg.threadId}?format=full`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      ).then((r) => (r.ok ? r.json() : { messages: [] }));
      const threadMessages = threadList?.messages || [];
      for (const m of threadMessages) {
        if (m.id === messageId) continue;
        try {
          const t = await getGmailMessage(accessToken, m.id);
          const p = parseGmailMessage(t);
          threadEmails.push({
            senderEmail: p.from,
            senderName: extractSenderName(p.fromRaw) || null,
            subject: p.subject,
            bodyText: p.bodyText || p.bodyHtml || '',
            receivedAt: p.date ? new Date(p.date).toISOString() : new Date().toISOString(),
          });
        } catch {
          // skip
        }
      }
      threadEmails.sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
    }

    return {
      senderEmail: parsed.from,
      senderName: extractSenderName(parsed.fromRaw) || null,
      subject: parsed.subject,
      bodyText: parsed.bodyText || null,
      bodyHtml: parsed.bodyHtml || null,
      threadId: msg.threadId || null,
      receivedAt: parsed.date ? new Date(parsed.date).toISOString() : new Date().toISOString(),
      threadEmails,
    };
  }

  if (connTyped.provider === 'outlook') {
    let target;
    try {
      target = await getOutlookMessage(accessToken, messageId);
    } catch {
      return null;
    }

    const parsed = parseOutlookMessage(target);
    const convId = target.conversationId;
    let convMessages = [target];
    if (convId) {
      const list = await listOutlookMessages(accessToken, 100);
      const messages = list.value || [];
      convMessages = messages.filter((m) => m.conversationId === convId);
      if (convMessages.length === 0) convMessages = [target];
    }
    const threadEmails = convMessages
      .map((m) => {
        const p = parseOutlookMessage(m);
        return {
          senderEmail: p.from,
          senderName: extractSenderName(p.fromRaw) || null,
          subject: p.subject,
          bodyText: p.bodyText || p.bodyHtml || '',
          receivedAt: p.date ? new Date(p.date).toISOString() : new Date().toISOString(),
        };
      })
      .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));

    return {
      senderEmail: parsed.from,
      senderName: extractSenderName(parsed.fromRaw) || null,
      subject: parsed.subject,
      bodyText: parsed.bodyText || null,
      bodyHtml: parsed.bodyHtml || null,
      threadId: convId || null,
      receivedAt: parsed.date ? new Date(parsed.date).toISOString() : new Date().toISOString(),
      threadEmails,
    };
  }

  return null;
}

/** Fetch full email thread for deal activity (customer + user replies).
 * Returns messages in chronological order with isFromUser flag. */
export async function fetchThreadForDealEmail(
  connectionId: string,
  messageId: string,
  userId: string,
  organizationId: string
): Promise<{
  subject: string;
  messages: Array<{
    senderEmail: string;
    senderName: string | null;
    bodyText: string;
    receivedAt: string;
    isFromUser: boolean;
  }>;
} | null> {
  const admin = createAdminClient();

  const { data: members } = await admin
    .from('organization_members')
    .select('user_id')
    .eq('organization_id', organizationId);
  const userIds = (members || []).map((m: { user_id: string }) => m.user_id);
  const { data: connections } = await admin
    .from('email_connections')
    .select('email')
    .in('user_id', userIds);
  const orgEmails = new Set(
    (connections || []).map((c: { email: string }) => c.email?.toLowerCase()).filter(Boolean)
  );

  const result = await fetchEmailForReply(
    connectionId,
    messageId,
    userId,
    organizationId
  );

  if (!result) return null;

  const messages = result.threadEmails.map((m) => ({
    senderEmail: m.senderEmail,
    senderName: m.senderName,
    bodyText: m.bodyText,
    receivedAt: m.receivedAt,
    isFromUser: orgEmails.has(m.senderEmail?.toLowerCase() || ''),
  }));

  return {
    subject: result.subject,
    messages,
  };
}
