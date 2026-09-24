-- Stripe Connect support.
--
-- The rich, per-org Stripe state (feeMode, stripeConnectAccountId, stripeOnboardingComplete)
-- lives in the `workspaces.data` JSONB blob alongside the rest of the organization, since
-- packages/core's applyCommand() is a pure function that can only read/gate on that blob
-- (e.g. blocking "registration_open" until onboarding is complete).
--
-- `organizations.stripe_connect_account_id` is a thin, denormalized mirror of the same id,
-- kept only so the Stripe webhook handler (which receives a bare Connect account id, not an
-- org id) can find the right org without scanning every workspace blob.
alter table public.organizations
  add column stripe_connect_account_id text unique,
  add column stripe_onboarding_complete boolean not null default false;

-- Idempotency ledger for Stripe webhooks: signature-verified events are inserted here before
-- processing; a conflict on `id` (the Stripe event id) means this event was already handled,
-- so the webhook handler no-ops on replay instead of double-applying side effects.
create table public.stripe_webhook_events (
  id text primary key,
  type text not null,
  created_at timestamptz not null default now()
);

alter table public.stripe_webhook_events enable row level security;
-- No policies: only the service-role client (used exclusively by the webhook route) can
-- access this table; regular org-member sessions have no need to read or write it.
