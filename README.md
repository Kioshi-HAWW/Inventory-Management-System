# VoltDesk ERP — Electrical Contractor Inventory & Billing (V1 foundation)

A Next.js + TypeScript + Supabase starter for a cloud-based electrical contracting business system.

## Included in this version

- Responsive login screen with email/password and Google OAuth.
- Supabase SSR client setup and auth callback.
- Protected dashboard route with live aggregate reads from Supabase.
- Professional responsive dashboard shell and low-stock alerts.
- PostgreSQL schema for business accounts, profiles, products, categories, suppliers, purchases, price history, customers, projects, stock reservations, stock ledger, material issues/returns, invoices, invoice items, payments and audit logs.
- Row Level Security policies for business-level isolation.
- `create_business()` onboarding RPC.
- Atomic `issue_project_material()` RPC that locks the product row and prevents negative stock.

This is the first implementation foundation, not yet the full ERP workflow. Purchase-entry UI, product CRUD, project screens, invoice editor, PDF/Excel exports, payment entry, reservation/release RPCs, and employee invitation flow are subsequent modules.

## Requirements

- Node.js 20.9+
- A Supabase project
- npm

## 1. Install

```bash
npm install
cp .env.example .env.local
```

Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local` from Supabase → Project Settings → API. Use the publishable/anon key only. Never put a Supabase service-role key in browser or `NEXT_PUBLIC_` variables.

## 2. Create database

In Supabase → SQL Editor, run `supabase/migrations/0001_initial_schema.sql`.

## 3. Configure authentication

In Supabase → Authentication → URL Configuration:

- Site URL: `http://localhost:3000` for local development.
- Redirect URL: `http://localhost:3000/auth/callback`.
- Add your deployed domain callback later, e.g. `https://your-domain.vercel.app/auth/callback`.

For Google OAuth, create a Google OAuth client in Google Cloud Console. Add the Supabase-provided callback URL (`https://YOUR_PROJECT_ID.supabase.co/auth/v1/callback`) as an authorized redirect URI in Google Cloud. Add the Client ID and Client Secret in Supabase → Authentication → Providers → Google and enable the provider.

For email signup, configure Supabase email confirmation and SMTP for reliable production delivery. Supabase's default email service is intended for limited testing.

## 4. Run locally

```bash
npm run dev
```

Open http://localhost:3000.

## 5. First-time business onboarding

After a user signs up and confirms email, the user profile is created automatically. The business creation form is the next UI step. For testing, call the RPC from an authenticated Supabase client:

```ts
const { data: businessId, error } = await supabase.rpc("create_business", {
  p_name: "Your Electrical Contracting Business",
  p_phone: "+91...",
  p_email: "office@example.com"
});
```

The first user becomes the owner. Do not manually set a user's role from the client.

## Important security and data rules

- RLS isolates every business-owned record by `profiles.business_id`.
- The browser uses only the public anon/publishable key.
- All stock mutations should be implemented as transactional PostgreSQL functions. Do not perform a read-then-write stock deduction in the browser.
- The provided issue RPC is atomic. Reservation, purchase receipt, returns, invoice finalization and payment RPCs should follow the same pattern before production use.
- Final invoices must snapshot item descriptions, units, quantities, selling prices and cost prices. Do not recalculate old invoices from live product prices.
- The schema intentionally does not deduct stock when an invoice is created; stock is reduced when materials are physically issued to a project.
- Configure automated backups and test restore procedures before storing business-critical records.

## Build check

```bash
npm run build
```

## Deployment

Deploy the repository to Vercel and add the two environment variables from `.env.local` in Vercel Project Settings → Environment Variables. Add the production callback URL in Supabase Auth URL Configuration and Google OAuth configuration.

## Security note about the first owner

The schema does not expose a client-side profile update policy. The `create_business()` security-definer RPC assigns the first authenticated user as owner, preventing a normal user from changing their own role or business membership through a direct table update. Additional employee invitation and role-management flows should be added using server-validated RPCs or Supabase Admin APIs on a trusted server only.
