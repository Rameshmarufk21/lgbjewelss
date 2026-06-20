# LabGrownBox — Design & UI Guide

This document describes the visual design language, layout system, components, and
screen-by-screen UI of the LabGrownBox / Sakk Fine Jewelry operations app.

---

## 1. Design philosophy

A **boutique-jewelry operations tool**: it should feel as refined as the product
(elegant serif display type, warm cream paper, peacock-blue and gold accents) while
staying dense and fast for daily back-office work (orders, invoices, statements,
reports, chat). The aesthetic is "**ledger meets atelier**" — clean tabular data on a
warm, premium surface.

Two businesses run side by side — **LabGrownBox** (peacock blue) and **Sakk Fine
Jewelry** (burgundy) — so color-coded company identity threads through the whole UI.

---

## 2. Brand & color palette

All colors are CSS variables on the `.lgb-shell` root (`src/styles/lgb.css`).

### Surfaces (warm "cream paper")
| Token | Hex | Use |
|---|---|---|
| `--cream` | `#FDF6EC` | App background, cards, modals |
| `--cream2` | `#F5EDD8` | Inputs, secondary surfaces, toolbars |
| `--cream3` | `#EDE0C8` | Hover fills, chips |

### Primary — Peacock blue
| Token | Hex | Use |
|---|---|---|
| `--peacock` | `#0d2b6e` | Top nav, sidebar, primary buttons, links, LabGrownBox accent |
| `--peacock2` | `#123472` | Headings, deep accents |
| `--peacock3` | `#2a63c6` | Hover/active states |
| `--peacock-lt` / `--peacock-xl` | `#e7eefb` / `#f3f7ff` | Tints, soft backgrounds |

### Gold (accent / brand metal)
| Token | Hex | Use |
|---|---|---|
| `--gold` | `#B8963E` | Style codes, badges, chat author names, active rails |
| `--gold2` | `#D4AF5A` | Gradients, highlights |

### Status
| Token | Hex | Use |
|---|---|---|
| `--danger` | `#C0392B` | Errors, overdue, delete, unpaid |
| `--success` | `#1A6B3C` | Paid, positive, confirmations |

### Text & lines
| Token | Hex | Use |
|---|---|---|
| `--text` | `#1C1A16` | Primary text |
| `--text2` | `#4A4438` | Secondary text |
| `--text3` | `#9A8F7A` | Muted/labels/placeholders |
| `--border` / `--border2` | `#DDD5C4` / `#CEC4B0` | Hairlines, card borders |

### Company accents
- **LabGrownBox** → `#0d2b6e` (peacock)
- **Sakk Fine Jewelry** → `#9c2a4e` (burgundy)

Accents drive: order-section dividers, dashboard/report section headers, memo
letterhead, and chat company tags. They're editable per company in **Settings →
Companies**.

---

## 3. Typography

Loaded via `next/font/google`.

- **Display / serif — Cormorant Garamond** (`--serif`): page titles, card names,
  company names, KPI values on colored cards, memo letterhead. Elegant, high-contrast.
- **UI / sans — DM Sans** (`--sans`): all body text, labels, inputs, tables,
  numbers. Tabular-nums are enabled for money/metal figures so columns align.

Base size `15px`. Scale is compact (most labels `0.62–0.78rem`, body `0.84–0.9rem`,
titles `1.3–1.8rem`) to keep operational density high.

---

## 4. Layout system

Defined by `LayoutShell` → `Sidebar` + (`AppNav` + `main` + `AppFooter`), all inside
`.lgb-shell`.

```
┌───────────────────────────────────────────────┐
│ Sidebar  │  Top nav (AppNav)                   │
│ (rail)   ├─────────────────────────────────────┤
│          │                                     │
│  menu    │  main  (page content)               │
│  items   │                                     │
│          ├─────────────────────────────────────┤
│  [⟨]     │  footer                             │
└───────────────────────────────────────────────┘
```

- **Sidebar** (`--lgb-sidebar-w: 252px`, collapsed `80px`): fixed left rail, peacock
  background, gold active-item rail. Collapsible on desktop (toggle icon at top);
  becomes a slide-in **drawer** under 1024px with a dimmed backdrop.
- **Top nav** (`62px`): peacock bar — compact logo (left), centered search (home
  only), section icons + account menu (right). On mobile it stays a single row; the
  search shortens and only the Dashboard + account remain inline.
- **Main**: centered content column, max-width `1320px`, fluid padding
  `clamp(12px, 3vw, 24px)`.
- Radius scale: `--radius: 14px` (cards/modals), `--radius-sm: 8px` (inputs/buttons),
  `999px` (pills/badges/chips).
- Elevation: three shadow tokens (`--shadow`, `--shadow-md`, `--shadow-lg`) with a
  cool blue tint.

---

## 5. Navigation

- **Sidebar menu**: Home · Dashboard · **Chat** (unread badge) · New Order · Memo ·
  Statement · Payment · Reports · Fixing · History · Export · Settings. Each row is an
  icon + label + chevron; active row gets a gold inset rail + tinted background.
- **Top-nav account** (`NavAccount`): avatar + name dropdown → Profile / Logout.
- **Search** (`NavOrdersSearch`): only on Home; lives inside the peacock bar, syncs
  `?q=` to the embedded orders app.
