import { NextResponse } from "next/server";
import { notFound } from "next/navigation";
import { readWorkspace } from "@season/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeClient } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public, unauthenticated: lets a coach load the payment page for their own registration.
// Only exposes what's needed to render the embedded Payment Element, nothing else.
export async function GET(_request: Request, { params }: { params: Promise<{ organization: string; tournament: string; registration: string }> }) {
  const { organization, tournament: slug, registration: registrationId } = await params;
  const supabase = createAdminClient();
  const { data: org } = await supabase.from("organizations").select("id").eq("slug", organization).maybeSingle();
  if (!org) notFound();
  const workspace = await readWorkspace(supabase, org.id);
  const tournament = workspace.tournaments.find((item) => item.slug === slug);
  const registration = tournament?.registrations.find((item) => item.id === registrationId);
  if (!tournament || !registration) notFound();
  const division = tournament.divisions.find((item) => item.id === registration.divisionId);
  const base = { teamName: registration.teamName, tournamentName: tournament.name, divisionName: division?.name ?? "", amountCents: registration.amountCents, paymentStatus: registration.paymentStatus };
  if (registration.paymentStatus !== "unpaid" && registration.paymentStatus !== "processing") return NextResponse.json({ ...base, clientSecret: null });
  if (!registration.stripePaymentIntentId) return NextResponse.json({ ...base, clientSecret: null });
  const stripe = getStripeClient();
  const intent = await stripe.paymentIntents.retrieve(registration.stripePaymentIntentId);
  return NextResponse.json({ ...base, clientSecret: intent.client_secret });
}

