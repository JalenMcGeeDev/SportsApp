import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { applyCommand, DomainError } from "@season/core";
import { mutateWorkspace, readWorkspace } from "@season/data";
import { requireOrgMembership } from "@/lib/org";
import { isSameOrigin } from "@/lib/origin-guard";
import { computeFeeSplit, getStripeClient } from "@/lib/stripe";

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
  console.error("Stripe invoice request failed", error instanceof Error ? error.name : "Unknown error");
  return NextResponse.json({ error: "Unable to send the invoice. Please try again." }, { status: 500 });
}

// Manager-initiated invoice for a team's outstanding entry fee: creates (or reuses) a Stripe
// customer on the platform account, then a real Stripe Invoice with the same destination-charge
// fee split used for automatic payment requests. Stripe emails the coach a hosted invoice page;
// invoice.paid/voided/payment_failed webhook events update paymentStatus once the coach acts on it.
export async function POST(request: NextRequest) {
  try {
    if (!isSameOrigin(request)) throw new DomainError("Invalid request origin", 403);
    const { supabase, orgId, userId, role } = await requireOrgMembership();
    if (role === "org_staff") throw new DomainError("Only organization owners and admins can send invoices.", 403);
    rateLimit(userId);
    const raw = await request.text();
    if (raw.length > 10_000) throw new DomainError("Request is too large", 413);
    let json: unknown;
    try { json = JSON.parse(raw); } catch { throw new DomainError("Invalid JSON request", 400); }
    const { tournamentId, registrationId } = json as { tournamentId?: unknown; registrationId?: unknown };
    if (typeof tournamentId !== "string" || typeof registrationId !== "string") throw new DomainError("Check the highlighted information and try again.", 422);
    const workspace = await readWorkspace(supabase, orgId);
    const tournament = workspace.tournaments.find((item) => item.id === tournamentId);
    const registration = tournament?.registrations.find((item) => item.id === registrationId);
    if (!tournament || !registration) throw new DomainError("Team registration not found", 404);
    if (!["unpaid", "failed"].includes(registration.paymentStatus) || registration.amountCents <= 0) throw new DomainError("This team doesn't have an outstanding balance to invoice.", 422);
    const accountId = workspace.organization.stripeConnectAccountId;
    if (!accountId || !workspace.organization.stripeOnboardingComplete) throw new DomainError("Connect and finish onboarding with Stripe before sending invoices.", 422);
    const stripe = getStripeClient();
    const { totalChargedCents, platformFeeCents } = computeFeeSplit(registration.amountCents, workspace.organization.feeMode);
    let customerId = registration.stripeCustomerId;
    if (customerId) {
      const existing = await stripe.customers.retrieve(customerId);
      if (existing.deleted) customerId = null;
    }
    if (!customerId) {
      const customer = await stripe.customers.create({ email: registration.coachEmail, name: registration.coachName, metadata: { orgId, tournamentId, registrationId } });
      customerId = customer.id;
    }
    await stripe.invoiceItems.create({ customer: customerId, amount: totalChargedCents, currency: "usd", description: `${tournament.name} - ${registration.teamName} entry fee` });
    const invoice = await stripe.invoices.create({
      customer: customerId, collection_method: "send_invoice", days_until_due: 7,
      application_fee_amount: platformFeeCents, transfer_data: { destination: accountId },
      metadata: { orgId, tournamentId, registrationId },
    });
    if (!invoice.id) throw new DomainError("Unable to create the invoice.", 500);
    await stripe.invoices.finalizeInvoice(invoice.id);
    await stripe.invoices.sendInvoice(invoice.id);
    const state = await mutateWorkspace(supabase, orgId, (current) => applyCommand(current, { type: "record_invoice_sent", tournamentId, registrationId, stripeCustomerId: customerId!, stripeInvoiceId: invoice.id! }, { now: new Date().toISOString(), id: randomUUID }));
    return NextResponse.json(state, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return fail(error); }
}