- Icons throughout are **lucide-react**, `~18–20px`, stroke `2`.

---

## 6. Core components

- **Cards** (`.order-card`): cream surface, hairline border, 4:3 image, status badge
  (top-left), delete (top-right), serif item name, gold style code, owner avatar dot,
  cost in the footer. Hover lifts with `--shadow-md`. Error orders get a red border.
- **Stat / metal cards** (`.stats-card`): rounded gradient tiles (gold, silver,
  peacock, etc.) with serif/tabular values — used for live metal rates and dashboard
  KPIs.
- **Buttons**: `.btn` base; `.btn-p` (peacock, primary), `.btn-g` (cream, secondary),
  `.btn-r` (danger), `.btn-gold`. `36px` tall, `--radius-sm`, `.btn-sm` variant.
- **Badges**: status pills (`b-inquiry`, `b-casting`, `b-setter`, `b-hold`,
  `b-blocked`, `b-completed`) in soft tinted colors.
- **Tabs**: underline tabs with count chips (orders status filter, dashboard/report
  company toggle uses the pill `dash-series-toggle`).
- **Modals / overlays**: centered sheet on desktop, **bottom-sheet** on mobile
  (`overlay` slides up, full-width, rounded top).
- **Forms**: `.fc` inputs (cream2 fill, focus ring in peacock), grouped in `.fg2`/`.fg3`
  grids that collapse to one column on mobile.
- **Toasts**: bottom-right, color-coded (ok/err/info), auto-dismiss.

---

## 7. Screen-by-screen

- **Home / Orders** (`/`): a static SPA embedded via same-origin iframe
  (`public/orders-app/index.html`). Top strip of **live metal-rate cards** (Manhattan
  Gold & Silver feed) + refresh; status tabs; orders shown as a responsive card grid
  **grouped into per-company sections** with colored dividers, counts, and subtotals.
  Floating **+ FAB** opens the New Order / invoice-scan modal. New Order's tabs jump to
  the matching form section.
- **Dashboard** (`/dashboard`): **All · LabGrownBox · Sakk** toggle; KPI cards (active,
  pending cost, gold, cost, profit, completed) and a **two-line Cost & Profit** SVG
  chart over 6 months, plus vendor/type breakdowns.
- **Reports** (`/reports`): per-company sections (KPIs incl. **Outstanding** = cost −
  payments, plus by-status/vendor/type tables), date-range filter, and a **Print/PDF**
  button with a clean print stylesheet.
- **Statements / Payments**: company-scoped (All/LGB/Sakk); statements group casting &
  setter invoices by vendor; payments log per company.
- **Chat** (`/chat`): full-height group chat — left/right bubbles, sender names in
  gold, inline photos and voice-note players, dotted-paper background. Sticky input
  bar with photo + mic (record → send). Polls every 3s; unread badge in the sidebar.
- **Settings** (`/settings`): **Companies** editor (name/accent/logo/address/tax id),
  **AI keys (admin)**, **Users (admin)**, makers, Excel import/export, version.
- **Login** (`/login`): centered card on a peacock→cream gradient, brand logo, username
  + password with show/hide toggle.
- **Memo** (`/orders-app/memo.html`): print-optimized A4 manufacturing memo with the
  order's **company letterhead** (name/address/tax id/accent) and stone tables.

---

## 8. Multi-company theming

Every order, payment, and chat message is tagged with a company (`lgb` | `sakk`).
The registry (`src/lib/companies.ts`, stored in localStorage, editable in Settings)
provides each company's name, short label, accent color, logo, address, and tax id.
The UI never makes you "switch" companies destructively — orders show **both** in
labeled sections, while analytics screens offer an **All / per-company** toggle.

---

## 9. Responsive & mobile

- Breakpoints: **1024px** (sidebar → drawer), **860px** (chat/board columns stack),
  **640px / 520px / 380px** (nav, cards, type).
- Order cards: auto-fill grid → **2-up** on phones → 1-up under 380px.
- Top nav stays one row on mobile; search shortens, non-essential icons hide.
- Modals become bottom sheets; forms go single-column; safe-area insets respected
  (FAB, chat input).

---

## 10. PWA

Installable (manifest + theme color `#0d2b6e`). Service worker is **network-first with
cache fallback** for assets and **always-live for `/api/`** (so chat, metal rates, and
media are never stale). Voice recording uses `getUserMedia`/`MediaRecorder` (HTTPS or
localhost). Add-to-Home-Screen works from the deployed HTTPS URL.

---

## 11. Accessibility & polish

- All icon-only buttons have `aria-label`s; menus use `role="menu"`/`aria-expanded`.
- Focus-visible rings on interactive elements; status conveyed by text + color (not
  color alone) on badges.
- Tabular numerals for monetary/metal figures; `prefers-color-scheme` aware metal
  refresh; reduced motion respected by keeping animations subtle and short.

---

## 12. Iconography & assets

- Icons: **lucide-react** (consistent stroke weight `2`).
- Brand marks: `public/lgb/nav-logo.png` (diamond mark). Company logos are
  configurable per company for letterheads.
- Imagery: order photos (uploaded/scanned) shown 4:3 with object-fit cover; a faint
  diamond motif decorates card corners.
