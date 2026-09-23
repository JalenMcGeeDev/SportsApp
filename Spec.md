# Youth Sports Tournament Management Platform — Build Specification

**Version:** 1.0
**Status:** Ready for implementation
**Audience:** AI coding agent building v1 from greenfield

---

## 1. Product Summary

A multi-tenant SaaS platform for running **youth sports tournaments** (discrete multi-day events), not season-long leagues.

Tournament organizations use it to accept team registrations, collect entry fees, verify player eligibility, auto-generate constraint-satisfying game schedules, run brackets, enter scores, and communicate with coaches and parents. Coaches and parents use it to register, submit rosters, pay, and view personalized schedules. Spectators view public brackets and standings without an account.

### The one-sentence pitch
*Tournament directors replace a spreadsheet, a group text, and a paper waiver binder with one system that generates the schedule and keeps 1,000 teams informed when it changes.*

---

## 2. Personas & Roles

| Persona | Role key | Core jobs |
|---|---|---|
| **Tournament Manager** | `org_admin` | Create tournaments/divisions, accept or waitlist teams, approve rosters and documents, generate and hand-edit schedules, publish, broadcast announcements, message coaches |
| **Org Owner** | `org_owner` | Everything `org_admin` can do, plus billing, Stripe Connect payouts, org branding, inviting staff |
| **Event Staff** | `org_staff` | Enter scores, run team check-in. No financial or roster-approval access |
| **Coach / Team Manager** | `coach` | Register a team, pay entry fee, build roster, upload documents, view team schedule, message the tournament manager |
| **Parent / Guardian** | `parent` | Link to their child, e-sign waivers, view *their child's* personalized schedule, receive alerts |
| **Spectator** | *(anonymous)* | View public schedules, brackets, standings |
| **Platform Admin** | `platform_admin` | Cross-tenant support and operations |

**Authority model:** The Tournament Manager controls the schedule unilaterally. Coaches and parents have **no** ability to submit blackout constraints or request schedule changes. This is a deliberate simplification — do not build request/approval workflows.

---

## 3. Scope

### 3.1 In scope for v1
1. Multi-tenant organizations with custom branding and independent Stripe payouts
2. Multi-sport support, with sport rules configurable per tournament
3. Team registration with online entry-fee payment, refunds, and waitlists
4. Roster management with age-verification documents, e-signed waivers, and manager approval gating
5. Constraint-based automatic schedule generation with manual hand-editing
6. All competition formats: pool play, round robin, single elimination, double elimination, consolation brackets, and pool-play-into-bracket
7. Score entry by manager/staff, with automatic bracket advancement and standings recomputation
8. Personalized schedule views for coaches (team) and parents (their child)
9. Communication: broadcast and targeted announcements, automatic schedule-change alerts, two-way messaging between tournament manager and coaches
10. Email (Resend) plus an in-app notification center
11. Public, SEO-friendly tournament pages showing schedules, brackets, and standings — **with player names and rosters hidden from anonymous visitors**
12. Team check-in / day-of arrival tracking

### 3.2 Explicitly out of scope for v1
Do not build these. Do not stub UI for them.

- Referee/official assignment, availability, or payments
- Venue maps, directions, or field-finding
- Concessions, merchandise, or ticketing
- Stay-to-play hotel booking
- Video streaming or highlight clips
- Player statistics, leaderboards, or individual performance tracking
- Season/league play (standings across a multi-week season)
- Team-level group chat or parent-to-parent messaging
- SMS and push notifications
- Native mobile apps

### 3.3 Planned for v2 (architect for it, don't build it)
- **React Native mobile app** for coaches and parents
- SMS (Twilio) and push notifications
- Offline schedule caching for poor venue connectivity

---

## 4. Technology Stack

**Non-negotiable choices made by the product owner:**

| Layer | Technology |
|---|---|
| Web client | **React** |
| Hosting | **Vercel** |
| Database, auth, storage, realtime | **Supabase** (Postgres) |
| Transactional email | **Resend** |
| Payments | **Stripe** (Connect, for per-org payouts) |
| Mobile (v2) | **React Native** |

**Implementation decisions delegated to you, with required rationale:**

