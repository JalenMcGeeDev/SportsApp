import { NextRequest, NextResponse } from "next/server";
import { DomainError } from "@season/core";
import { readWorkspace } from "@season/data";
import { registrationEmailInputSchema } from "@season/types";
import { requireOrgMembership } from "@/lib/org";
import { isSameOrigin } from "@/lib/origin-guard";
import { sendRegistrationDecisionEmail } from "@/lib/email";

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
  console.error("Registration email request failed", error instanceof Error ? error.name : "Unknown error");
  return NextResponse.json({ error: "Unable to send the email. Please try again." }, { status: 500 });
}

export async function POST(request: NextRequest) {
  try {
    if (!isSameOrigin(request)) throw new DomainError("Invalid request origin", 403);
    const { supabase, orgId, userId } = await requireOrgMembership();
    rateLimit(userId);
    const raw = await request.text();
    if (raw.length > 10_000) throw new DomainError("Request is too large", 413);
    let json: unknown;
    try { json = JSON.parse(raw); } catch { throw new DomainError("Invalid JSON request", 400); }
    const parsed = registrationEmailInputSchema.safeParse(json);
    if (!parsed.success) throw new DomainError("Check the highlighted information and try again.", 422, parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`));
    const workspace = await readWorkspace(supabase, orgId);
    const tournament = workspace.tournaments.find((item) => item.id === parsed.data.tournamentId);
    const registration = tournament?.registrations.find((item) => item.id === parsed.data.registrationId);
    if (!tournament || !registration) throw new DomainError("Team registration not found", 404);
    await sendRegistrationDecisionEmail({ to: registration.coachEmail, replyTo: workspace.organization.replyToEmail || null, subject: parsed.data.subject, body: parsed.data.body });
    return NextResponse.json({ ok: true });
  } catch (error) { return fail(error); }
}
