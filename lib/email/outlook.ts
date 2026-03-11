/**
 * Microsoft Outlook / Microsoft 365 OAuth and Graph API helpers.
 */

const MS_AUTH_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const MS_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const MS_GRAPH_ME = 'https://graph.microsoft.com/v1.0/me';
const MS_GRAPH_INBOX = 'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages';

export const OUTLOOK_SCOPES = [
  'Mail.Read',
  'Mail.Send',
  'offline_access',
  'User.Read',
  'openid',
].join(' ');

export interface OutlookTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

export interface OutlookUserInfo {
  mail?: string;
  userPrincipalName?: string;
}

export function getOutlookAuthUrl(redirectUri: string, state: string): string {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  if (!clientId) throw new Error('MICROSOFT_CLIENT_ID is not configured');

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: OUTLOOK_SCOPES,
    response_mode: 'query',
    prompt: 'consent',
    state,
  });

  return `${MS_AUTH_URL}?${params.toString()}`;
}

export async function exchangeOutlookCode(
  code: string,
  redirectUri: string
): Promise<OutlookTokens> {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Microsoft OAuth credentials are not configured');
  }

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });

  const res = await fetch(MS_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token exchange failed: ${err}`);
  }

  const data = (await res.json()) as OutlookTokens & { error?: string };
  if (data.error) throw new Error(data.error);
  return data;
}

export interface OutlookMessage {
  id: string;
  conversationId?: string;
  from?: { emailAddress?: { address?: string; name?: string } };
  toRecipients?: { emailAddress?: { address?: string; name?: string } }[];
  subject?: string;
  bodyPreview?: string;
  body?: { content?: string; contentType?: string };
  receivedDateTime?: string;
}

export interface OutlookMessageList {
  value?: OutlookMessage[];
  '@odata.nextLink'?: string;
}

const MS_GRAPH_MESSAGE = 'https://graph.microsoft.com/v1.0/me/messages';

export async function getOutlookMessage(
  accessToken: string,
  messageId: string
): Promise<OutlookMessage> {
  const url = `${MS_GRAPH_MESSAGE}/${messageId}?$select=id,conversationId,from,toRecipients,subject,bodyPreview,body,receivedDateTime`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Outlook get message failed: ${await res.text()}`);
  return res.json();
}

export async function listOutlookMessages(
  accessToken: string,
  top = 50
): Promise<OutlookMessageList> {
  const url = `${MS_GRAPH_INBOX}?$top=${top}&$orderby=receivedDateTime desc&$select=id,conversationId,from,toRecipients,subject,bodyPreview,body,receivedDateTime`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Outlook list failed: ${await res.text()}`);
  return res.json();
}

/** Search for messages from a sender (to find threads for webhook emails) */
export async function searchOutlookMessagesFrom(
  accessToken: string,
  fromEmail: string,
  top = 10
): Promise<OutlookMessage[]> {
  const escaped = fromEmail.replace(/'/g, "''");
  const url = `https://graph.microsoft.com/v1.0/me/messages?$filter=(from/emailAddress/address eq '${escaped}')&$top=${top}&$select=id,conversationId,from,subject,receivedDateTime&$orderby=receivedDateTime desc`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as OutlookMessageList;
  return data.value || [];
}

/** Search for messages we sent TO a recipient (user-initiated conversations) */
export async function searchOutlookMessagesTo(
  accessToken: string,
  toEmail: string,
  top = 10
): Promise<OutlookMessage[]> {
  const searchTerm = encodeURIComponent(`"to:${toEmail}"`);
  const url = `https://graph.microsoft.com/v1.0/me/mailFolders/SentItems/messages?$search=${searchTerm}&$top=${top}&$select=id,conversationId,from,toRecipients,subject,receivedDateTime`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as OutlookMessageList;
  return data.value || [];
}

/** List all messages in a conversation (inbox + sent) for full thread view */
export async function listOutlookMessagesByConversation(
  accessToken: string,
  conversationId: string
): Promise<OutlookMessage[]> {
  const escaped = conversationId.replace(/'/g, "''");
  const url = `https://graph.microsoft.com/v1.0/me/messages?$filter=conversationId eq '${escaped}'&$select=id,conversationId,from,toRecipients,subject,bodyPreview,body,receivedDateTime&$orderby=receivedDateTime asc`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as OutlookMessageList;
  return data.value || [];
}

export function parseOutlookMessage(msg: OutlookMessage): {
  from: string;
  fromRaw: string;
  to: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  date?: string;
} {
  const addr = msg.from?.emailAddress?.address || '';
  const name = msg.from?.emailAddress?.name || '';
  const fromRaw = name ? `${name} <${addr}>` : addr;
  const from = addr.toLowerCase();
  const toRecipient = msg.toRecipients?.[0]?.emailAddress?.address || '';
  const to = toRecipient.toLowerCase();
  const subject = msg.subject?.trim() || '(no subject)';
  const bodyContent = msg.body?.content || msg.bodyPreview || '';
  const isHtml = msg.body?.contentType?.toLowerCase() === 'html';
  return {
    from,
    fromRaw,
    to,
    subject,
    bodyText: isHtml ? '' : bodyContent,
    bodyHtml: isHtml ? bodyContent : '',
    date: msg.receivedDateTime,
  };
}

export async function getOutlookUserEmail(accessToken: string): Promise<string> {
  const res = await fetch(MS_GRAPH_ME, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error('Failed to fetch user email');
  }

  const data = (await res.json()) as OutlookUserInfo;
  const email = data.mail || data.userPrincipalName;
  return email?.toLowerCase() || '';
}

const MS_GRAPH_SEND = 'https://graph.microsoft.com/v1.0/me/sendMail';

// Microsoft Graph requires custom headers to start with 'X-'
const LIST_UNSUBSCRIBE_HEADERS = [
  { name: 'X-List-Unsubscribe', value: '<mailto:unsubscribe@closeboost.ai?subject=unsubscribe>' },
  { name: 'X-List-Unsubscribe-Post', value: 'List-Unsubscribe=One-Click' },
];

export interface SendOutlookParams {
  to: string;
  toName?: string;
  subject: string;
  body: string;
}

/** Send a new email via Microsoft Graph (for webhook emails or new threads) */
export async function sendOutlookMessage(
  accessToken: string,
  params: SendOutlookParams
): Promise<void> {
  const res = await fetch(MS_GRAPH_SEND, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        subject: params.subject,
        body: {
          contentType: 'Text',
          content: params.body,
        },
        toRecipients: [
          {
            emailAddress: {
              address: params.to,
              name: params.toName || params.to,
            },
          },
        ],
        internetMessageHeaders: LIST_UNSUBSCRIBE_HEADERS,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Outlook send failed: ${err}`);
  }
}

/** Reply to an existing Outlook message (keeps thread) */
export async function replyOutlookMessage(
  accessToken: string,
  messageId: string,
  comment: string
): Promise<void> {
  const url = `https://graph.microsoft.com/v1.0/me/messages/${messageId}/reply`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      comment,
      message: { internetMessageHeaders: LIST_UNSUBSCRIBE_HEADERS },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Outlook reply failed: ${err}`);
  }
}

export async function refreshOutlookToken(refreshToken: string): Promise<OutlookTokens> {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Microsoft OAuth credentials are not configured');
  }

  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
  });

  const res = await fetch(MS_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token refresh failed: ${err}`);
  }

  const data = (await res.json()) as OutlookTokens & { error?: string };
  if (data.error) throw new Error(data.error);
  return data;
}
