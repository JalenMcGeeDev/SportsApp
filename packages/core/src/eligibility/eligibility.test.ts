import { describe, expect, it } from "vitest";
import { dateSchema, type EligibilityRules, type Player } from "@season/types";
import { checkEligibility } from "./index";

const rules: EligibilityRules = { earliestBirthdate: "2014-01-01", latestBirthdate: "2015-12-31", rosterMin: 1, rosterMax: 12, requiredDocuments: ["age_verification"], waiverVersion: 2 };
const player: Player = { id: "player-1", firstName: "Test", lastName: "Player", birthdate: "2014-01-01", jerseyNumber: "4", documents: [{ id: "doc-1", type: "age_verification", status: "approved" }], waiverVersion: 2 };

describe("roster approval", () => {
  it("accepts a compliant roster at inclusive age boundaries", () => {
    expect(checkEligibility([player], rules).approved).toBe(true);
    expect(checkEligibility([{ ...player, birthdate: rules.latestBirthdate }], rules).approved).toBe(true);
  });
  it("names the player and each unmet requirement", () => {
    const result = checkEligibility([{ ...player, birthdate: "2013-12-31", documents: [], waiverVersion: 1 }], rules);
    expect(result.approved).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(["age_range", "document", "waiver"]);
    expect(result.issues.every((issue) => issue.playerName === "Test Player")).toBe(true);
  });
  it("rejects pending documents and empty or oversized rosters", () => {
    expect(checkEligibility([{ ...player, documents: [{ id: "doc-1", type: "age_verification", status: "pending" }] }], rules).approved).toBe(false);
    expect(checkEligibility([], rules).issues[0]?.code).toBe("roster_size");
    expect(checkEligibility(Array.from({ length: 13 }, () => player), rules).approved).toBe(false);
  });
  it("rejects nonexistent calendar dates", () => {
    expect(dateSchema.safeParse("2014-02-30").success).toBe(false);
    expect(dateSchema.safeParse("2016-02-29").success).toBe(true);
  });
});