- Use **Next.js (App Router)** as the React framework. Required because public tournament pages must be SEO-indexable and server-rendered, and because game-day read traffic needs ISR plus on-demand revalidation. A client-only SPA cannot meet the public-page requirements.
- Use **TypeScript** everywhere, strict mode.
- Use a **monorepo** (pnpm workspaces + Turborepo).
- Heavy/long-running work (schedule generation, bulk email) must run outside the request path — use Vercel background functions or a queue-backed worker. Do not run the scheduler in a serverless HTTP handler with a 10s budget.

### 4.1 Monorepo layout — API-first, mobile-ready

```
apps/
  web/                  Next.js App Router — all personas + public pages
  worker/               Background jobs: schedule solver, email batches, webhooks
packages/
  core/                 Domain logic. ZERO web/DOM dependencies.
                        - scheduling/   constraint solver
                        - brackets/     bracket generation + advancement
                        - standings/    points + tiebreaker engine
                        - eligibility/  age & document rules
  api-client/           Typed client over the HTTP API. Consumed by web AND future React Native
  types/                Shared TS types + Zod schemas (single source of truth for validation)
  ui-tokens/            Colors, spacing, typography as platform-neutral tokens
supabase/
  migrations/           SQL migrations
  functions/            Edge functions (Stripe webhooks, signed-URL issuance)
```

**Mobile-readiness rules — enforce these from commit one:**
1. Every capability is exposed through a versioned HTTP API (`/api/v1/*`). No business logic lives only in a React Server Component.
2. `packages/core` must never import React, `next/*`, or any browser global. It must be runnable in Node and in a React Native JS runtime.
3. All request/response shapes are defined once as Zod schemas in `packages/types` and inferred into TypeScript types.
4. Styling tokens live in `packages/ui-tokens` as plain objects, not CSS files, so React Native can consume them.

---

## 5. Domain Model

Use `snake_case` Postgres tables. All tenant-scoped tables carry `organization_id` and are protected by RLS.

### 5.1 Tenancy & identity
- **organizations** — `id`, `name`, `slug` (unique), `logo_url`, `primary_color`, `secondary_color`, `timezone`, `stripe_connect_account_id`, `stripe_onboarding_complete`, `created_at`
- **profiles** — extends `auth.users`: `id`, `full_name`, `email`, `phone`, `created_at`
- **organization_members** — `organization_id`, `user_id`, `role` (`owner` | `admin` | `staff`), `invited_at`, `accepted_at`

### 5.2 Tournament configuration
- **sports** — reference table: `key`, `display_name`, `default_rules` (jsonb)
- **tournaments** — `organization_id`, `sport_key`, `name`, `slug`, `starts_on`, `ends_on`, `timezone`, `registration_opens_at`, `registration_closes_at`, `status` (`draft` | `registration_open` | `registration_closed` | `scheduled` | `in_progress` | `completed` | `archived`), `default_entry_fee_cents`, `refund_policy_text`, `refund_cutoff_at`, `is_public`, `description`
- **tournament_rules** — per tournament, sport-configurable: `game_length_minutes`, `period_count`, `period_length_minutes`, `halftime_minutes`, `buffer_minutes_between_games`, `min_rest_minutes`, `max_games_per_team_per_day`, `mercy_rule` (jsonb), `overtime_rules` (jsonb), `point_system` (jsonb: win/loss/tie/forfeit/shutout points), `tiebreakers` (jsonb ordered array), `roster_min_players`, `roster_max_players`, `required_document_types` (array)
- **divisions** — `tournament_id`, `name` (e.g. "U12 Boys Elite"), `gender` (`boys`|`girls`|`coed`), `age_cutoff_date`, `earliest_birthdate`, `latest_birthdate`, `skill_level`, `max_teams`, `entry_fee_cents_override`, `format` (`pool_to_bracket` | `round_robin` | `single_elim` | `double_elim` | `pool_only`), `guaranteed_games`, `advance_per_pool`, `consolation_bracket_enabled`, `earliest_start_time`, `latest_end_time`
- **venues** — `organization_id`, `name`, `address_line1`, `city`, `state`, `postal_code`, `timezone`
- **fields** — `venue_id`, `name`, `surface_type`, `supported_sports` (array), `is_active`
- **field_availability_windows** — `field_id`, `date`, `starts_at`, `ends_at`, `is_blackout`

