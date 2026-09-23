import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { applyCommand, DomainError } from "@season/core";
import { mutateWorkspace, readWorkspace } from "@season/data";
import { mutationSchema } from "@season/types";
import { requireOrgMembership } from "@/lib/org";
import { isSameOrigin } from "@/lib/origin-guard";

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
    const { supabase, orgId, userId } = await requireOrgMembership();
    rateLimit(userId);
    const raw = await request.text();
    if (raw.length > 100_000) throw new DomainError("Request is too large", 413);
    let json: unknown;
    try { json = JSON.parse(raw); } catch { throw new DomainError("Invalid JSON request", 400); }
    const parsed = mutationSchema.safeParse(json);
    if (!parsed.success) throw new DomainError("Check the highlighted information and try again.", 422, parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`));
    const state = await mutateWorkspace(supabase, orgId, (state) => {
      if (state.revision !== parsed.data.revision) throw new DomainError("This workspace changed in another window. Refresh and retry.", 409);
      return applyCommand(state, parsed.data.command, { now: new Date().toISOString(), id: randomUUID });
    });
    return NextResponse.json(state, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return fail(error); }
}