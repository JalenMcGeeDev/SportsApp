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
  console.error("Stripe connect request failed", error instanceof Error ? error.name : "Unknown error");
  return NextResponse.json({ error: "Unable to start Stripe onboarding. Please try again." }, { status: 500 });
}

// Creates (or reuses) the organization's Stripe Express connected account, then returns a
// fresh Account Link URL for the browser to redirect to for hosted onboarding.
export async function POST(request: NextRequest) {
  try {
    if (!isSameOrigin(request)) throw new DomainError("Invalid request origin", 403);
    const { supabase, orgId, role } = await requireOrgMembership();
    if (role !== "org_owner") throw new DomainError("Only the organization owner can connect Stripe.", 403);
    const workspace = await readWorkspace(supabase, orgId);
    const stripe = getStripeClient();
    let accountId = workspace.organization.stripeConnectAccountId;
    if (!accountId) {
      const { data: { user } } = await supabase.auth.getUser();
      const account = await stripe.accounts.create({ type: "express", email: user?.email, capabilities: { card_payments: { requested: true }, transfers: { requested: true } } });
      accountId = account.id;
      const admin = createAdminClient();
      const { error: updateError } = await admin.from("organizations").update({ stripe_connect_account_id: accountId }).eq("id", orgId);
      if (updateError) throw new DomainError("That Stripe account is already connected to another organization.", 409);
      await mutateWorkspace(supabase, orgId, (state) => applyCommand(state, { type: "record_stripe_account", stripeConnectAccountId: accountId! }, { now: new Date().toISOString(), id: randomUUID }));
    }
    const origin = request.nextUrl.origin;
    const link = await stripe.accountLinks.create({ account: accountId, type: "account_onboarding", refresh_url: `${origin}/?stripeReturn=1`, return_url: `${origin}/?stripeReturn=1` });
    return NextResponse.json({ url: link.url });
  } catch (error) { return fail(error); }
}
