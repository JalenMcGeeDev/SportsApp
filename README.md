# Season

Youth sports tournament management, based on [Spec.md](Spec.md).

**Status: tested domain foundation backed by Supabase (auth, Postgres persistence, RLS, and a `pg_cron`/Edge Function job dispatcher), not a production-ready implementation of the full specification.** Payments and document storage are not connected. Use sample data only; do not enter real minors' information.

## Run Locally

Requires Node.js 22+ and pnpm 10.11.0, plus a Supabase project (see `supabase/migrations` and `supabase/functions/process-jobs`).

```sh
pnpm install
pnpm dev --hostname 127.0.0.1
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000), or the port printed by Next.js. `apps/web` requires these environment variables:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL, used by the browser, server, and middleware clients. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key for user-scoped Supabase auth/session requests. |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key used server-side for public tournament pages. Never exposed to the browser. |

Schedule generation and spectator-invite email delivery are handled out-of-band by the `process-jobs` Supabase Edge Function, dispatched on an interval by `pg_cron` (see `supabase/migrations/0002_job_dispatch.sql`) — no local worker process is needed.

## Working Features

- Responsive director dashboard and mobile navigation, with light/dark theme support.
- Multi-step tournament creation wizard covering details, venues (with their fields/courts), divisions, and optional spectator invite emails, followed by a review step. Can start from scratch or copy all values from a previous tournament.
- Tournament, division, venue (with per-sport field/court play areas), team registration, acceptance, and waitlist management.
- Private sample rosters with eligibility validation, approval gates, and team check-in.
- Deterministic round-robin, pool, single-elimination, and double-elimination primitives, including byes and downstream correction flags.
- Background schedule generation; availability, blackout, sport, rest, overlap, dependency, and daily-limit checks; explicit audited overrides for manual moves.
- Tournament-local times, with invalid or ambiguous daylight-saving input rejected.
- Optimistic version checking for scores and edits; standings and bracket advancement.
- Draft/published schedule separation, CSV export, in-app announcements and notifications, and local manager-to-coach message records.
- Public organization, schedule, score, bracket, and standings pages using a restricted projection that excludes player records and coach contact details.
- Background delivery of spectator-invite emails, queued when a tournament's schedule is first published and processed out-of-band by the `process-jobs` Edge Function (via Resend, with a console-log fallback when no API key is configured).

Sample public tournament: [Autumn Invitational](http://127.0.0.1:3000/austin-youth-sports/autumn-invitational).

Sample fees are unpaid. No money is charged, and there are no authenticated coach or guardian sessions. Spectator-invite emails are only actually delivered when `RESEND_API_KEY` is configured; otherwise they are logged to the Edge Function's console.

## Workspace

| Package | Responsibility |
| --- | --- |
| `apps/web` | Next.js App Router, director UI, spectator pages, Supabase-backed API |
| `packages/core` | Framework-independent eligibility, competition, standings, scheduling, commands |
| `packages/types` | Shared Zod request, state, and public-response schemas |
| `packages/api-client` | Typed fetch client and validated responses |
| `packages/data` | Supabase-backed workspace persistence, plus a sample-data fixture used by unit tests |
| `packages/ui-tokens` | Platform-neutral Season design tokens |
| `supabase/functions/process-jobs` | Edge Function that generates schedules and sends spectator invites, dispatched by `pg_cron` |

## Verification

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

The deterministic scheduler fixture covers 1,000 teams and 1,500 round-robin games; it is not a production distributed-load benchmark.

GitHub Actions runs unit tests, typechecking, lint, and production compilation on every push and pull request.

## Remaining Production Work

The full acceptance criteria in Spec.md are **not yet met**:

- Coach/guardian/platform-admin portals, and organization roles/invites beyond a single owner per organization.
- Paginated resource APIs, real-time subscriptions, persisted write-time standings, production public ISR/revalidation, and authenticated per-role access.
- Private uploads, signed download auditing, document review, guardian consent and waiver signing, and the 90-day document-purge job.
- Stripe Connect Express, signed/idempotent webhooks, authorization/capture, refunds, payouts, and application-fee configuration.
- Crash recovery and retry leases for job dispatch, notification outbox, Resend batching/delivery and unsubscribe support.
- Scheduler optimization/local search, full format/guarantee coverage and consolation, drag-and-drop moves, and manager resolution of flagged downstream played games. The current greedy scheduler reports unplaced games rather than claiming infeasible schedules are valid; possible-participant constraints can be conservative.
- Production security review, accessibility audit, all specified scale/load gates, deployment configuration, observability, and backup/restore.

Decisions confirmed for v1: the proposed sports set; configurable application fees initially 0%; teams in multiple divisions; no coach background checks; document purge 90 days after tournament completion; hard game guarantees; reschedule remaining games after weather disruptions. Confirmation of a decision does not imply the integration is implemented.

## Sample Image

The youth soccer image is downloaded from [Unsplash](https://images.unsplash.com/photo-1526232761682-d26e03ac148e). It is illustrative sample imagery, not a photograph of the seeded venue or teams.
