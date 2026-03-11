/**
 * Gmail OAuth and API helpers.
 * Uses Google OAuth 2.0 and Gmail API.
 */

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

export interface GmailTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

export interface GmailUserInfo {
  email: string;
  verified_email?: boolean;
}

export function getGmailAuthUrl(redirectUri: string, state: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID is not configured');

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GMAIL_SCOPES,
    access_type: 'offline',
    prompt: 'consent', // Force refresh_token on first auth
    state,
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export async function exchangeGmailCode(
  code: string,
  redirectUri: string
): Promise<GmailTokens> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth credentials are not configured');
  }

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token exchange failed: ${err}`);
  }

  const data = (await res.json()) as GmailTokens & { error?: string };
  if (data.error) throw new Error(data.error);
  return data;
}

export async function getGmailUserEmail(accessToken: string): Promise<string> {
  const res = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error('Failed to fetch user email');
  }

  const data = (await res.json()) as GmailUserInfo;
  return data.email?.toLowerCase() || '';
}

const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

export interface GmailMessageList {
  messages?: { id: string; threadId: string }[];
  nextPageToken?: string;
}

export interface GmailMessage {
  id: string;
  threadId: string;
  payload?: {
    headers?: { name: string; value: string }[];
    body?: { data?: string };
    parts?: { mimeType: string; body?: { data?: string }; headers?: { name: string; value: string }[] }[];
  };
}

function getHeader(headers: { name: string; value: string }[] | undefined, name: string): string {
  if (!headers) return '';
  const h = headers.find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h?.value || '';
}

function decodeBase64Url(str: string): string {
  try {
    const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(base64, 'base64').toString('utf-8');
  } catch {
    return '';
  }
}

function extractBody(payload: GmailMessage['payload']): { text: string; html: string } {
  let text = '';
  let html = '';
  if (!payload) return { text, html };

  if (payload.body?.data) {
    const decoded = decodeBase64Url(payload.body.data);
    if (payload.headers?.some((h) => h.name.toLowerCase() === 'content-type' && h.value.includes('html'))) {
      html = decoded;
    } else {
      text = decoded;
    }
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.body?.data) {
        const decoded = decodeBase64Url(part.body.data);
        if (part.mimeType?.toLowerCase().includes('html')) {
          html = decoded;
        } else if (part.mimeType?.toLowerCase().includes('text')) {
          text = decoded;
        }
      }
    }
  }
  return { text, html };
}

export async function listAllGmailMessageIds(
  accessToken: string,
  maxTotal = 100
): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  while (ids.length < maxTotal) {
    const list = await listGmailMessages(
      accessToken,
      Math.min(100, maxTotal - ids.length),
      pageToken
    );
    const messages = list.messages || [];
    for (const m of messages) ids.push(m.id);
    if (!list.nextPageToken || messages.length === 0) break;
    pageToken = list.nextPageToken;
  }
  return ids;
}

export async function listGmailMessages(
  accessToken: string,
  maxResults = 50,
  pageToken?: string
): Promise<GmailMessageList> {
  const params = new URLSearchParams({ maxResults: String(maxResults), labelIds: 'INBOX' });
  if (pageToken) params.set('pageToken', pageToken);
  const url = `${GMAIL_API_BASE}/messages?${params.toString()}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Gmail list failed: ${await res.text()}`);
  return res.json();
}

/** Search for messages from a sender (searches all mail including sent) to find threads */
export async function searchGmailMessagesFrom(
  accessToken: string,
  fromEmail: string,
  maxResults = 10
): Promise<GmailMessageList> {
  const q = `from:${fromEmail}`;
  const params = new URLSearchParams({ maxResults: String(maxResults), q });
  const url = `${GMAIL_API_BASE}/messages?${params.toString()}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return { messages: [] };
  return res.json();
}

export async function getGmailMessage(accessToken: string, messageId: string): Promise<GmailMessage> {
  const url = `${GMAIL_API_BASE}/messages/${messageId}?format=full`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Gmail get failed: ${await res.text()}`);
  return res.json();
}

export function parseGmailMessage(msg: GmailMessage): {
  from: string;
  fromRaw: string;
  to: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  date?: string;
} {
  const headers = msg.payload?.headers || [];
  const fromRaw = getHeader(headers, 'From');
  const from = fromRaw.match(/<([^>]+)>/)?.[1]?.trim().toLowerCase() || fromRaw.trim().toLowerCase();
  const to = getHeader(headers, 'To').trim().toLowerCase();
  const subject = getHeader(headers, 'Subject').trim() || '(no subject)';
  const date = getHeader(headers, 'Date');
  const { text, html } = extractBody(msg.payload);
  return { from, fromRaw, to, subject, bodyText: text, bodyHtml: html, date };
}

/** Build RFC 2822 message and base64url encode for Gmail API */
function buildGmailRaw(to: string, subject: string, body: string, fromEmail?: string): string {
  const from = fromEmail || 'noreply@example.com';
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'List-Unsubscribe: <mailto:unsubscribe@closeboost.ai?subject=unsubscribe>',
    'List-Unsubscribe-Post: List-Unsubscribe=One-Click',
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
  ];
  const raw = lines.join('\r\n');
  const base64 = Buffer.from(raw, 'utf-8').toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export interface SendGmailParams {
  to: string;
  subject: string;
  body: string;
  threadId?: string;
  fromEmail?: string;
}

export async function sendGmailMessage(
  accessToken: string,
  params: SendGmailParams
): Promise<{ id: string; threadId?: string }> {
  const raw = buildGmailRaw(params.to, params.subject, params.body, params.fromEmail);
  const body: { raw: string; threadId?: string } = { raw };
  if (params.threadId) body.threadId = params.threadId;

  const res = await fetch(`${GMAIL_API_BASE}/messages/send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gmail send failed: ${err}`);
  }

  const data = (await res.json()) as { id: string; threadId?: string };
  return { id: data.id, threadId: data.threadId };
}

export async function refreshGmailToken(refreshToken: string): Promise<GmailTokens> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth credentials are not configured');
  }

  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
  });

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token refresh failed: ${err}`);
  }

  const data = (await res.json()) as GmailTokens & { error?: string };
  if (data.error) throw new Error(data.error);
  return data;
}
