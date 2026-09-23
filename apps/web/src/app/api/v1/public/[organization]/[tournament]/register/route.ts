import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { notFound } from "next/navigation";
import { applyCommand, DomainError } from "@season/core";
import { mutateWorkspace } from "@season/data";
import { registrationSchema } from "@season/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSameOrigin } from "@/lib/origin-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const registrationInput = registrationSchema.pick({ divisionId: true, teamName: true, city: true, coachName: true, coachEmail: true });

// Public, unauthenticated endpoint: rate-limited by IP rather than by user id.
const buckets = new Map<string, { count: number; expires: number }>();
function rateLimit(key: string) {
  const bucket = buckets.get(key);
  if (buckets.size > 1000) for (const [bucketKey, entry] of buckets) if (entry.expires < Date.now()) buckets.delete(bucketKey);
  if (!bucket || bucket.expires < Date.now()) buckets.set(key, { count: 1, expires: Date.now() + 60_000 });
  else if (++bucket.count > 10) throw new DomainError("Too many requests. Please wait a moment.", 429);
}

function fail(error: unknown) {
  if (error instanceof DomainError) return NextResponse.json({ error: error.message, details: error.details }, { status: error.status });
  console.error("Public registration failed", error instanceof Error ? error.name : "Unknown error");
  return NextResponse.json({ error: "Unable to submit registration. Please try again." }, { status: 500 });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ organization: string; tournament: string }> }) {
  try {
    if (!isSameOrigin(request)) throw new DomainError("Invalid request origin", 403);
    rateLimit(request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown");
    const { organization, tournament: slug } = await params;
    const raw = await request.text();
    if (raw.length > 10_000) throw new DomainError("Request is too large", 413);
    let json: unknown;
    try { json = JSON.parse(raw); } catch { throw new DomainError("Invalid JSON request", 400); }
    const parsed = registrationInput.safeParse(json);
    if (!parsed.success) throw new DomainError("Check the highlighted information and try again.", 422, parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`));
    const supabase = createAdminClient();
    const { data: org } = await supabase.from("organizations").select("id").eq("slug", organization).maybeSingle();
    if (!org) notFound();
    const state = await mutateWorkspace(supabase, org.id, (workspace) => {
      const tournament = workspace.tournaments.find((item) => item.slug === slug);
      if (!tournament) throw new DomainError("Tournament not found", 404);
      if (tournament.status !== "registration_open") throw new DomainError("Registration is not open for this tournament.", 409);
      return applyCommand(workspace, { type: "register_team", tournamentId: tournament.id, data: { ...parsed.data, clubName: "" } }, { now: new Date().toISOString(), id: randomUUID });
    });
    const tournament = state.tournaments.find((item) => item.slug === slug);
    const registration = tournament?.registrations.find((item) => item.coachEmail === parsed.data.coachEmail && item.teamName.toLowerCase() === parsed.data.teamName.toLowerCase());
    return NextResponse.json({ status: registration?.status ?? "submitted" });
  } catch (error) { return fail(error); }
}
