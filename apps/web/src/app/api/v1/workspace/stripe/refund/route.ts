import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { applyCommand, DomainError } from "@season/core";
import { mutateWorkspace, readWorkspace } from "@season/data";
import { requireOrgMembership } from "@/lib/org";
import { isSameOrigin } from "@/lib/origin-guard";
import { getStripeClient } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const buckets = new Map<string, { count: number; expires: number }>();
function rateLimit(key: string) {
  const bucket = buckets.get(key);
  if (buckets.size > 1000) for (const [bucketKey, entry] of buckets) if (entry.expires < Date.now()) buckets.delete(bucketKey);
  if (!bucket || bucket.expires < Date.now()) buckets.set(key, { count: 1, expires: Date.now() + 60_000 });
  else if (++bucket.count > 60) throw new DomainError("Too many requests. Please wait a moment.", 429);
}

function fail(error: unknown) {
  if (error instanceof DomainError) return NextResponse.json({ error: error.message, details: error.details }, { status: error.status });
  console.error("Stripe refund request failed", error instanceof Error ? error.name : "Unknown error");
  return NextResponse.json({ error: "Unable to process the refund. Please try again." }, { status: 500 });
}

// Manager-initiated refund, full or partial, any time (no cutoff). The platform's application
// fee is retained by default: reverse_transfer moves exactly the refunded amount back out of
// the connected account's proceeds, but the platform fee itself is not refunded.
export async function POST(request: NextRequest) {
  try {
    if (!isSameOrigin(request)) throw new DomainError("Invalid request origin", 403);
    const { supabase, orgId, userId, role } = await requireOrgMembership();
    if (role === "org_staff") throw new DomainError("Only organization owners and admins can issue refunds.", 403);
    rateLimit(userId);
    const raw = await request.text();
    if (raw.length > 10_000) throw new DomainError("Request is too large", 413);
    let json: unknown;
    try { json = JSON.parse(raw); } catch { throw new DomainError("Invalid JSON request", 400); }
    const { tournamentId, registrationId, amountCents } = json as { tournamentId?: unknown; registrationId?: unknown; amountCents?: unknown };
    if (typeof tournamentId !== "string" || typeof registrationId !== "string" || typeof amountCents !== "number" || !Number.isInteger(amountCents) || amountCents <= 0) {
      throw new DomainError("Check the highlighted information and try again.", 422);
    }
    const workspace = await readWorkspace(supabase, orgId);
    const tournament = workspace.tournaments.find((item) => item.id === tournamentId);
    const registration = tournament?.registrations.find((item) => item.id === registrationId);
    if (!tournament || !registration) throw new DomainError("Team registration not found", 404);
    if (!registration.stripePaymentIntentId) throw new DomainError("This registration has no completed payment to refund.", 422);
    if (amountCents > registration.amountCents - registration.refundedCents) throw new DomainError("Refund amount exceeds the amount paid.", 422);
    const stripe = getStripeClient();
    const refund = await stripe.refunds.create({ payment_intent: registration.stripePaymentIntentId, amount: amountCents, reverse_transfer: true });
    const state = await mutateWorkspace(supabase, orgId, (current) => applyCommand(current, { type: "refund_registration", tournamentId, registrationId, amountCents, stripeRefundId: refund.id }, { now: new Date().toISOString(), id: randomUUID }));
    return NextResponse.json(state, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return fail(error); }
}
