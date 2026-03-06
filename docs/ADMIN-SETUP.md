# Admin Panel Setup (CloseBoost Owner)

How to set up and use the admin panel as the website owner.

---

## 1. Environment Variables

Add these to `.env.local`:

```
# Your email (or comma-separated list of admin emails)
ADMIN_EMAILS=you@closeboost.com

# Supabase service role key (bypasses RLS for admin operations)
# CRITICAL: Use the service_role key, NOT the anon key!
# Find it: Supabase Dashboard → Project Settings → API
# Copy the "service_role" key (under "Project API keys" - it's the secret one)
# If you get "invalid api key", you likely used the wrong key or have a typo
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

**Important:** Never expose `SUPABASE_SERVICE_ROLE_KEY` to the client. It bypasses Row Level Security.

---

## 2. Accessing the Admin Panel

1. Sign in with an email listed in `ADMIN_EMAILS`
2. Click **Admin** in the nav (amber link, only visible to admins)
3. Or go directly to `/admin`

Non-admins who try to access `/admin` are redirected to `/analytics`.

---

## 3. What You Can Do

### Dashboard stats
- **Organizations** – Total number of orgs
- **Total Users** – Users in profiles table
- **Org Members** – Total org membership count

### Organizations
- **Create organization** – Set up a company: name, seat limit, leader email. If the leader has an account, they’re added as owner. If not, you get an invite link to send them.
- **Edit** – Change org name and seat limit (seat limit cannot be below current member count)
- **Members** – View members, remove non-owners from the org

**Flow:** You create orgs for companies. You assign a leader (their email) and seat limit. The leader invites their team via Settings → Team.

### Billing (Stripe)
- Placeholder section for future Stripe integration
- You will add subscription management here later

---

## 4. API Routes (Admin Only)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/admin/check` | GET | Returns `{ isAdmin: boolean }` for nav |
| `/api/admin/stats` | GET | Platform stats (orgs, users, members) |
| `/api/admin/orgs` | GET | List all organizations |
| `/api/admin/orgs` | POST | Create org (name, seatLimit, leaderEmail) |
| `/api/admin/orgs/[id]` | PATCH | Update org (name, seatLimit) |
| `/api/admin/orgs/[id]/members` | GET | List org members |
| `/api/admin/orgs/[id]/members/[userId]` | DELETE | Remove member (not owner) |

All admin routes verify the user's email is in `ADMIN_EMAILS` before returning data.

---

## 5. Multiple Admins

Use comma-separated emails:

```
ADMIN_EMAILS=owner@closeboost.com,cofounder@closeboost.com
```

---

## 6. Security Notes

- Admin check happens in middleware (for `/admin` routes) and in each API route
- Service role key is only used server-side in admin API routes, after verifying the request comes from an admin user
- Keep `ADMIN_EMAILS` and `SUPABASE_SERVICE_ROLE_KEY` secret
