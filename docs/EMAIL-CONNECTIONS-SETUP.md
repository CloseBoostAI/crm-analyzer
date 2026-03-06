# Email Connections Setup (OAuth)

CloseBoost can connect to your Gmail or Outlook so it can read emails, generate AI replies, recommend tasks based on who emailed you, and auto-fill deal activity.

---

## 1. Environment Variables

Add to `.env.local`:

```env
# Gmail OAuth (from Google Cloud Console)
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret

# Microsoft Outlook OAuth (from Azure Portal)
MICROSOFT_CLIENT_ID=your_client_id
MICROSOFT_CLIENT_SECRET=your_client_secret

# App URL (for OAuth redirect)
NEXT_PUBLIC_APP_URL=https://yourdomain.com

# Optional: for cron sync (Vercel sets this automatically)
CRON_SECRET=your_secret_for_manual_cron_calls
```

---

## 2. Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project or select existing
3. Enable **Gmail API**
4. Go to **APIs & Services → Credentials → Create Credentials → OAuth client ID**
5. Application type: **Web application**
6. Authorized redirect URIs: `https://yourdomain.com/auth/email/callback` (and `http://localhost:3000/auth/email/callback` for dev)
7. Copy Client ID and Client Secret to env

---

## 3. Microsoft OAuth Setup

1. Go to [Azure Portal](https://portal.azure.com/) → **App registrations → New registration**
2. Name your app, set redirect URI: `https://yourdomain.com/auth/email/callback`
3. Under **Certificates & secrets**, create a client secret
4. Under **API permissions**, add:
   - Mail.Read
   - Mail.Send
   - User.Read
   - offline_access
   - openid
5. Copy Application (client) ID and client secret to env

---

## 4. Connect Your Email

1. Go to **Settings → Connected Email**
2. Click **Connect Gmail** or **Connect Outlook**
3. Sign in and grant permissions
4. You’ll be redirected back to Settings

---

## 5. Email Sync

Emails are synced every 15 minutes via Vercel Cron (see `vercel.json`). To run manually:

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://yourdomain.com/api/cron/sync-emails
```

---

## 6. Redirect URLs

Add these to your OAuth provider configs:

- Production: `https://yourdomain.com/auth/email/callback`
- Local: `http://localhost:3000/auth/email/callback`
