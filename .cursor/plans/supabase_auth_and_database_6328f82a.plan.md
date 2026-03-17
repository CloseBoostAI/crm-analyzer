---
name: Supabase Auth and Database
overview: Replace all localStorage/sessionStorage usage with Supabase Auth (email/password) and a PostgreSQL database, so each user's CRM data is persisted to their account.
todos:
  - id: setup-env
    content: Install @supabase/supabase-js and @supabase/ssr, set up .env.local with placeholder Supabase keys
    status: completed
  - id: supabase-clients
    content: Create lib/supabase/client.ts, server.ts, and middleware.ts helper files
    status: completed
  - id: db-schema
    content: Write the SQL migration script for deals, customers, logs, tasks tables with RLS policies
    status: completed
  - id: auth-middleware
    content: Create root middleware.ts to refresh sessions and protect /upload and /analytics routes
    status: completed
  - id: auth-pages
    content: Create /login and /signup pages with email+password forms
    status: completed
  - id: auth-nav
    content: Update app/layout.tsx nav bar to show user state (logged in/out) with sign out
    status: completed
  - id: data-layer
    content: Create lib/supabase/data.ts with all CRUD functions (saveDeals, loadDeals, saveTasks, etc.)
    status: completed
  - id: update-upload
    content: Replace sessionStorage in app/upload/page.tsx with Supabase data layer calls
    status: completed
  - id: update-analytics
    content: Replace localStorage in app/analytics/page.tsx with Supabase data layer calls
    status: completed
  - id: security-cleanup
    content: Move Together.ai API key to env var and server-side route, remove hardcoded key
    status: completed
isProject: false
---

# Migrate CloseBoostAI from Local Storage to Supabase Auth + Database

## Current Problem

All data (deals, customers, logs, tasks) is stored in the browser via `localStorage` and `sessionStorage`. This means data is lost on browser clear, can't sync across devices, and there are no user accounts.

**Storage touchpoints to replace:**

- [app/upload/page.tsx](app/upload/page.tsx) lines 195-199, 271-274 -- `sessionStorage.setItem()` for deals, customers, logs after CSV parsing
- [app/analytics/page.tsx](app/analytics/page.tsx) lines 63-85 -- `localStorage.getItem()` to load deals, customers, logs, tasks
- [app/analytics/page.tsx](app/analytics/page.tsx) lines 463, 479-480, 486-487 -- `localStorage.setItem('tasks', ...)` for task CRUD

## Architecture

```mermaid
flowchart TB
  subgraph client [Client Browser]
    Landing[Landing Page]
    Login[Login / Signup Pages]
    Upload[Upload Page]
    Analytics[Analytics Page]
  end

  subgraph supa [Supabase]
    Auth[Supabase Auth]
    DB[(PostgreSQL DB)]
  end

  Login -->|"email/password"| Auth
  Auth -->|"session cookie"| Middleware
  Middleware -->|"protect routes"| Upload
  Middleware -->|"protect routes"| Analytics
  Upload -->|"INSERT deals, customers, logs"| DB
  Analytics -->|"SELECT / UPDATE / DELETE"| DB
```

## Step-by-Step Plan

### 1. User Setup (Manual Step)

- Go to [supabase.com](https://supabase.com), create a free project
- Copy the **Project URL** and **anon (public) key** from Settings > API
- We will add these to `.env.local`

### 2. Install Supabase Packages

```
npm install @supabase/supabase-js @supabase/ssr
```

### 3. Environment Variables

Create/update `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=<your-project-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
```

### 4. Database Schema (run in Supabase SQL Editor)

Create 4 tables, all keyed by `user_id` referencing `auth.users(id)`:

- **deals** -- id, user_id, name, stage, owner, contact, amount, priority, contact_id, notes, note_id, close_date, email, company
- **customers** -- id, user_id, name, email, company, last_contact, status, value, next_action, customer_intent, notes (jsonb), interactions (jsonb)
- **logs** -- id, user_id, customer_id, timestamp, type, notes, outcome
- **tasks** -- id, user_id, title, status, due_date, priority, associated_deal_id, associated_deal_name, assigned_to, notes

Enable Row Level Security (RLS) on all tables so users can only access their own rows.

### 5. Create Supabase Client Files

- `lib/supabase/client.ts` -- Browser client using `createBrowserClient()` from `@supabase/ssr`
- `lib/supabase/server.ts` -- Server client using `createServerClient()` for Server Components/Route Handlers
- `lib/supabase/middleware.ts` -- Session refresh logic

### 6. Auth Middleware

- Create `middleware.ts` at project root
- Refresh session on every request
- Redirect unauthenticated users from `/upload` and `/analytics` to `/login`
- Redirect authenticated users from `/login` and `/signup` to `/analytics`

### 7. Auth Pages

- `app/login/page.tsx` -- Email + password sign-in form, link to signup
- `app/signup/page.tsx` -- Email + password registration form, link to login
- Both use the browser Supabase client to call `supabase.auth.signInWithPassword()` / `supabase.auth.signUp()`

### 8. Update Layout ([app/layout.tsx](app/layout.tsx))

- Add user indicator in the nav bar (email display + Sign Out button) when logged in
- Show Login/Sign Up links when logged out
- Use a small client component for the auth-aware nav

### 9. Create Data Access Functions (`lib/supabase/data.ts`)

Functions that wrap Supabase queries, all scoped to the current user:

- `saveDeals(deals[])` -- upsert deals for current user
- `saveCustomers(customers[])` -- upsert customers for current user
- `saveLogs(logs[])` -- insert logs for current user
- `loadDeals()` -- fetch all deals for current user
- `loadCustomers()` -- fetch all customers for current user
- `loadLogs()` -- fetch all logs for current user
- `loadTasks()` -- fetch all tasks for current user
- `saveTask(task)` / `updateTask(id, updates)` / `deleteTask(id)` -- task CRUD

### 10. Update Upload Page ([app/upload/page.tsx](app/upload/page.tsx))

- Replace `sessionStorage.setItem('deals', ...)` etc. with calls to `saveDeals()`, `saveCustomers()`, `saveLogs()`
- Data now persists to Supabase under the user's account

### 11. Update Analytics Page ([app/analytics/page.tsx](app/analytics/page.tsx))

- Replace `localStorage.getItem('deals')` etc. with calls to `loadDeals()`, `loadCustomers()`, `loadLogs()`, `loadTasks()`
- Replace `localStorage.setItem('tasks', ...)` in task CRUD handlers with `saveTask()`, `updateTask()`, `deleteTask()`

### 12. Security Cleanup

- Move the Together.ai API key from hardcoded in `analytics/page.tsx` to `.env.local` and call it through a Next.js API route instead of directly from the client
- Remove the HubSpot token from `.env`

## Files to Create

- `lib/supabase/client.ts`
- `lib/supabase/server.ts`
- `lib/supabase/middleware.ts`
- `lib/supabase/data.ts`
- `middleware.ts`
- `app/login/page.tsx`
- `app/signup/page.tsx`
- `app/api/ai/generate/route.ts` (optional, to move API key server-side)

## Files to Modify

- `.env.local` (add Supabase keys)
- `app/layout.tsx` (auth-aware nav)
- `app/upload/page.tsx` (replace sessionStorage with Supabase)
- `app/analytics/page.tsx` (replace localStorage with Supabase)
- `package.json` (new dependencies via npm install)