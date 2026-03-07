# DKIM Setup for Outlook / Microsoft 365

If emails sent from your custom domain (e.g. `paul@closeboost.ai`) via Outlook fail to reach Gmail or Yahoo, or get marked as spam, you likely need to enable **DKIM** (DomainKeys Identified Mail) for your domain in Microsoft 365.

---

## GoDaddy Users (admin.microsoft.com redirects to GoDaddy)

If you bought Microsoft 365 through **GoDaddy**, `admin.microsoft.com` will redirect to [productivity.godaddy.com](https://productivity.godaddy.com). That’s expected.

**To reach Microsoft admin centers:**

1. Go to [productivity.godaddy.com](https://productivity.godaddy.com) and sign in with your **GoDaddy** username and password
2. Open **Microsoft 365 Admin** → **Advanced**
3. Use **Exchange** to manage email settings

**To reach DKIM (if available):**

- Try **Microsoft 365 Defender** → [security.microsoft.com/dkimv2](https://security.microsoft.com/dkimv2) — sign in with your `@closeboost.ai` email and Microsoft 365 password
- If that doesn’t work, GoDaddy may limit access. Options:
  - **GoDaddy support**: Ask how to enable DKIM for your domain
  - **Exchange Online PowerShell**: Create DKIM keys and CNAME records via PowerShell (see [Microsoft DKIM docs](https://learn.microsoft.com/en-us/microsoft-365/security/office-365-security/email-authentication-dkim-configure))

---

## Step 1: Open Microsoft 365 Admin Center

1. Go to [admin.microsoft.com](https://admin.microsoft.com) (or [productivity.godaddy.com](https://productivity.godaddy.com) if you use GoDaddy)
2. Sign in with your Microsoft 365 admin account (the one that manages closeboost.ai)

---

## Step 2: Add or Verify Your Domain

1. Go to **Settings** → **Domains**
2. If `closeboost.ai` is not listed, click **Add domain** and follow the wizard
3. If it's already there, select it and continue

---

## Step 3: Enable DKIM for Your Domain

1. In **Domains**, select **closeboost.ai**
2. Click **DNS records** (or **Manage DNS**)
3. Look for **DKIM** or **Authenticate email** section
4. Click **Create DKIM keys** or **Enable DKIM**

   *If you don't see DKIM:*
   - Go to **Microsoft 365 Defender** → [protection.office.com](https://security.microsoft.com/dkimv2) → **DKIM**
   - Or search "DKIM" in the admin center

---

## Step 4: Get the DNS Records

Microsoft will show you **2 CNAME records** to add. They look like:

| Type | Name/Host | Value/Points to |
|------|-----------|-----------------|
| CNAME | `selector1._domainkey` | `selector1-closeboost-ai._domainkey.YOURTENANT.onmicrosoft.com` |
| CNAME | `selector2._domainkey` | `selector2-closeboost-ai._domainkey.YOURTENANT.onmicrosoft.com` |

*The exact values depend on your tenant. Copy them from the Microsoft admin UI.*

---

## Step 5: Add Records to Your DNS

1. Log in to your **DNS provider** (where closeboost.ai is managed, e.g. Cloudflare, GoDaddy, Namecheap, Vercel, etc.)
2. Add the **2 CNAME records** Microsoft gave you
3. **Name/Host**: Use the full value Microsoft shows (e.g. `selector1._domainkey` or `selector1._domainkey.closeboost`)
4. **Target/Value**: The long Microsoft hostname (e.g. `selector1-closeboost-ai._domainkey.contoso.onmicrosoft.com`)
5. Save the records

**Common DNS providers:**
- **Cloudflare**: DNS → Add record → Type: CNAME
- **GoDaddy**: DNS Management → Add → CNAME
- **Namecheap**: Advanced DNS → Add New Record → CNAME
- **Vercel**: Project → Settings → Domains → DNS Records

---

## Step 6: Turn On DKIM Signing

1. Back in Microsoft 365 admin, after adding the records
2. Click **Enable** or **Sign messages for this domain with DKIM signatures**
3. Microsoft will verify the CNAME records (can take a few minutes to 24 hours)

---

## Step 7: Verify

1. Wait for DNS propagation (up to 24–48 hours, often faster)
2. Send a test email from `paul@closeboost.ai` to [aboutmy.email](https://aboutmy.email)
3. Check the report — **DKIM** should show as **Signed** or **Aligned**

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "DKIM" option not visible | You may need **Exchange Online** or **Microsoft 365 Business**; DKIM is not available on all plans |
| Records don't verify | Ensure CNAME names match exactly (no extra `closeboost.ai` suffix if Microsoft doesn't include it) |
| Still unsigned after 24h | Double-check CNAME targets; some DNS providers require a trailing dot (`.`) on the target |
| Personal Outlook (outlook.com) | DKIM for custom domains is for **Microsoft 365** (work/school). Personal accounts use outlook.com and can't add custom-domain DKIM |

---

## Quick Links

- [Microsoft: Use DKIM to validate outbound email](https://learn.microsoft.com/en-us/microsoft-365/security/office-365-security/email-authentication-dkim-configure)
- [DKIM setup in Defender for Office 365](https://security.microsoft.com/dkimv2)
