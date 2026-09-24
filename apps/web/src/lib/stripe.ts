import Stripe from "stripe";

let client: Stripe | null = null;

/** Server-only Stripe client. Never import from a Client Component. */
export function getStripeClient(): Stripe {
  if (client) return client;
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error("Stripe is not configured. Set STRIPE_SECRET_KEY.");
  client = new Stripe(secretKey, { apiVersion: "2025-08-27.basil" });
  return client;
}

/** Fixed platform take rate. Not configurable per-org; only how it's applied (feeMode) is. */
export const PLATFORM_FEE_RATE = 0.1;

/**
 * "absorb": the org nets 90% of the listed entry fee; the coach pays exactly the entry fee.
 * "passthrough": the coach pays entry fee + 10%; the org receives the full listed entry fee.
 */
export function computeFeeSplit(entryFeeCents: number, feeMode: "absorb" | "passthrough") {
  const platformFeeCents = Math.round(entryFeeCents * PLATFORM_FEE_RATE);
  const totalChargedCents = feeMode === "passthrough" ? entryFeeCents + platformFeeCents : entryFeeCents;
  return { totalChargedCents, platformFeeCents };
}
