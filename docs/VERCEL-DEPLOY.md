# Vercel Deployment Guide

Step-by-step guide to deploy your CRM Analyzer to Vercel.

---

## Prerequisites

- [Vercel account](https://vercel.com/signup) (free)
- Code pushed to GitHub, GitLab, or Bitbucket
- Supabase project set up (see [SUPABASE-SETUP.md](./SUPABASE-SETUP.md))
- [Groq API key](https://console.groq.com/) for AI features

---

## 1. Push to Git

If you haven't already, push your project to a Git provider:

```bash
git add .
git commit -m "Prepare for Vercel deployment"
git push origin main
```

---

## 2. Import Project on Vercel

1. Go to [vercel.com](https://vercel.com) and sign in
2. Click **Add New** → **Project**
3. Import your repository (GitHub/GitLab/Bitbucket)
4. Vercel will auto-detect Next.js
5. **Framework Preset:** Next.js (should be auto-selected)
6. **Root Directory:** Leave as `.` (or set if your app is in a subfolder)
7. **Build Command:** `next build` (default)
8. **Output Directory:** `.next` (default)
9. Click **Deploy** (you can add env vars after the first deploy)

---

## 3. Add Environment Variables

After the first deploy (or before), go to **Project → Settings → Environment Variables**.

Add these variables for **Production**, **Preview**, and **Development**:

| Variable | Value | Required |
|----------|-------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role key (secret) | Yes |
| `GROQ_API_KEY` | Your Groq API key | Yes |
| `NEXT_PUBLIC_APP_URL` | Your Vercel URL, e.g. `https://your-app.vercel.app` | Yes* |
| `ADMIN_EMAILS` | Comma-separated admin emails (e.g. `you@email.com`) | Optional |

**Where to find Supabase keys:** Supabase Dashboard → Project Settings → API

**Where to find Groq key:** [Groq Console](https://console.groq.com/) → API Keys

\* For `NEXT_PUBLIC_APP_URL`: Use your actual Vercel URL after the first deploy (e.g. `https://crm-analyzer-xyz.vercel.app`). You can update this when you add a custom domain.

---

## 4. Redeploy

After adding environment variables:

1. Go to **Deployments**
2. Click the **⋮** menu on the latest deployment
3. Click **Redeploy**

Or push a new commit to trigger a fresh deploy.

---

## 5. Configure Supabase Redirect URLs

In **Supabase Dashboard → Authentication → URL Configuration**:

1. Set **Site URL** to your Vercel URL: `https://your-app.vercel.app`
2. Under **Redirect URLs**, add:
   - `https://your-app.vercel.app`
   - `https://your-app.vercel.app/**`
   - `https://your-app.vercel.app/invite/accept`

Replace `your-app.vercel.app` with your actual Vercel domain.

---

## 6. (Optional) Inbound Email Webhook

If you use SendGrid Inbound Parse or Mailgun for inbound emails:

1. In your email provider, set the webhook URL to:
   ```
   https://your-app.vercel.app/api/webhooks/inbound-email
   ```
2. Ensure the webhook is configured for your domain

---

## 7. (Optional) Custom Domain

1. In Vercel: **Project → Settings → Domains**
2. Add your domain and follow DNS instructions
3. Update `NEXT_PUBLIC_APP_URL` to your custom domain
4. Add the custom domain to Supabase Redirect URLs

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "Missing SUPABASE_SERVICE_ROLE_KEY" | Add the variable in Vercel, redeploy |
| Invite links go to localhost | Set `NEXT_PUBLIC_APP_URL` to your Vercel URL |
| Auth redirect fails | Add your Vercel URL to Supabase Redirect URLs |
| AI features don't work | Add `GROQ_API_KEY` in Vercel |
| Admin page redirects to analytics | Add your email to `ADMIN_EMAILS` |

---

## Quick Checklist

- [ ] Code pushed to Git
- [ ] Project imported on Vercel
- [ ] All env vars added (Supabase, Groq, NEXT_PUBLIC_APP_URL)
- [ ] Redeployed after adding env vars
- [ ] Supabase Redirect URLs updated
- [ ] Tested signup/login
- [ ] Tested invite flow (if using teams)
