import { eligibilityRulesSchema, playerSchema, type EligibilityRules, type Player } from "@season/types";

export type EligibilityIssue = { playerId: string | null; playerName: string; code: string; message: string };

export function checkEligibility(players: Player[], input: EligibilityRules) {
  const rules = eligibilityRulesSchema.parse(input);
  const roster = players.map((player) => playerSchema.parse(player));
  const issues: EligibilityIssue[] = [];
  if (roster.length < rules.rosterMin || roster.length > rules.rosterMax) {
    issues.push({ playerId: null, playerName: "Team", code: "roster_size", message: `Roster needs ${rules.rosterMin}-${rules.rosterMax} players; currently ${roster.length}.` });
  }
  for (const player of roster) {
    const playerName = `${player.firstName} ${player.lastName}`;
    const add = (code: string, message: string) => issues.push({ playerId: player.id, playerName, code, message });
    if (player.birthdate < rules.earliestBirthdate || player.birthdate > rules.latestBirthdate) {
      add("age_range", `Birthdate must be between ${rules.earliestBirthdate} and ${rules.latestBirthdate}.`);
    }
    for (const type of rules.requiredDocuments) {
      if (!player.documents.some((document) => document.type === type && document.status === "approved")) {
        add("document", `An approved ${type.replaceAll("_", " ")} is required.`);
      }
    }
    if (player.waiverVersion !== rules.waiverVersion) add("waiver", `A signed version ${rules.waiverVersion} waiver is required.`);
  }
  return { approved: issues.length === 0, issues };
}