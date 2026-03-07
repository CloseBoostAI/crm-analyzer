/**
 * Email sync: fetch emails from Gmail/Outlook via OAuth connections and store in inbound_emails.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import {
  listGmailMessages,
  listAllGmailMessageIds,
  getGmailMessage,
  parseGmailMessage,
  refreshGmailToken,
} from '@/lib/email/gmail';
import {
  listOutlookMessages,
  parseOutlookMessage,
  refreshOutlookToken,
} from '@/lib/email/outlook';

const MAX_MESSAGES_PER_CONNECTION = 30;

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

export async function syncConnectionsForUser(userId: string): Promise<{ synced: number; errors: string[] }> {
  const admin = createAdminClient();
  const errors: string[] = [];
  let synced = 0;

  const { data: connections, error: connError } = await admin
    .from('email_connections')
    .select('id, user_id, organization_id, provider, email, access_token, refresh_token, token_expires_at')
    .eq('user_id', userId)
    .not('access_token', 'is', null);

  if (connError || !connections?.length) {
    return { synced: 0, errors: connError ? [connError.message] : [] };
  }

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

      const orgId = await getUserOrgId(admin, conn.user_id);
      if (!orgId) {
        errors.push(`No org for user ${conn.user_id}`);
        continue;
      }

      const count =
        conn.provider === 'gmail'
          ? await syncGmailConnection(admin, conn, accessToken, orgId)
          : await syncOutlookConnection(admin, conn, accessToken, orgId);
      synced += count;
    } catch (err) {
      errors.push(`${conn.email} (${conn.provider}): ${(err as Error).message}`);
    }
  }

  return { synced, errors };
}

export async function syncAllConnections(): Promise<{ synced: number; errors: string[] }> {
  const admin = createAdminClient();
  const errors: string[] = [];
  let synced = 0;

  const { data: connections, error: connError } = await admin
    .from('email_connections')
    .select('id, user_id, organization_id, provider, email, access_token, refresh_token, token_expires_at')
    .not('access_token', 'is', null);

  if (connError || !connections?.length) {
    return { synced: 0, errors: connError ? [connError.message] : [] };
  }

  for (const conn of connections as EmailConnection[]) {
    try {
      let accessToken = conn.access_token;
      const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0;
      const now = Date.now();
      const bufferMs = 5 * 60 * 1000; // 5 min buffer

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

      const orgId = await getUserOrgId(admin, conn.user_id);
      if (!orgId) {
        errors.push(`No org for user ${conn.user_id}`);
        continue;
      }

      const count =
        conn.provider === 'gmail'
          ? await syncGmailConnection(admin, conn, accessToken, orgId)
          : await syncOutlookConnection(admin, conn, accessToken, orgId);
      synced += count;
    } catch (err) {
      errors.push(`${conn.email} (${conn.provider}): ${(err as Error).message}`);
    }
  }

  return { synced, errors };
}

async function getUserOrgId(
  admin: ReturnType<typeof createAdminClient>,
  userId: string
): Promise<string | null> {
  const { data } = await admin
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId)
    .limit(1)
    .single();
  return data?.organization_id ?? null;
}

async function syncGmailConnection(
  admin: ReturnType<typeof createAdminClient>,
  conn: EmailConnection,
  accessToken: string,
  orgId: string
): Promise<number> {
  const gmailIds = await listAllGmailMessageIds(accessToken, 100);
  if (gmailIds.length > 0) {
    const quoted = gmailIds.map((id) => `"${String(id).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
    await admin
      .from('inbound_emails')
      .delete()
      .eq('connection_id', conn.id)
      .not('message_id', 'in', `(${quoted.join(',')})`);
  } else {
    await admin.from('inbound_emails').delete().eq('connection_id', conn.id);
  }

  let count = 0;
  let pageToken: string | undefined;

  do {
    const list = await listGmailMessages(
      accessToken,
      Math.min(50, MAX_MESSAGES_PER_CONNECTION - count),
      pageToken
    );
    const messages = list.messages || [];
    if (messages.length === 0) break;

    for (const m of messages) {
      try {
        const full = await getGmailMessage(accessToken, m.id);
        const parsed = parseGmailMessage(full);
        const inserted = await insertSyncedEmail(admin, {
          connectionId: conn.id,
          userId: conn.user_id,
          orgId,
          messageId: m.id,
          threadId: m.threadId,
          ...parsed,
        });
        if (inserted) count++;
      } catch {
        // Skip message on error
      }
    }
    pageToken = list.nextPageToken;
  } while (pageToken && count < MAX_MESSAGES_PER_CONNECTION);

  return count;
}

async function syncOutlookConnection(
  admin: ReturnType<typeof createAdminClient>,
  conn: EmailConnection,
  accessToken: string,
  orgId: string
): Promise<number> {
  const list = await listOutlookMessages(accessToken, 100);
  const messages = list.value || [];
  const outlookIds = messages.map((m) => m.id).filter(Boolean);
  if (outlookIds.length > 0) {
    const quoted = outlookIds.map((id) => `"${String(id).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
    await admin
      .from('inbound_emails')
      .delete()
      .eq('connection_id', conn.id)
      .not('message_id', 'in', `(${quoted.join(',')})`);
  } else {
    await admin.from('inbound_emails').delete().eq('connection_id', conn.id);
  }

  const messagesToSync = messages.slice(0, MAX_MESSAGES_PER_CONNECTION);
  let count = 0;

  for (const m of messagesToSync) {
    try {
      const parsed = parseOutlookMessage(m);
      const inserted = await insertSyncedEmail(admin, {
        connectionId: conn.id,
        userId: conn.user_id,
        orgId,
        messageId: m.id,
        threadId: m.conversationId || undefined,
        ...parsed,
      });
      if (inserted) count++;
    } catch {
      // Skip
    }
  }
  return count;
}

async function insertSyncedEmail(
  admin: ReturnType<typeof createAdminClient>,
  params: {
    connectionId: string;
    userId: string;
    orgId: string;
    messageId: string;
    threadId?: string;
    from: string;
    fromRaw: string;
    to: string;
    subject: string;
    bodyText: string;
    bodyHtml: string;
  }
): Promise<boolean> {
  const { dealId, dealName } = await matchSenderToDeal(admin, params.orgId, params.from);

  const { error } = await admin.from('inbound_emails').insert({
    organization_id: params.orgId,
    user_id: params.userId,
    connection_id: params.connectionId,
    message_id: params.messageId,
    thread_id: params.threadId || null,
    sender_email: params.from,
    sender_name: extractSenderName(params.fromRaw) || null,
    to_email: params.to,
    subject: params.subject || '(no subject)',
    body_text: params.bodyText || null,
    body_html: params.bodyHtml || null,
    deal_id: dealId,
    deal_name: dealName,
    status: 'pending',
    received_at: new Date().toISOString(),
  });

  if (error) {
    if (error.code === '23505') return false; // Unique violation = already synced
    throw error;
  }

  if (dealId) {
    await updateDealActivity(admin, dealId, params.userId);
  }
  return true;
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

async function updateDealActivity(
  admin: ReturnType<typeof createAdminClient>,
  dealId: string,
  userId: string
): Promise<void> {
  await admin
    .from('deals')
    .update({ last_activity: new Date().toISOString() })
    .eq('id', dealId)
    .eq('user_id', userId);
}
