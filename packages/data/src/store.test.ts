import { expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Workspace } from "@season/types";
import { mutateWorkspace, readWorkspace } from "./store";

function emptyWorkspace(revision: number): Workspace {
  return {
    revision, mode: "live",
    organization: { name: "Test Org", slug: "test-org", ownerName: "Alex Test", timezone: "UTC", feeMode: "absorb", stripeConnectAccountId: null, stripeOnboardingComplete: false },
    tournaments: [], announcements: [], notifications: [], messages: [], runs: [], inviteJobs: [], audit: [],
  };
}

// Minimal fake mirroring the .from().select().eq().single() / .update().eq().eq().select().single() chain used by store.ts.
function fakeSupabase(initial: { data: unknown; revision: number }) {
  const row = { data: initial.data, revision: initial.revision };
  const client = {
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: { data: row.data }, error: null }) }) }),
      update: (patch: { data: unknown; revision: number }) => ({
        eq: (_column: string, expectedRevision: number) => ({
          eq: () => ({
            single: async () => {
              if (expectedRevision !== row.revision) return { data: null, error: new Error("conflict") };
              row.data = patch.data;
              row.revision = patch.revision;
              return { data: { data: row.data }, error: null };
            },
          }),
        }),
      }),
    }),
  };
  return client as unknown as SupabaseClient;
}

it("reads and atomically updates a workspace row by revision", async () => {
  const supabase = fakeSupabase({ data: emptyWorkspace(0), revision: 0 });
  const first = await readWorkspace(supabase, "org-1");
  expect(first.revision).toBe(0);
  const updated = await mutateWorkspace(supabase, "org-1", (state) => ({ ...state, revision: state.revision + 1 }));
  expect(updated.revision).toBe(1);
});

it("rejects a mutation whose expected revision is stale", async () => {
  const supabase = fakeSupabase({ data: emptyWorkspace(5), revision: 5 });
  await expect(mutateWorkspace(supabase, "org-1", (state) => ({ ...state, revision: 999 }))).rejects.toThrow();
});