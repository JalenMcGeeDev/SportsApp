import { describe, expect, it } from "vitest";
import { elimination, makeGame, resolveBracket, roundRobin } from "./index";
import { computeStandings } from "../standings/index";
import type { Rules } from "@season/types";

const rules: Rules = { gameMinutes: 40, bufferMinutes: 10, restMinutes: 30, maxGamesPerDay: 4, winPoints: 3, tiePoints: 1, lossPoints: 0, forfeitPoints: 3, shutoutPoints: 0, differentialCap: 5, tiebreakers: ["head_to_head", "difference", "against", "coin_flip"] };

describe("competition engines", () => {
  it.each([3, 4, 7, 8, 16])("round robin covers every pair exactly once for %i teams", (count) => {
    const ids = Array.from({ length: count }, (_, index) => `team-${index}`);
    const games = roundRobin(ids, "division");
    expect(games).toHaveLength(count * (count - 1) / 2);
    expect(new Set(games.map((game) => [game.homeId, game.awayId].sort().join(":"))).size).toBe(games.length);
  });
  it("awards byes to top seeds and preserves distinct semifinal paths", () => {
    const games = elimination(["1", "2", "3", "4", "5"].map((registrationId) => ({ kind: "team", registrationId })), "division");
    expect(games.filter((game) => game.status === "bye").map((game) => game.winnerId).sort()).toEqual(["1", "2", "3"]);
    expect(games.filter((game) => game.status !== "bye")).toHaveLength(4);
  });
  it.each([2, 3, 4, 5, 8])("double elimination grants two losses with %i teams", (count) => {
    let games = elimination(Array.from({ length: count }, (_, index) => ({ kind: "team" as const, registrationId: `${index + 1}` })), "division", true);
    const losses = new Map<string, number>();
    for (let iteration = 0; iteration < games.length * 2; iteration++) {
      const ready = games.find((game) => game.status === "unscheduled" && game.homeId && game.awayId);
      if (!ready) break;
      ready.status = "final";
      ready.homeScore = 1;
      ready.awayScore = 0;
      ready.winnerId = ready.homeId;
      losses.set(ready.awayId!, (losses.get(ready.awayId!) ?? 0) + 1);
      games = resolveBracket(games).games;
    }
    expect([...losses.values()].every((losses) => losses === 2)).toBe(true);
    expect(losses.size).toBe(count - 1);
  });
  it("flags played downstream games after correcting a semifinal", () => {
    let games = elimination(["1", "2", "3", "4"].map((registrationId) => ({ kind: "team", registrationId })), "division");
    for (const game of games.filter((game) => game.round === 1)) { game.status = "final"; game.homeScore = 2; game.awayScore = 0; game.winnerId = game.homeId; }
    games = resolveBracket(games).games;
    const final = games.find((game) => game.round === 2)!;
    final.status = "final"; final.homeScore = 1; final.awayScore = 0; final.winnerId = final.homeId;
    games[0]!.winnerId = games[0]!.awayId;
    expect(resolveBracket(games).flagged).toEqual([final.id]);
    expect(resolveBracket(games).games.find((game) => game.id === final.id)?.homeId).toBe(final.homeId);
  });
  it("resolves a three-way tie using capped differential and reproducible traces", () => {
    const games = [["A", "B", 9, 0], ["B", "C", 2, 0], ["C", "A", 1, 0]].map(([home, away, homeScore, awayScore], index) => makeGame(`g${index}`, "division", { kind: "team", registrationId: String(home) }, { kind: "team", registrationId: String(away) }, { status: "final", homeScore: Number(homeScore), awayScore: Number(awayScore) }));
    const standings = computeStandings(["A", "B", "C"], games, rules);
    expect(standings.map((row) => row.registrationId)).toEqual(["A", "C", "B"]);
    expect(standings[0]?.difference).toBe(4);
    expect(standings[0]?.trace.join(" ")).toContain("difference");
    expect(computeStandings(["A", "B", "C"], games, rules)).toEqual(standings);
  });
});