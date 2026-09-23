import { notFound } from "next/navigation";
import { computeStandings, publicTournament } from "@season/core";
import type { Tournament, Workspace } from "@season/types";
import { workspaceSchema } from "@season/types";
import { createAdminClient } from "./supabase/admin";

/**
 * Public tournament pages are anonymous, so this reads with the service-role
 * client (bypassing RLS) and relies entirely on publicTournament/publicCompetition
 * below to strip private fields before anything reaches the response.
 */
export async function publicWorkspace(organization: string): Promise<Workspace> {
  const supabase = createAdminClient();
  const { data: org } = await supabase.from("organizations").select("id").eq("slug", organization).maybeSingle();
  if (!org) notFound();
  const { data: row } = await supabase.from("workspaces").select("data").eq("org_id", org.id).maybeSingle();
  if (!row) notFound();
  return workspaceSchema.parse(row.data);
}


export function publicCompetition(tournament: Tournament) {
  const competition = publicTournament(tournament);
  return {
    ...competition,
    standings: competition.divisions.flatMap((division) => {
      const teams = competition.teams.filter((team) => team.divisionId === division.id);
      return [...new Set(teams.map((team) => team.pool))].map((pool) => ({
        divisionId: division.id, pool,
        rows: computeStandings(teams.filter((team) => team.pool === pool).map((team) => team.id), competition.games.filter((game) => game.divisionId === division.id && game.pool === pool && game.bracket === "pool"), tournament.rules),
      }));
    }),
  };
}

export type PublicCompetition = ReturnType<typeof publicCompetition>;