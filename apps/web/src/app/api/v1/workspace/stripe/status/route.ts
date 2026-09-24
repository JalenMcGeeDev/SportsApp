import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { applyCommand, DomainError } from "@season/core";
import { mutateWorkspace, readWorkspace } from "@season/data";
import { requireOrgMembership } from "@/lib/org";
import { isSameOrigin } from "@/lib/origin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeClient } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(error: unknown) {
  if (error instanceof DomainError) return NextResponse.json({ error: error.message, details: error.details }, { status: error.status });
  console.error("Stripe status sync failed", error instanceof Error ? error.name : "Unknown error");
  return NextResponse.json({ error: "Unable to refresh Stripe status. Please try again." }, { status: 500 });
}

// Called when the browser returns from Stripe's hosted onboarding, in case the account.updated
// webhook hasn't arrived yet. Re-checks the connected account directly with Stripe.
export async function POST(request: NextRequest) {
  try {
    if (!isSameOrigin(request)) throw new DomainError("Invalid request origin", 403);
    const { supabase, orgId } = await requireOrgMembership();
    const workspace = await readWorkspace(supabase, orgId);
    const accountId = workspace.organization.stripeConnectAccountId;
    if (!accountId) return NextResponse.json(workspace, { headers: { "Cache-Control": "private, no-store" } });
    const stripe = getStripeClient();
    const account = await stripe.accounts.retrieve(accountId);
    const complete = !!(account.charges_enabled && account.payouts_enabled && account.details_submitted);
    await createAdminClient().from("organizations").update({ stripe_onboarding_complete: complete }).eq("id", orgId);
    const state = await mutateWorkspace(supabase, orgId, (current) => applyCommand(current, { type: "update_stripe_onboarding", complete }, { now: new Date().toISOString(), id: randomUUID }));
    return NextResponse.json(state, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return fail(error); }
}