### 5.3 Teams, registration, payment
- **teams** — `name`, `club_name`, `home_city`, `home_state`, `created_by_user_id`. Teams are portable across tournaments and organizations.
- **registrations** — the central join: `tournament_id`, `division_id`, `team_id`, `status` (`draft` | `submitted` | `waitlisted` | `accepted` | `declined` | `withdrawn`), `payment_status` (`unpaid` | `processing` | `paid` | `refunded` | `partially_refunded` | `failed`), `amount_cents`, `stripe_payment_intent_id`, `stripe_refund_id`, `waitlist_position`, `submitted_at`, `decided_at`, `decided_by_user_id`, `roster_approval_status` (`pending` | `approved` | `changes_requested`), `seed`
- **registration_staff** — `registration_id`, `user_id`, `role` (`head_coach` | `assistant_coach` | `team_manager`)

### 5.4 Players & compliance
- **players** — `registration_id`, `first_name`, `last_name`, `birthdate`, `jersey_number`, `position`, `eligibility_status` (`pending` | `verified` | `rejected`), `rejection_reason`
- **player_documents** — `player_id`, `document_type` (`age_verification` | `medical_release` | `photo` | `other`), `storage_path`, `status` (`pending` | `approved` | `rejected`), `reviewed_by_user_id`, `reviewed_at`, `rejection_reason`
- **waiver_templates** — `organization_id`, `title`, `body_markdown`, `version`, `is_active`
- **waiver_signatures** — `waiver_template_id`, `player_id`, `signer_user_id`, `signer_name`, `relationship`, `signed_at`, `ip_address`, `user_agent`, `signature_data`
- **guardian_links** — `user_id`, `player_id`, `relationship`, `verified_at`. This is what powers the parent's "my child's schedule" view.

### 5.5 Competition
- **pools** — `division_id`, `name` ("Pool A"), `display_order`
- **pool_memberships** — `pool_id`, `registration_id`, `seed`
- **bracket_nodes** — `division_id`, `bracket_type` (`championship` | `consolation` | `losers`), `round`, `position`, `label` ("Semifinal 1"), `game_id`, `home_source` (jsonb: pool finish, node winner, or node loser), `away_source` (jsonb), `winner_advances_to_node_id`, `winner_advances_to_slot`, `loser_advances_to_node_id`, `loser_advances_to_slot`, `is_if_necessary`
- **games** — `tournament_id`, `division_id`, `pool_id` (nullable), `bracket_node_id` (nullable), `field_id`, `scheduled_start`, `scheduled_end`, `home_registration_id`, `away_registration_id`, `status` (`unscheduled` | `scheduled` | `in_progress` | `final` | `forfeit` | `cancelled` | `postponed`), `home_score`, `away_score`, `period_scores` (jsonb), `winner_registration_id`, `forfeit_by_registration_id`, `score_entered_by_user_id`, `score_entered_at`, `version`
- **standings** — denormalized, recomputed on score change: `division_id`, `pool_id`, `registration_id`, `games_played`, `wins`, `losses`, `ties`, `points`, `goals_for`, `goals_against`, `goal_differential`, `rank`, `tiebreak_trace` (jsonb — the ordered reasons this team ranks where it does)
- **schedule_runs** — `tournament_id`, `parameters` (jsonb), `random_seed`, `status` (`queued` | `running` | `succeeded` | `failed`), `objective_score`, `unplaced_game_count`, `violations` (jsonb), `created_by_user_id`, `started_at`, `completed_at`, `is_published`

### 5.6 Communication & operations
- **announcements** — `tournament_id`, `audience_type` (`tournament` | `division` | `team`), `audience_id`, `subject`, `body_markdown`, `channels` (array: `email`, `in_app`), `sent_by_user_id`, `sent_at`, `recipient_count`
- **message_threads** — `tournament_id`, `registration_id`, `subject`, `last_message_at`. Strictly tournament-manager ↔ that team's coaches.
- **messages** — `thread_id`, `sender_user_id`, `body`, `sent_at`
- **message_reads** — `message_id`, `user_id`, `read_at`
- **notifications** — `user_id`, `type`, `title`, `body`, `link_url`, `payload` (jsonb), `read_at`, `created_at`
- **check_ins** — `registration_id`, `status` (`not_checked_in` | `checked_in` | `flagged`), `checked_in_at`, `checked_in_by_user_id`, `notes`
- **audit_log** — `organization_id`, `actor_user_id`, `entity_type`, `entity_id`, `action`, `before` (jsonb), `after` (jsonb), `ip_address`, `created_at`

