# Organization Setup Guide

Everything you need to know to set up and use Organizations in this app.

---

## Overview

- **Reps do not share customers** – each rep has their own account and data (deals, customers, tasks stay scoped by `user_id`)
- **Org layer** – used for billing, seat limits, and invites
- **Company pays for N seats** – seat limit is enforced at the org level
- **Admin creates orgs** – The website owner (CloseBoost admin) creates organizations for companies, assigns a leader and seat limit. The leader then invites their team.

---

## 1. Database Setup (Supabase)

Run the migrations in **Supabase Dashboard → SQL Editor** (in order):

1. **First:** `supabase-migrations-org.sql` – base org tables and functions
2. **Second:** `supabase-migrations-admin-orgs.sql` – admin-created orgs, role in invites

**Tables created:**
| Table | Purpose |
|------|---------|
| `profiles` | User email/name for member display |
| `organizations` | Org name, seat_limit, Stripe IDs |
| `organization_members` | Links users to orgs (owner/admin/member) |
| `pending_invites` | Invites with token and expiry |

**Functions:**
- `create_organization(org_name)` – creates org, adds creator as owner
- `accept_invite(invite_token)` – adds user to org, deletes invite
- `get_invite_by_token(invite_token)` – returns invite details (no auth required)

---

## 2. API Routes (`app/api/org/`)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/org` | GET | Current user's org and membership |
| `/api/org/onboard` | POST | Create org for new user, or accept invite if `inviteToken` in body |
| `/api/org/invite` | POST | Create invite (owner/admin only). Body: `{ email }` |
| `/api/org/invite/[token]` | GET | Invite details for signup page (email, orgName) |
| `/api/org/invite/accept` | POST | Accept invite (logged-in user). Body: `{ token }` |
| `/api/org/members` | GET | List org members |
| `/api/org/members/[userId]` | DELETE | Remove member (owner only) |

---

## 3. Pages & Flows

### Invite flow
- **Invite link format:** `/invite/accept?token=TOKEN`
- **New user:** Redirected to `/signup?invite=TOKEN` → email pre-filled → sign up → joins org
- **Existing user:** Accepts directly on `/invite/accept` → added to org → redirect to `/analytics`

### Key files
| File | Purpose |
|------|---------|
| `app/invite/accept/page.tsx` | Handles `/invite/accept?token=X` |
| `app/signup/page.tsx` | Reads `?invite=` from URL, pre-fills email, calls onboard with inviteToken |
| `components/ensure-org.tsx` | Ensures logged-in users without an org get one (runs in layout) |
| `app/settings/page.tsx` | **Team** section: org name, seat usage, invite form, member list |

---

## 4. Settings → Team

Owners and admins can:
- See org name and seat usage (e.g. 2/5 seats)
- Create invites (enter email, get invite link)
- View member list
- Remove members (owner only, cannot remove self)

---

## 5. Environment

Ensure `.env.local` has:
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

---

## 6. Protected Paths

These require login (middleware redirects to `/login`):
- `/upload`
- `/analytics`
- `/settings`

---

## Quick Reference: Invite Someone

1. Go to **Settings → Team**
2. Enter their email and click invite
3. Copy the invite link (auto-copied to clipboard)
4. Send them the link: `/invite/accept?token=...`
5. New users sign up via that link; existing users accept and join
