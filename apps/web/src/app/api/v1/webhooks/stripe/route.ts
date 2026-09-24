import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { applyCommand } from "@season/core";
import { mutateWorkspace } from "@season/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeClient } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * All Stripe webhooks: signature-verified, and idempotent via `stripe_webhook_events` (checked
 * before processing, recorded only after processing succeeds, so a failed attempt can still be
 * retried by Stripe instead of being silently swallowed as a false "replay").
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) { console.error("STRIPE_WEBHOOK_SECRET is not configured"); return NextResponse.json({ error: "Webhook not configured" }, { status: 500 }); }
  const signature = request.headers.get("stripe-signature");
  const body = await request.text();
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  const stripe = getStripeClient();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, secret);
  } catch (error) {
    console.error("Stripe webhook signature verification failed", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: seen } = await admin.from("stripe_webhook_events").select("id").eq("id", event.id).maybeSingle();
  if (seen) return NextResponse.json({ received: true, replay: true });

  try {
    switch (event.type) {
      case "account.updated": {
        const account = event.data.object as Stripe.Account;
        const complete = !!(account.charges_enabled && account.payouts_enabled && account.details_submitted);
        const { data: org } = await admin.from("organizations").select("id").eq("stripe_connect_account_id", account.id).maybeSingle();
        if (org) {
          await admin.from("organizations").update({ stripe_onboarding_complete: complete }).eq("id", org.id);
          await mutateWorkspace(admin, org.id, (state) => applyCommand(state, { type: "update_stripe_onboarding", complete }, { now: new Date().toISOString(), id: randomUUID }));
        }
        break;
      }
      case "payment_intent.succeeded":
      case "payment_intent.payment_failed":
      case "payment_intent.processing": {
        const intent = event.data.object as Stripe.PaymentIntent;
        const { orgId, tournamentId, registrationId } = intent.metadata;
        if (orgId && tournamentId && registrationId) {
          const status = event.type === "payment_intent.succeeded" ? "paid" : event.type === "payment_intent.processing" ? "processing" : "failed";
          await mutateWorkspace(admin, orgId, (state) => applyCommand(state, { type: "record_payment_status", tournamentId, registrationId, paymentIntentId: intent.id, status }, { now: new Date().toISOString(), id: randomUUID }));
        }
        break;
      }
      case "invoice.paid":
      case "invoice.payment_failed":
      case "invoice.voided": {
        const invoiceEvent = event.data.object as Stripe.Invoice;
        const { orgId, tournamentId, registrationId } = invoiceEvent.metadata ?? {};
        if (orgId && tournamentId && registrationId && invoiceEvent.id) {
          const status = event.type === "invoice.paid" ? "paid" : event.type === "invoice.voided" ? "voided" : "failed";
          let paymentIntentId: string | null = null;
          if (status === "paid") {
            const full = await stripe.invoices.retrieve(invoiceEvent.id, { expand: ["payments.data.payment.payment_intent"] });
            const payment = full.payments?.data[0]?.payment;
            paymentIntentId = payment?.type === "payment_intent" && payment.payment_intent ? (typeof payment.payment_intent === "string" ? payment.payment_intent : payment.payment_intent.id) : null;
          }
          await mutateWorkspace(admin, orgId, (state) => applyCommand(state, { type: "record_invoice_status", tournamentId, registrationId, stripeInvoiceId: invoiceEvent.id!, status, paymentIntentId }, { now: new Date().toISOString(), id: randomUUID }));
        }
        break;
      }
      default:
        break;
    }
  } catch (error) {
    console.error("Stripe webhook processing failed", event.type, error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  await admin.from("stripe_webhook_events").insert({ id: event.id, type: event.type });
  return NextResponse.json({ received: true });
}