---

## 6. Core Engines

These are the hard parts. Build them in `packages/core` as pure functions with exhaustive unit tests, independent of the database.

### 6.1 Scheduling engine

**Input:** tournament rules, divisions, pools, registrations, fields, field availability windows, and a random seed.
**Output:** a set of `(game, field, start_time)` assignments plus a feasibility report.

**Hard constraints (a schedule violating any of these is invalid):**
- A team is never in two games at once
- A field hosts one game at a time, respecting `buffer_minutes_between_games`
- Games fall entirely inside a field's availability window and outside blackouts
- A team gets at least `min_rest_minutes` between its games
- A team plays no more than `max_games_per_team_per_day`
- Games respect the division's `earliest_start_time` / `latest_end_time`
- All pool games in a division finish before that division's bracket begins
- Bracket round *N+1* starts after every round *N* feeder game ends, plus rest
- Games only occupy fields whose `supported_sports` includes the tournament sport

**Soft constraints (weighted objective function, minimize):**
- Total team idle time between first and last game of a day
- Number of venue changes per team per day
- Imbalance in early-slot vs late-slot assignments across teams
- Pool games scattered across many fields (prefer pool cohesion)
- Unused field capacity

**Algorithm:** greedy seeded construction (schedule most-constrained divisions and tightest fields first), then local search — simulated annealing or tabu search — with a configurable time budget (default 60s, max 300s). **Must be deterministic given the same input and seed.**

**Execution:** runs as a background job writing to `schedule_runs`. The UI polls or subscribes via Supabase Realtime. A run that cannot place every game still succeeds, reporting `unplaced_game_count` and a human-readable `violations` list.

**Manual editing:** after generation the manager can drag a game to a different field or time. The UI must validate against hard constraints in real time and show a blocking error naming the specific violated constraint and the conflicting game. The manager may override soft constraints freely; hard constraints require an explicit "force" confirmation that is written to the audit log.

**Publishing:** a schedule run is a draft until published. Publishing makes it visible to coaches, parents, and the public, and triggers schedule notifications. Re-publishing after edits sends **change-only** notifications — a team whose games did not move must not be emailed.

### 6.2 Bracket engine

- Generate brackets for all supported formats: single elimination, double elimination (with losers bracket and an if-necessary final), round robin, pool play, pool-into-bracket, and consolation brackets.
- Handle non-power-of-2 team counts with correct bye placement (byes go to top seeds).
- Support standard seeding (1 vs N, 2 vs N-1) and cross-pool seeding ("A1 vs B2").
- Honor `advance_per_pool` and `guaranteed_games` — a "3-game guarantee" format must actually guarantee three games per team.
- On a final score, automatically advance the winner (and, in double elim, drop the loser) into the next node.
- **Score correction must cascade:** editing a finalized score recomputes every downstream node and standings, and flags any downstream game already played with now-invalid participants for manager resolution. Never silently corrupt a bracket.

### 6.3 Standings & tiebreaker engine

- Compute from `point_system` in tournament rules (configurable points for win/loss/tie/forfeit/shutout).
- Apply `tiebreakers` as an **ordered, configurable list**. Support at minimum: head-to-head record, head-to-head point differential, total point differential (with configurable per-game cap), fewest points allowed, most points scored, fewest disciplinary points, and coin flip / manual resolution.
- Handle multi-way ties correctly: when three or more teams tie, apply each criterion across the full tied group, and re-apply from the top of the list whenever the group is partially broken.
- Emit `tiebreak_trace` — a machine- and human-readable explanation of why each team ranks where it does. Tournament directors get challenged on this constantly; the answer must be in the UI.

### 6.4 Eligibility engine

- Validate each player's birthdate against the division's `earliest_birthdate` / `latest_birthdate`.
- Verify roster size is between `roster_min_players` and `roster_max_players`.
- Verify every `required_document_types` entry is present and `approved` for every player.
- Verify a current-version waiver signature exists for every player.
- A registration cannot reach `roster_approval_status = approved` while any check fails. Surface failures as a specific, actionable checklist to the coach.

---

## 7. Surfaces & Key Flows

