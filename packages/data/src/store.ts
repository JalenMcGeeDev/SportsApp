import type { SupabaseClient } from "@supabase/supabase-js";
import { workspaceSchema, type Workspace } from "@season/types";
import { DomainError } from "@season/core";

/**
 * Persists one JSONB `Workspace` blob per organization in Postgres (table
 * `workspaces`, RLS-gated by org membership). The `revision` column doubles
 * as an optimistic-concurrency token: mutateWorkspace does a compare-and-swap
 * UPDATE, so no client-side locking is needed (replaces the old file lock).
 */
export async function readWorkspace(supabase: SupabaseClient, orgId: string): Promise<Workspace> {
  const { data, error } = await supabase.from("workspaces").select("data").eq("org_id", orgId).single();
  if (error || !data) throw new DomainError("Workspace not found for this organization.", 404);
  return workspaceSchema.parse(data.data);
}

export async function mutateWorkspace(supabase: SupabaseClient, orgId: string, mutate: (state: Workspace) => Workspace | Promise<Workspace>): Promise<Workspace> {
  const current = await readWorkspace(supabase, orgId);
  const baseRevision = current.revision; // capture before `mutate` runs, since some callbacks mutate `current` in place
  const next = workspaceSchema.parse(await mutate(current));
  const { data, error } = await supabase
    .from("workspaces")
    .update({ data: next, revision: next.revision, updated_at: new Date().toISOString() })
    .eq("org_id", orgId)
    .eq("revision", baseRevision)
    .select("data")
    .single();
  if (error || !data) throw new DomainError("This workspace changed elsewhere. Refresh and retry.", 409);
  return workspaceSchema.parse(data.data);
}

