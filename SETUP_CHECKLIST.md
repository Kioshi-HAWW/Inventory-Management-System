# Setup checklist

- [x] Create Supabase project (choose a region close to your users, such as Mumbai if available).
- [ ] Run `supabase/migrations/0001_initial_schema.sql` in SQL Editor.
- [ ] Run `supabase/migrations/0002_inventory_rpcs.sql` in SQL Editor (inventory atomic RPCs & security policies).
- [ ] Run `supabase/migrations/0003_purchase_and_opening_stock.sql` in SQL Editor (WAC, multi-item purchase receipt, opening stock migration).
- [x] Copy `.env.example` to `.env.local` and add Supabase URL + anon/publishable key.
- [ ] Set Supabase Site URL (`http://localhost:3000`) and Redirect URL (`http://localhost:3000/auth/callback`).
- [ ] Configure Google OAuth provider (in Supabase Auth -> Providers -> Google, add Client ID & Client Secret).
- [ ] Configure production SMTP/email confirmation (in Supabase Auth -> Email Templates & SMTP Settings).
- [x] Run `npm install` and `npm run dev` (installed Node.js LTS, dependencies resolved, dev server running on port 3000).
- [ ] Sign up and confirm email.
- [ ] Add business onboarding UI / invoke `create_business()`.
- [ ] Deploy to Vercel and configure production URLs.
- [ ] Enable backups and test a restore before production use.
