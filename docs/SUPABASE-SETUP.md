# Supabase Setup Guide

Complete guide for setting up the Supabase database, invite flow, and email confirmation.

---

## 1. Database Migrations (Run in Order)

Run these in **Supabase Dashboard → SQL Editor** in this exact order:

| Order | File | Purpose |
|-------|------|---------|
| 1 | `supabase-schema.sql` | Core tables: deals, customers, logs, tasks |
| 2 | `supabase-migrations-org.sql` | Profiles, organizations, org members, invites, functions |
| 3 | `supabase-migrations-admin-orgs.sql` | Role on invites, `admin_create_organization` |
| 4 | `supabase-migrations-user-settings.sql` | User settings (columns, theme, profile, etc.) |
| 5 | `supabase-migrations-dismissed-recommendations.sql` | Dismissed Smart Task recommendations |
| 6 | `supabase-migrations-rls-fix.sql` | `user_organization_ids()` helper, RLS fixes |
| 7 | `supabase-migrations-inbound-emails.sql` | Inbound emails table, org inbound_email column |
| 8 | `supabase-migrations-org-admin-delete-members.sql` | Allow admins (in addition to owners) to remove members |
| 9 | `supabase-migrations-email-connections.sql` | OAuth email connections (Gmail, Outlook) |
| 10 | `supabase-migrations-inbound-emails-oauth.sql` | Extend inbound_emails for OAuth sync (user_id, connection_id, message_id, thread_id) |
| 11 | `supabase-migrations-email-status.sql` | Minimal storage for OAuth email status (acknowledged/replied) |
| 12 | `supabase-migrations-email-status-all-members.sql` | Allow all org members (not just owners/admins) to update email status |
| 13 | `supabase-migrations-email-dismissals.sql` | Per-user dismissed emails (Remove from inbox) |

---

## 2. Tables Created

| Table | Purpose |
|-------|---------|
| `deals` | CRM deals (user-scoped) |
| `customers` | CRM customers (user-scoped) |
| `logs` | Activity logs (user-scoped) |
| `tasks` | Tasks (user-scoped) |
| `profiles` | User email/name for org member display |
| `organizations` | Org name, seat limit, Stripe IDs |
| `organization_members` | Links users to orgs (owner/admin/member) |
| `pending_invites` | Invites with token, email, expiry |
| `user_settings` | Column order, theme, profile, task layout, etc. |
| `dismissed_recommendations` | Dismissed Smart Task IDs |

---

## 3. Optional: Auto-Create Profile on Signup

Profiles are created when users onboard or accept invites. To auto-create profiles for any new signup, run this in the SQL Editor:

```sql
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, updated_at)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    now()
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

---

## 4. Invite Flow (How It Works)

### Owner creates invite
1. Owner goes to **Settings → Team**
2. Enters invitee's email, clicks invite
3. Gets a link like: `https://yoursite.com/invite/accept?token=abc123...`

### Recipient clicks the link

**If they're NOT logged in:**
1. Lands on `/invite/accept?token=...`
2. Redirected to `/signup?invite=...` (token preserved in URL)
3. Signup page fetches invite details → pre-fills email, shows "You've been invited to join {org name}"
4. User signs up with name + password
5. **No email confirmation:** Immediately added to org → redirect to `/analytics`
6. **With email confirmation:** See [Email Confirmation Setup](#5-email-confirmation-setup) below

**If they're already logged in:**
1. Lands on `/invite/accept?token=...`
2. App calls `accept_invite` → added to org
3. Redirect to `/analytics`

---

## 5. Email Confirmation Setup

When you're ready to enable email confirmation in Supabase, follow these steps so invite links still work in one click (no double-clicking).

### Step 1: Add redirect URLs in Supabase

1. Go to **Supabase Dashboard → Authentication → URL Configuration**
2. Under **Redirect URLs**, add:
   - Production: `https://yourdomain.com/auth/callback`
   - Production: `https://yourdomain.com/invite/accept`
   - Local dev: `http://localhost:3000/auth/callback`
   - Local dev: `http://localhost:3000/invite/accept`

Supabase only redirects to URLs in this list. Without this, users who confirm via email won't land on the right page to join the org.

### Step 2: Enable email confirmation

1. Go to **Supabase Dashboard → Authentication → Providers → Email**
2. Turn on **Confirm email**

### How it works with invites

The signup page already sets `emailRedirectTo` to `/invite/accept?token=...` when the user has an invite token. So:

1. User clicks invite link → lands on signup with token
2. User signs up → Supabase sends confirmation email
3. User clicks the confirmation link in the email
4. Supabase redirects them to `/invite/accept?token=...` (they're now authenticated)
5. Invite/accept page calls `accept_invite` → they're added to the org
6. Redirect to `/analytics`

**One click on the confirmation email = they're in the org.** No need to click the invite link again.

### Quick checklist when enabling email confirmation

- [ ] Add `https://yourdomain.com/auth/callback` to Supabase Redirect URLs
- [ ] Add `https://yourdomain.com/invite/accept` to Supabase Redirect URLs
- [ ] Add `http://localhost:3000/auth/callback` for local dev
- [ ] Add `http://localhost:3000/invite/accept` for local dev
- [ ] Enable "Confirm email" in Email provider settings
- [ ] (Optional) Customize the confirmation email template in Supabase

---

## 6. Data Saved to Supabase

All account data is persisted to Supabase:

| Data | Table | Notes |
|------|-------|-------|
| Deals | `deals` | From upload + analytics |
| Customers | `customers` | From upload + analytics |
| Logs | `logs` | From upload |
| Tasks | `tasks` | From analytics |
| User settings | `user_settings` | Theme, columns, profile, etc. |
| Dismissed recommendations | `dismissed_recommendations` | Smart Task dismissals |
| Profiles | `profiles` | Via onboard/accept |
| Orgs & members | `organizations`, `organization_members` | Via org flows |

**localStorage fallback:** Unauthenticated users use localStorage for settings. Once they sign in, data migrates to Supabase.
