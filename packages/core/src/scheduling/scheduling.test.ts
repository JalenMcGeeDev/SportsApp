import { describe, expect, it } from "vitest";
import { changedRegistrations, estimateCapacity, generateSchedule, localParts, validateSchedule, type ScheduleInput } from "./index";
import { roundRobin } from "../brackets/index";
import type { Division, Registration } from "@season/types";

const division: Division = { id: "u12", name: "U12", format: "round_robin", maxTeams: 8, guaranteedGames: 3, advancePerPool: 2, entryFeeCents: 45000, earliestTime: "08:00", latestTime: "18:00", eligibility: { earliestBirthdate: "2014-01-01", latestBirthdate: "2015-12-31", rosterMin: 7, rosterMax: 15, requiredDocuments: ["age_verification"], waiverVersion: 1 } };
const input: ScheduleInput = {
  games: roundRobin(["A", "B", "C", "D"], division.id), registrations: [], divisions: [division], sport: "soccer", timezone: "America/Chicago",
  fields: ["f1", "f2"].map((id) => ({ id, name: id, venue: "Park", address: "100 Park Ave", sports: ["soccer"], windows: [{ start: "2026-09-26T13:00:00.000Z", end: "2026-09-26T23:00:00.000Z", blackout: false }] })),
  rules: { gameMinutes: 40, bufferMinutes: 10, restMinutes: 30, maxGamesPerDay: 4, winPoints: 3, tiePoints: 1, lossPoints: 0, forfeitPoints: 3, shutoutPoints: 0, differentialCap: 5, tiebreakers: ["difference", "coin_flip"] },
};

describe("scheduling", () => {
  it("is seeded, repeatable, and passes the independent validator", () => {
    const result = generateSchedule(input, 42);
    expect(result.unplaced).toEqual([]);
    expect(validateSchedule({ ...input, games: result.games })).toEqual([]);
    expect(generateSchedule(input, 42)).toEqual(result);
  });
  it("reports infeasibility instead of placing conflicting games", () => {
    const constrained = { ...input, rules: { ...input.rules, maxGamesPerDay: 1 } };
    const result = generateSchedule(constrained, 42);
    expect(result.unplaced.length).toBeGreaterThan(0);
    expect(validateSchedule({ ...constrained, games: result.games })).toEqual([]);
  });
  it("blocks overlapping games, blackouts, and unsupported fields", () => {
    const games = generateSchedule(input, 1).games;
    games[1] = { ...games[1]!, start: games[0]!.start, end: games[0]!.end, fieldId: games[0]!.fieldId };
    expect(validateSchedule({ ...input, games }).some((issue) => issue.code === "field_conflict" && issue.conflictingGameId)).toBe(true);
    expect(generateSchedule({ ...input, sport: "basketball" }, 1).unplaced.length).toBe(input.games.length);
    const fields = input.fields.map((field) => ({ ...field, windows: [...field.windows, { ...field.windows[0]!, blackout: true }] }));
    expect(generateSchedule({ ...input, fields }, 1).unplaced.length).toBe(input.games.length);
  });
  it("uses tournament local dates, including daylight saving transitions", () => {
    expect(localParts("2026-09-27T01:00:00Z", "America/Chicago")).toEqual({ date: "2026-09-26", clock: "20:00" });
    expect(localParts("2026-11-01T07:30:00Z", "America/Chicago").clock).toBe("01:30");
  });
  it("deduplicates changes and does not notify unaffected teams", () => {
    const before = generateSchedule(input, 42).games;
    const after = before.map((game, index) => index === 0 ? { ...game, fieldId: "different" } : game);
    expect(changedRegistrations(before, before)).toEqual([]);
    expect(changedRegistrations(before, after)).toEqual([before[0]!.homeId!, before[0]!.awayId!].sort());
  });
  it("schedules 1,000 teams across 250 divisions", () => {
    const divisions = Array.from({ length: 250 }, (_, index) => ({ ...division, id: `division-${index}` }));
    const games = divisions.flatMap((division) => roundRobin(Array.from({ length: 4 }, (_, index) => `${division.id}-team-${index}`), division.id));
    const fields = Array.from({ length: 100 }, (_, index) => ({ ...input.fields[0]!, id: `field-${index}`, windows: [...input.fields[0]!.windows, { start: "2026-09-27T13:00:00.000Z", end: "2026-09-27T23:00:00.000Z", blackout: false }] }));
    const large = { ...input, divisions, games, fields, registrations: [] as Registration[] };
    const result = generateSchedule(large, 42);
    expect(result.unplaced).toEqual([]);
    expect(validateSchedule({ ...large, games: result.games })).toEqual([]);
  }, 300_000);
});

describe("estimateCapacity", () => {
  const capacityInput = {
    sport: "soccer", startsOn: "2026-09-26", endsOn: "2026-09-27", timezone: "America/Chicago",
    venues: [{ name: "Park", address: "100 Park Ave", playAreas: [{ name: "Field 1" }, { name: "Field 2" }] }],
    rules: { gameMinutes: 40, bufferMinutes: 10, restMinutes: 30, maxGamesPerDay: 4 },
    divisions: [{ name: "U12", format: "round_robin", maxTeams: 4, guaranteedGames: 3, advancePerPool: 2, earliestTime: "08:00", latestTime: "18:00" }],
  };
  it("passes when every division fits at maximum capacity", () => {
    const result = estimateCapacity(capacityInput);
    expect(result.feasible).toBe(true);
    expect(result.setupErrors).toEqual([]);
    expect(result.issues).toEqual([]);
    expect(result.totalGames).toBeGreaterThan(0);
  });
  it("reports unplaced games when capacity is too tight, and confirms whether a field fixes it", () => {
    const tight = { ...capacityInput, venues: [{ name: "Park", address: "100 Park Ave", playAreas: [{ name: "Field 1" }] }], divisions: [{ ...capacityInput.divisions[0]!, maxTeams: 12 }] };
    const result = estimateCapacity(tight);
    expect(result.feasible).toBe(false);
    expect(result.issues).toEqual([{ divisionIndex: 0, divisionName: "U12", maxTeams: 12, unplacedCount: expect.any(Number), totalGames: expect.any(Number) }]);
    expect(typeof result.resolvedByExtraField).toBe("boolean");
  });
  it("surfaces division setup errors instead of throwing", () => {
    const invalid = { ...capacityInput, divisions: [{ ...capacityInput.divisions[0]!, format: "single_elim", guaranteedGames: 3 }] };
    const result = estimateCapacity(invalid);
    expect(result.feasible).toBe(false);
    expect(result.setupErrors).toEqual([{ divisionIndex: 0, fields: ["guaranteedGames", "format"], message: "U12: a single-elimination bracket can guarantee at most 1 game per team, but \"Guaranteed games\" is set to 3. Lower \"Guaranteed games\" or change this division's format." }]);
  });
});