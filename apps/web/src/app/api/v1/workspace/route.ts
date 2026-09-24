import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { applyCommand, DomainError } from "@season/core";
import { mutateWorkspace, readWorkspace } from "@season/data";
import { mutationSchema } from "@season/types";
import { requireOrgMembership } from "@/lib/org";
import { isSameOrigin } from "@/lib/origin-guard";
import { sendPaymentRequestEmail } from "@/lib/email";
import { computeFeeSplit, getStripeClient } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const buckets = new Map<string, { count: number; expires: number }>();

function rateLimit(key: string) {
  const bucket = buckets.get(key);
  if (buckets.size > 1000) for (const [bucketKey, entry] of buckets) if (entry.expires < Date.now()) buckets.delete(bucketKey);
  if (!bucket || bucket.expires < Date.now()) buckets.set(key, { count: 1, expires: Date.now() + 60_000 });
  else if (++bucket.count > 180) throw new DomainError("Too many requests. Please wait a moment.", 429);
}

function fail(error: unknown) {
  if (error instanceof DomainError) return NextResponse.json({ error: error.message, details: error.details }, { status: error.status });
  console.error("Workspace request failed", error instanceof Error ? error.name : "Unknown error");
  return NextResponse.json({ error: "Unable to save the workspace. Please try again." }, { status: 500 });
}

export async function GET(request: NextRequest) {
  try {
    const { supabase, orgId, userId } = await requireOrgMembership();
    rateLimit(userId);
    const state = await readWorkspace(supabase, orgId);
    return NextResponse.json(state, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return fail(error); }
}

export async function POST(request: NextRequest) {
  try {
    if (!isSameOrigin(request)) throw new DomainError("Invalid request origin", 403);
    const { supabase, orgId, userId, role } = await requireOrgMembership();
    rateLimit(userId);
    const raw = await request.text();
    if (raw.length > 100_000) throw new DomainError("Request is too large", 413);
    let json: unknown;
    try { json = JSON.parse(raw); } catch { throw new DomainError("Invalid JSON request", 400); }
    const parsed = mutationSchema.safeParse(json);
    if (!parsed.success) throw new DomainError("Check the highlighted information and try again.", 422, parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`));
    if (parsed.data.command.type === "update_fee_mode" && role !== "org_owner") throw new DomainError("Only the organization owner can change billing settings.", 403);
    if (parsed.data.command.type === "delete_tournament" && role !== "org_owner") throw new DomainError("Only the organization owner can delete a tournament.", 403);
    let state = await mutateWorkspace(supabase, orgId, (state) => {
      if (state.revision !== parsed.data.revision) {
        console.error("workspace route: revision mismatch", { orgId, commandType: parsed.data.command.type, clientRevision: parsed.data.revision, serverRevision: state.revision });
        throw new DomainError("This workspace changed in another window. Refresh and retry.", 409);
      }
      return applyCommand(state, parsed.data.command, { now: new Date().toISOString(), id: randomUUID });
    });
    if (parsed.data.command.type === "registration_status" && parsed.data.command.status === "accepted") {
      state = await tryRequestPayment(supabase, orgId, state, request.nextUrl.origin, parsed.data.command.tournamentId, parsed.data.command.registrationId);
    }
    return NextResponse.json(state, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return fail(error); }
}

// After an acceptance, kick off entry-fee collection: create a destination-charge PaymentIntent
// against the org's Connect account and email the coach a link to pay it. Skips silently (the
// acceptance itself still succeeds) if there's nothing to charge or the org isn't ready to
// accept payments yet, since Stripe onboarding could have lapsed after registration opened.
async function tryRequestPayment(supabase: Parameters<typeof mutateWorkspace>[0], orgId: string, state: Awaited<ReturnType<typeof readWorkspace>>, origin: string, tournamentId: string, registrationId: string) {
  const tournament = state.tournaments.find((item) => item.id === tournamentId);
  const registration = tournament?.registrations.find((item) => item.id === registrationId);
  if (!tournament || !registration) return state;
  if (registration.paymentStatus !== "unpaid" || registration.amountCents <= 0 || registration.stripePaymentIntentId) return state;
  if (!state.organization.stripeConnectAccountId || !state.organization.stripeOnboardingComplete) return state;
  try {
    const stripe = getStripeClient();
    const { totalChargedCents, platformFeeCents } = computeFeeSplit(registration.amountCents, state.organization.feeMode);
    const intent = await stripe.paymentIntents.create({
      amount: totalChargedCents, currency: "usd",
      transfer_data: { destination: state.organization.stripeConnectAccountId },
      application_fee_amount: platformFeeCents,
      metadata: { orgId, tournamentId, registrationId },
    });
    const next = await mutateWorkspace(supabase, orgId, (current) => applyCommand(current, { type: "record_payment_intent", tournamentId, registrationId, paymentIntentId: intent.id, platformFeeCents, totalChargedCents }, { now: new Date().toISOString(), id: randomUUID }));
    await sendPaymentRequestEmail({
      to: registration.coachEmail, replyTo: next.organization.replyToEmail || null, teamName: registration.teamName,
      tournamentName: tournament.name, amountCents: totalChargedCents, payUrl: `${origin}/${next.organization.slug}/${tournament.slug}/pay/${registration.id}`,
    });
    return next;
  } catch (error) {
    console.error("Payment request failed", error instanceof Error ? error.name : "Unknown error");
    return state;
  }
}
