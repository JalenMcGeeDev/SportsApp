import type { SupabaseClient } from "@supabase/supabase-js";
import { DomainError } from "@season/core";
import { createClient } from "./supabase/server";

export type OrgRole = "org_owner" | "org_admin" | "org_staff";

export type OrgMembership = {
  supabase: SupabaseClient;
  userId: string;
  orgId: string;
  role: OrgRole;
};

/** Resolves the signed-in user's organization for this request. One org per user for now. */
export async function requireOrgMembership(): Promise<OrgMembership> {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new DomainError("Sign in to continue.", 401);
  const { data: membership, error } = await supabase
    .from("organization_members")
    .select("org_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (error || !membership) throw new DomainError("No organization found for this account.", 403);
  return { supabase, userId: user.id, orgId: membership.org_id as string, role: membership.role as OrgRole };
}
