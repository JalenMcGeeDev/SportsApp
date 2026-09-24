import { estimateCapacity } from "./src/scheduling/index.ts";

function run(extraCourtsOnBigVenue: number) {
  return estimateCapacity({
    sport: "basketball",
    startsOn: "2026-10-09",
    endsOn: "2026-10-11",
    timezone: "America/New_York",
    venues: [
      { name: "Neal Middle", address: "Neal Address", playAreas: [{ name: "Court 1" }] },
      { name: "Hillside High", address: "Hillside Addy", playAreas: [{ name: "Court 1" }, { name: "Court 2" }] },
      { name: "Shepard Middle", address: "Shepard Addy", playAreas: Array.from({ length: 10 + extraCourtsOnBigVenue }, (_, i) => ({ name: `Court ${i + 1}` })) },
      { name: "Roghers Herr MIddle", address: "RH Addy", playAreas: Array.from({ length: 10 }, (_, i) => ({ name: `Court ${i + 1}` })) },
    ],
    divisions: [
      { name: "Main Division", format: "pool_to_bracket", maxTeams: 16, guaranteedGames: 3, advancePerPool: 6, earliestTime: "08:00", latestTime: "20:00" },
    ],
    rules: { gameMinutes: 40, bufferMinutes: 10, restMinutes: 30, maxGamesPerDay: 4 },
  });
}

for (const extra of [0, 1, 5, 20, 100]) {
  const result = run(extra);
  console.log(`extraCourts=${extra} fieldCount=${result.fieldCount} totalGames=${result.totalGames} unplaced=${result.issues[0]?.unplacedCount ?? 0} feasible=${result.feasible}`);
}
