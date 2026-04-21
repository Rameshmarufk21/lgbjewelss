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

## PWA

Service worker registers in production builds; install from the deployed HTTPS URL on mobile.
