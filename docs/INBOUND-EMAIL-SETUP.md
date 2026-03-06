# Inbound Email Setup

CloseBoost can receive and acknowledge emails that clients and prospects send to your company email. This lets you track incoming messages and know how to respond.

---

## 1. Run the migration

In **Supabase Dashboard → SQL Editor**, run:

```
supabase-migrations-inbound-emails.sql
```

This creates the `inbound_emails` table and adds `inbound_email` to organizations.

---

## 2. Configure your company inbox

1. Go to **Settings → Team**
2. As org owner, set **Company inbox** to the email address that receives client emails (e.g. `sales@yourcompany.com`)
3. Click **Save**

---

## 3. Set up inbound email parsing

Use one of these providers to forward incoming emails to CloseBoost.

### SendGrid Inbound Parse

1. Go to [SendGrid → Settings → Inbound Parse](https://app.sendgrid.com/settings/parse)
2. Add a host and URL:
   - **Destination URL:** `https://yourdomain.com/api/webhooks/inbound-email`
   - **Host:** Your domain (e.g. `yourcompany.com`)
3. Configure MX records for your domain to point to `mx.sendgrid.net` (SendGrid will show the exact records)
4. Emails sent to `*@yourcompany.com` will be parsed and POSTed to your webhook

### Mailgun Inbound Routes

1. Go to [Mailgun → Sending → Routes](https://app.mailgun.com/app/receiving/routes)
2. Create a route:
   - **Expression:** `match_recipient(".*@yourcompany.com")` (or your specific address)
   - **Action:** Forward to `https://yourdomain.com/api/webhooks/inbound-email`
3. Configure MX records for your domain as shown in Mailgun

---

## 4. How it works

1. A client emails `sales@yourcompany.com`
2. SendGrid/Mailgun receives it and POSTs to `/api/webhooks/inbound-email`
3. CloseBoost stores the email and links it to a deal if the sender’s email matches a deal contact
4. You see it in **Analytics → Client Inbox**
5. You can mark emails as **Acknowledged** or **Replied** to track responses

---

## 5. Webhook payload

The webhook expects `multipart/form-data` (SendGrid) or `application/json` (Mailgun) with:

- `from` / `sender` – Sender email
- `to` / `recipient` – Recipient email
- `subject` – Subject line
- `text` / `body-plain` – Plain text body
- `html` / `body-html` – HTML body (optional)

---

## 6. Routing

- If an organization has `inbound_email` set and it matches the `to` address, the email is stored for that org
- If no match, the first organization is used (single-tenant setups)
