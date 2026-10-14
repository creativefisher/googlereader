# Reader — Google Reader–Inspired RSS App

A modern, three-pane RSS reader built with **Next.js (App Router)**, **TypeScript**, **Tailwind CSS**, **shadcn-style UI primitives**, **Prisma**, and **SQLite**. It is designed for daily reading and for experimenting with AI-powered code review tools: business logic lives in testable `src/lib/*` modules, with unit, integration, and Playwright end-to-end tests.

## Features

- Three-pane layout (subscriptions, article list, reading view)
- Feed add/discover, folder organization, OPML import/export
- Read/unread and starred state with unread counts
- Full-text search, sorting, infinite scroll
- Feed ingestion pipeline with deduplication and refresh logs
- SSRF-aware fetching, HTML sanitization, URL validation
- Light/dark themes and keyboard shortcuts (`j` / `k`, `/` for search)
- In-process background refresh scheduler (development-oriented)
- Offline-friendly seed data with fixture articles

## Architecture

```
src/lib/feeds/       discovery, fetch, parse, normalize, dedupe, ingest
src/lib/articles/    queries, search, read-state, sanitization
src/lib/folders/     folder CRUD
src/lib/jobs/        refresh scheduler
src/lib/opml/        import/export
src/lib/security/    URL validation & SSRF guards
src/app/api/         thin HTTP handlers
src/components/      UI (reader shell + shadcn-style primitives)
```

The Prisma schema models `User`, `Feed`, `Subscription`, `Folder`, `Article`, `ArticleState`, `RefreshLog`, and `UserSettings`. The app runs in **single-user mode** using `DEFAULT_USER_ID`, but the schema supports multiple users later.

### Background refresh limitations

The scheduler in `src/lib/jobs/refresh-scheduler.ts` runs inside the Next.js Node process:

- It stops when the dev server/build process stops.
- Hot reload can restart intervals.
- Multiple app instances would each schedule refreshes.

For production, use a dedicated cron/worker (for example, a secured `POST /api/feeds/refresh-all` triggered by Vercel Cron or similar).

## Getting started

### Prerequisites

- Node.js 20+
- npm

### Setup

```bash
cp .env.example .env
npm install
npm run db:push
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript (`strict`) |
| `npm run test` | Vitest unit + integration tests |
| `npm run test:e2e` | Playwright E2E tests |
| `npm run db:migrate` | Create/apply migrations |
| `npm run db:seed` | Seed offline sample feeds/articles |

## Testing

- **Unit tests** cover URL normalization, parsing, deduplication, sanitization, and folders.
- **Integration tests** cover ingestion, concurrent refresh guard, OPML, and search (using SQLite `prisma/test.db`).
- **E2E tests** cover reading flow, starring, and search against a built app.

Fixtures live in `tests/fixtures/` so tests do not depend on live RSS hosts.

## Security notes

- Feed and discovery requests pass SSRF checks (private/reserved IPs blocked).
- Article HTML is sanitized before rendering; scripts are stripped.
- API inputs are validated with Zod.

## License

MIT
