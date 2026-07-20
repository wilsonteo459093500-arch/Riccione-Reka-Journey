# Sail CRM by Riccione Reka

Leads, pipeline, design workflow & after-sales for Sail Malaysia. Runs as a **PWA** — install it on your phone home screen, or open in any browser on desktop.

## What's in it

- **Dashboard** (manager) — KPIs, sales funnel, lead-source ROI, team performance, stale follow-ups
- **Leads** — searchable / filterable table + mobile card view, export to Excel / PDF
- **Pipeline** — drag-and-drop kanban for unpaid prospects (Stage 1 → Stage 2)
- **Confirmed Sales** — kanban for paid customers (Design → Production → Shipping → Installation → Complete). Stage gates require signed documents to advance.
- **Design Workflow** — six-step concept ↔ technical designer flow with working-day SLA deadlines and quotation-tier presentation limits
- **Calendar** — month view of showroom visits, site visits, installations & handovers. Export as `.ics` to sync into Google / Apple Calendar.
- **After-Sales** — permanent record of every post-handover case; requires Google Drive link to close
- **Analytics** (manager) — source ROI table, funnel, client mix, regional heatmap, AI-generated insights
- **Users & Audit** (manager) — role management + full audit trail of every change

## Tech stack

- **Vite + React 18 + Tailwind CSS** — fast dev, tiny bundle
- **Supabase** — cloud sync, realtime, multi-device & multi-user (optional)
- **IndexedDB** — local fallback when Supabase isn't configured
- **vite-plugin-pwa** — installable app + offline shell
- **Recharts** — analytics visualisations
- **SheetJS (xlsx)** — Excel import/export, lazy-loaded

## Run locally

```bash
cd crm
npm install
npm run dev      # http://localhost:5174
npm run build    # production bundle in /dist
npm run preview  # serve the bundle
```

## Cloud sync setup (recommended)

The app boots in **local mode** (IndexedDB on this browser only) unless you configure Supabase.

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** → paste & run `supabase/schema.sql`.
3. Copy `.env.example` to `.env.local` and fill in:
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGci...
   ```
4. `npm run dev` again. The header now shows ☁ "cloud sync".

When you deploy (Vercel / Netlify / Cloudflare Pages), set the same env vars in the platform UI.

## Install as a PWA

1. Deploy `dist/` to any static host (Vercel, Netlify, Cloudflare Pages).
2. Open the URL on your phone in Safari (iOS) or Chrome (Android).
3. **Share → Add to Home Screen.**

The app then opens fullscreen, works offline (shell + cached data), and behaves like a native app.

## Project layout

```
crm/
├── public/icon.svg          # PWA icon
├── supabase/schema.sql      # one-shot DB setup
└── src/
    ├── main.jsx
    ├── App.jsx              # state, mutations, view routing
    ├── index.css            # Tailwind + colour fixes
    ├── constants.js         # stages, roles, permissions
    ├── seed.js              # first-run sample data
    ├── utils.js             # money / date / lead helpers + exporters
    ├── services/
    │   ├── supabase.js
    │   ├── storage.js       # IndexedDB k/v
    │   └── repo.js          # unified data layer (cloud or local)
    └── components/
        ├── LoginScreen.jsx
        ├── Header.jsx
        ├── ReminderBar.jsx
        ├── Shared.jsx       # Card, KPICard, ExportMenu, FormField…
        ├── views/           # one file per top-level tab
        └── modals/          # lead detail, lead form, stage gate
```

## What changed vs the prototype

The original 2,500-line prototype had several bugs that made it un-runnable in a real browser:

1. **`window.storage` didn't exist** — replaced with the Supabase-or-IndexedDB `repo` abstraction.
2. **Invisible text** — selects, options & date pickers rendered white-on-white on iOS dark mode. Fixed globally in `index.css` (`color-scheme: light`, explicit colours, higher-contrast `--c-muted` and `--c-faint`).
3. **AI insights called `api.anthropic.com` directly** — that would leak the API key and be blocked by CORS. The placeholder is removed; if you want it back, deploy a Supabase Edge Function and set `VITE_AI_INSIGHTS_URL`.
4. **No realtime sync** — even with cloud configured, two browsers never saw each other's edits. Now: Supabase realtime broadcasts trigger a re-fetch on any change.
5. **No PWA** — couldn't install on a phone. Now installable & works offline.

## Roadmap (future improvements a senior engineer would tackle next)

These are not blockers but would meaningfully level up the app:

- **Real auth** — replace PIN login with Supabase email/OTP + RLS policies per role
- **Conflict resolution** — last-write-wins is fine for a 5-person team, but show a "someone else just updated this" toast when two browsers edit the same lead
- **Web Push notifications** — for follow-ups due today and stage moves (currently you only see them when the app is open)
- **Holiday calendar** — design SLA working-day math should skip MY public holidays
- **Photo upload to Supabase Storage** — replace the Drive-link placeholder for handover photos
- **Bulk operations** — multi-select leads to reassign PIC / change stage
- **URL routing** — deep-link a specific lead or filter (currently view state is in memory only)
- **Phone number normalization** — store E.164, display localised; today's storage is whatever the user typed
- **Deduplication on import** — detect existing leads by phone + name during Excel import
- **Drop-reason taxonomy** — replace free-text "why dropped" with structured categories so Analytics can surface real loss reasons
- **Per-row audit on Supabase** — log changes server-side (via triggers) so you can't bypass the audit by going around the UI
- **Edge function for AI insights** — keep the Anthropic API key server-side
