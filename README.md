# LabGrownBox — production catalog

Next.js app for orders from **casting → setting**: products, vendor invoices (with metal/karat lines), stone intake, findings, Excel import/export, statements, and a monthly dashboard (including casting metal usage).

## Hosted setup (recommended)

The app is built for **cloud**: **PostgreSQL** for data and **Vercel Blob** (or local `./uploads` only if `BLOB_READ_WRITE_TOKEN` is unset) for files.

1. Create a **Postgres** database (e.g. [Neon](https://neon.tech) or [Supabase](https://supabase.com)).
2. On [Vercel](https://vercel.com): **Storage → Blob** → create a store → add **`BLOB_READ_WRITE_TOKEN`** to the project env.
3. Set **`DATABASE_URL`** to your Postgres connection string (with `sslmode=require` if your provider needs it).
4. Deploy, then run migrations against that database (from your machine or CI):

   ```bash
   DATABASE_URL="postgresql://..." npx prisma migrate deploy
   ```

5. Optional: **`GEMINI_API_KEY`** for extraction, or configure keys in the app **Settings** UI.

More detail: **DEPLOY.md** (in the repo if you keep it).

## Local development

```bash
npm install
cp .env.example .env   # fill DATABASE_URL; add BLOB token for same behavior as prod, or omit for disk uploads
npx prisma migrate dev
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Production deployment

Build and run:

```bash
npm run build   # prisma generate + next build (webpack)
npm run start   # serves the production build on PORT (default 3000)
```

**Host requirement:** orders, tasks, the board, and company settings live in the
browser (localStorage), while **logins and AI keys are stored server-side in
`.lgb-data/` (git-ignored).** That folder must persist between requests, so deploy
to a host with a **persistent writable filesystem** — a VPS, Docker, Railway/Render
with a disk, etc. On **ephemeral serverless** (e.g. Vercel functions) those files
don't persist; there, supply `GEMINI_API_KEY` and login config via **env vars**
instead, and keep `.lgb-data` on a mounted volume.

### Security checklist (do before going live)
- [ ] **Change the seeded passwords.** Log in as `admin` / `lgb2026`, then
      **Settings → Users → Reset password** for every account. `lgb2026` is a
      setup placeholder, not a production password.
- [ ] Set a strong **`LGB_AUTH_SECRET`** (random, ≥24 chars) in the host env and
      keep `LGB_AUTH_ENABLED="true"`.
- [ ] Serve over **HTTPS** — session cookies are `Secure` in production and the
      PWA/service worker require it.
- [ ] Add your **Gemini key** in Settings → AI keys (admin-only, encrypted at
      rest). Optionally set `ENCRYPTION_SECRET` in env for a fixed encryption key.
- [ ] Keep `.env` and `.lgb-data/` out of version control (already git-ignored).
- [ ] Response security headers (nosniff, SAMEORIGIN, referrer/permissions
      policy) are set in `next.config.ts`; add a CSP if your host supports it.

## PWA

Service worker registers in production builds; install from the deployed HTTPS URL on mobile.