### 7.1 Public (no auth)
- `/{org-slug}` — organization landing page with branding and upcoming tournaments
- `/{org-slug}/{tournament-slug}` — overview, divisions, dates, registration status
- `/{org-slug}/{tournament-slug}/schedule` — full schedule, filterable by division, field, date, and team
- `/{org-slug}/{tournament-slug}/brackets/{division}` — visual bracket, live
- `/{org-slug}/{tournament-slug}/standings/{division}` — standings with visible tiebreak explanations
- `/{org-slug}/{tournament-slug}/register` — public registration entry point

**Privacy rule, strictly enforced:** anonymous responses expose **team names, scores, times, fields, and standings only**. Player names, jersey numbers, birthdates, rosters, and documents are never present in an anonymous response — not in the HTML, not in the JSON, not in `__NEXT_DATA__`. Enforce at the RLS layer, not just the UI layer.

### 7.2 Coach / Team Manager
Register a team → select division → pay entry fee → build roster → upload documents → collect parent waiver signatures → see approval status → view team schedule → view bracket position → message the tournament manager → check in on arrival.

The roster screen must show a live eligibility checklist: what's missing, for which player, and what to do about it.

### 7.3 Parent / Guardian
Accept a coach's invite → link to their child → e-sign waivers → view **their child's** personalized schedule (only games their child's team plays) → receive change alerts → view public brackets and standings.

Parents have no roster-editing or messaging privileges.

### 7.4 Tournament Manager
Create tournament → configure sport rules and tiebreakers → define divisions → add venues and fields with availability → open registration → review and accept/waitlist/decline teams → approve rosters and documents → assign pools and seeds → run the scheduler → review and hand-edit the draft → publish → broadcast announcements → enter scores → watch brackets advance → manage check-in → handle refunds.

The command center is a **game-day operations view**: every game today, grouped by field, with one-tap score entry, delay/postpone actions, and a broadcast button.

---

## 8. Payments (Stripe)

- **Stripe Connect** (Express accounts) so each organization receives its own payouts. Onboard during org setup; block registration opening until onboarding completes.
- Entry fee charged at registration submission. Division-level `entry_fee_cents_override` takes precedence over the tournament default.
- **Waitlist handling:** when a division is full, a submitted registration becomes `waitlisted` with a position. Authorize but do **not** capture payment for waitlisted teams; capture on acceptance, release on decline. If a waitlisted authorization is about to expire, void it and require re-payment on acceptance.
- **Refunds:** full refund before `refund_cutoff_at`; after that, manual manager-initiated partial or full refund. Every refund writes to the audit log.
- All Stripe webhooks must be **signature-verified** and **idempotent** (store `stripe_event_id` and no-op on replay).
- Never store card data. Use Stripe Checkout or Payment Elements.
- Store all money as integer cents. Never use floats.

---

## 9. Notifications

**Channels in v1:** Resend email + in-app notification center. Every notification writes a `notifications` row regardless of email delivery.

**Triggers:**

| Event | Recipients |
|---|---|
| Registration submitted | Coach (confirmation), tournament manager (action needed) |
| Registration accepted / waitlisted / declined | Coach |
| Payment succeeded / failed / refunded | Coach |
| Document approved / rejected | Coach, and the signing parent if rejected |
| Roster approved | Coach |
| Schedule published | All coaches + all linked parents in the tournament |
| Game time or field changed | Only affected teams' coaches and parents |
| Game delayed, postponed, or cancelled | Only affected teams' coaches and parents |
| Bracket advanced (next game set) | Both teams' coaches and parents |
| Check-in reminder | Coaches, morning of day 1 |
| New announcement | The targeted audience |
| New message in thread | The other party |

**Requirements:**
- Batch and rate-limit. Publishing a schedule for 1,000 teams must not fire 1,000 synchronous emails — enqueue and send from the worker.
- Deduplicate: editing five games for one team produces one digest email, not five.
- All emails carry org branding (logo, primary color) and a working unsubscribe for non-critical categories. Schedule changes and payment receipts are transactional and not unsubscribable.
- Respect tournament `timezone` in every rendered time. Never render a bare UTC timestamp to a user.

---

## 10. Security, Privacy & Child Safety

This is a platform handling minors' data. These are requirements, not suggestions.

1. **Row Level Security on every table.** No table is readable without an explicit policy. Test policies directly against the database, not through the app.
2. **Tenant isolation:** a user in org A can never read org B's data. Write an automated test that attempts cross-tenant reads for every table and asserts denial.
3. **Minors never have accounts.** Players are records, not users. Parents and coaches hold the accounts.
4. **Documents** (birth certificates, medical releases) live in a **private** Supabase Storage bucket. Access only via short-TTL signed URLs issued by an authenticated server route. Every issuance is written to `audit_log`.
5. **Anonymous responses must not contain PII about minors.** Add a CI test that fetches every public route unauthenticated and asserts no player name, birthdate, or document path appears in the payload.
6. **Parents see only their linked children.** Coaches see only their own team's roster. No cross-team roster visibility.
7. Audit-log every roster approval, document view, score change, schedule force-override, refund, and role change.
8. Rate-limit authentication, registration, and public read endpoints.
9. Validate every input server-side with the shared Zod schemas. Client validation is UX only.
10. No secrets in the client bundle. The Supabase service-role key is server-only and never reaches `NEXT_PUBLIC_*`.

---

## 11. Scale & Performance Targets

Target: **hundreds of organizations, 1,000+ teams per tournament, heavy concurrent game-day traffic.**

| Path | Requirement |
|---|---|
| Public schedule / bracket / standings page | p95 < 500 ms under 10,000 concurrent readers. Statically rendered with ISR + on-demand revalidation triggered by score and schedule changes; served from the CDN edge |
| Score entry → public page reflects it | < 5 seconds |
| Authenticated live score updates | Supabase Realtime, one channel per division. Do not subscribe clients to tournament-wide firehoses |
| Schedule generation, 1,000 teams | Completes within a 300 s budget as a background job; never blocks a request |
| Standings | Read from the denormalized `standings` table. Never compute on read |

**Additional requirements:**
- Index every foreign key and every column used in a public filter (`tournament_id`, `division_id`, `scheduled_start`, `field_id`, `status`).
- Use connection pooling (Supabase transaction-mode pooler) — serverless functions will exhaust direct connections otherwise.
- Paginate every list endpoint. No unbounded `select *`.
- Game score writes use optimistic concurrency via the `version` column to prevent two scorekeepers overwriting each other.
- Load-test the public game-day read path before launch.

---

## 12. Delivery Milestones

Each milestone must be independently demoable and ship with tests.

| # | Milestone | Contents |
|---|---|---|
| **M0** | Foundation | Monorepo, Supabase schema + migrations, auth, RLS baseline, org tenancy, member invites, branding, CI |
| **M1** | Tournament setup | Tournaments, sport rules config, divisions, venues, fields, availability windows |
| **M2** | Registration & payments | Public registration flow, Stripe Connect onboarding, entry fees, waitlist, accept/decline, refunds |
| **M3** | Rosters & compliance | Players, document upload/review, waiver templates + e-signature, guardian links, eligibility engine, approval gating |
| **M4** | Scheduling engine | Constraint solver in `packages/core`, background job execution, schedule runs, manual drag-edit with live validation, publish |
| **M5** | Brackets, scoring & standings | Bracket generation for all formats, pool assignment and seeding, score entry, auto-advancement, cascading corrections, tiebreaker engine with traces |
| **M6** | Public experience | SEO-optimized public pages, ISR + revalidation, live bracket/standings, PII-exclusion tests |
| **M7** | Communication | Announcements (tournament/division/team), automatic change alerts, TM↔coach messaging, notification center, Resend templates, batching |
| **M8** | Game-day operations | Team check-in, game-day command center, delay/postpone/cancel actions with alerts |
| **M9** | Hardening | Load testing at target scale, cross-tenant security test suite, observability, error tracking, runbooks |

---

## 13. Acceptance Criteria

v1 is complete when all of the following are demonstrably true:

**Tenancy & security**
- [ ] A user in org A receives a denial for every attempted read of org B data, verified by an automated test covering every table
- [ ] Unauthenticated fetches of all public routes contain zero player names, birthdates, or document paths
- [ ] Documents are inaccessible without a valid, unexpired signed URL

**Registration & payment**
- [ ] A coach registers a team, pays an entry fee via Stripe, and the organization receives the payout through Connect
- [ ] Registering into a full division produces a waitlist entry with a position and no captured charge
- [ ] Accepting a waitlisted team captures payment; declining releases the authorization
- [ ] A refund issued before the cutoff succeeds and is recorded in the audit log
- [ ] Replaying a Stripe webhook produces no duplicate side effects

**Compliance**
- [ ] A roster containing a player outside the division's age range cannot be approved, and the UI names the specific player and the reason
- [ ] A roster missing a required document or waiver signature cannot be approved
- [ ] A parent e-signs a waiver and the signature is recorded with timestamp, IP, and signer identity

**Scheduling**
- [ ] The scheduler generates a valid schedule for 1,000 teams across multiple divisions, venues, and days within 300 seconds
- [ ] The generated schedule violates zero hard constraints, verified by an independent validator
- [ ] Re-running with the same seed and input produces an identical schedule
- [ ] Dragging a game into a conflict is blocked with a message naming the specific constraint and conflicting game
- [ ] Publishing notifies all teams; re-publishing notifies only teams whose games changed

**Competition**
- [ ] Each of pool play, round robin, single elim, double elim, consolation, and pool-into-bracket generates correctly, including byes for non-power-of-2 fields
- [ ] Entering a final score advances the winner automatically, and in double elim drops the loser into the losers bracket
- [ ] Correcting a finalized score cascades through all downstream bracket nodes and standings, flagging any now-invalid played game
- [ ] A three-way tie resolves per the configured ordered tiebreakers, and the UI displays the reasoning

**Experience**
- [ ] A parent sees only their own child's games on their schedule view
- [ ] A coach sees only their own team's roster
- [ ] Moving a game sends a change alert only to the affected teams
- [ ] A tournament manager and coach exchange messages in a thread scoped to that team
- [ ] Every time displayed respects the tournament's timezone

**Scale**
- [ ] Public schedule and bracket pages hold p95 < 500 ms under 10,000 concurrent readers
- [ ] A score entered by staff appears on the public bracket within 5 seconds
- [ ] Two scorekeepers submitting the same game concurrently produce a conflict error, not a silent overwrite

**Mobile readiness**
- [ ] `packages/core` builds and its full test suite passes in a plain Node environment with no React, DOM, or `next/*` dependency
- [ ] Every v1 capability is reachable through the versioned HTTP API, not only through server components

---

## 14. Open Questions for the Product Owner

Resolve before or during M1. Reasonable defaults are proposed — proceed with the default if unanswered.

1. **Which sports ship first?** Multi-sport is confirmed, but seed data is needed. *Default: soccer, basketball, baseball/softball, volleyball, and flag football.*
2. **Platform revenue model?** Per-tournament fee, percentage of entry fees, or flat subscription — this determines whether Stripe Connect needs application fees configured. *Default: build Connect with a configurable application-fee percentage, set to 0.*
3. **Can one team register for multiple divisions in the same tournament?** *Default: yes, as separate registrations.*
4. **Coach identity verification / background checks?** Currently out of scope. Confirm this is acceptable for the target market.
5. **Data retention for minors' documents.** *Default: auto-purge uploaded documents 90 days after tournament completion; retain the approval decision and audit log.*
6. **Is a "3-game guarantee" a contractual promise the scheduler must never break,** even at the cost of a worse objective score? *Default: yes, treat as a hard constraint.*
7. **Weather/postponement policy** — when a day is cancelled, should the scheduler support re-generating remaining games in place? *Default: yes, build a "reschedule remaining games" action in M8.*

---

## 15. Instructions to the Building Agent

1. **Do not expand scope.** Section 3.2 is a list of things to *not* build. If a feature feels missing, check that list first.
2. **Build `packages/core` first and test it in isolation.** The scheduling, bracket, standings, and eligibility engines are the product. Get them provably correct with unit tests before wiring any UI.
3. **Write RLS policies alongside every migration**, never afterward. Test them with direct database queries as different roles.
4. **Treat the API as the contract.** Before implementing a feature in the web app, define its Zod schema in `packages/types` and its endpoint in `apps/web/app/api/v1`. The React Native app will consume exactly these.
5. **Money is integer cents. Times are timezone-aware.** Two of the most common and most damaging classes of bug in this domain.
6. **Determinism matters.** Schedule generation, bracket seeding, and tiebreaking must all be reproducible and explainable. A tournament director will be challenged in person on every one of these outputs and needs the system to show its work.
7. **Ask before guessing on Section 14.** Those decisions have architectural consequences.
