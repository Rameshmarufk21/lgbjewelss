# LGB Ecosystem

Multi-system workspace for Labgrown Box Inc. — **read `MASTER-BLUEPRINT.md` first** before any build session.

## Layout

| Folder | Phase | Status |
|--------|-------|--------|
| `../` (repo root) | **Phase 1 — Jewelry Platform** | Production (Next.js / Neon) |
| `phase-2-ticketing/` | **Phase 2 — Ticketing** | Scaffold started |
| `phase-3-stock-crm/` | **Phase 3 — Stock CRM** | Demo mode scaffold started |
| `shared/` | Cross-system contracts | Types + schema reference |

## Build order [LOCKED]

1. Phase 1 — extend existing web app (repo root)
2. Phase 2 — Electron desktop + delivery PWA
3. Phase 3 — Stock CRM demo mode first, full depth after

## Quick start

```bash
# Phase 2 — Ticketing
cd ecosystem/phase-2-ticketing
npm install
npm run db:push && npm run db:seed
npm run dev          # Vite UI (browser)
npm run dev:electron # Desktop shell

# Phase 3 — Stock CRM (demo mode)
cd ecosystem/phase-3-stock-crm
npm install
npm run db:push && npm run db:seed
npm run dev
npm run dev:electron
```

## Database

- **Production:** Neon Postgres (Model B) — single source of truth across all phases.
- **Local demo:** SQLite via Prisma (`file:./dev.db`) — same logical schema, swap `DATABASE_URL` for Neon when deploying.

## Rules

- Do not change Phase 1 design (`src/styles/lgb.css`, `.lgb-shell`).
- Money = integer cents. IDs = cuid.
- Product statuses: `cad_sent | casting | stones | setter | qc | sold | archived`.
