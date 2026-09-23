import type { Division, Game, Registration, Source } from "@season/types";

export function makeGame(id: string, divisionId: string, homeSource: Source, awaySource: Source, values: Partial<Game> = {}): Game {
  return { id, divisionId, homeSource, awaySource, homeId: homeSource.kind === "team" ? homeSource.registrationId : null, awayId: awaySource.kind === "team" ? awaySource.registrationId : null, pool: null, round: 1, label: "Game", bracket: "championship", fieldId: null, start: null, end: null, status: "unscheduled", homeScore: null, awayScore: null, winnerId: null, version: 0, needsResolution: false, ifNecessary: false, disciplineHome: 0, disciplineAway: 0, ...values };
}

export function roundRobin(ids: string[], divisionId: string, pool = "A"): Game[] {
  const rotation: (string | null)[] = [...ids];
  if (rotation.length % 2) rotation.push(null);
  const games: Game[] = [];
  for (let round = 0; round < rotation.length - 1; round++) {
    for (let index = 0; index < rotation.length / 2; index++) {
      const homeId = rotation[index];
      const awayId = rotation[rotation.length - index - 1];
      if (homeId && awayId) games.push(makeGame(`${divisionId}-${pool}-${round}-${index}`, divisionId, { kind: "team", registrationId: homeId }, { kind: "team", registrationId: awayId }, { pool, round: round + 1, bracket: "pool", label: `Pool ${pool} - round ${round + 1}` }));
    }
    rotation.splice(1, 0, rotation.pop()!);
  }
  return games;
}

export function elimination(sources: Source[], divisionId: string, double = false): Game[] {
  if (sources.length < 2) return [];
  const size = 2 ** Math.ceil(Math.log2(sources.length));
  let seeds = [1, 2];
  for (let count = 4; count <= size; count *= 2) seeds = seeds.flatMap((seed) => [seed, count + 1 - seed]);
  let inputs = seeds.map((seed): Source => sources[seed - 1] ?? { kind: "bye" });
  const games: Game[] = [];
  const rounds: Game[][] = [];
  let round = 1;
  while (inputs.length > 1) {
    const current: Game[] = [];
    for (let index = 0; index < inputs.length; index += 2) {
      const game = makeGame(`${divisionId}-W${round}-${index / 2}`, divisionId, inputs[index]!, inputs[index + 1]!, { round, label: inputs.length === 2 ? "Championship" : inputs.length === 4 ? "Semifinal" : `Round ${round}` });
      current.push(game);
      games.push(game);
    }
    rounds.push(current);
    inputs = current.map((game) => ({ kind: "winner", gameId: game.id }));
    round++;
  }
  if (double) {
    let losers: Source[] = rounds[0]!.map((game) => ({ kind: "loser", gameId: game.id }));
    let loserRound = 1;
    const play = (pairs: [Source, Source][]) => pairs.map(([home, away], index): Source => {
      const game = makeGame(`${divisionId}-L${loserRound}-${index}`, divisionId, home, away, { bracket: "losers", round: loserRound, label: `Losers round ${loserRound}` });
      games.push(game);
      return { kind: "winner", gameId: game.id };
    });
    for (let index = 1; index < rounds.length; index++) {
      const pairs: [Source, Source][] = [];
      for (let offset = 0; offset < losers.length; offset += 2) pairs.push([losers[offset]!, losers[offset + 1]!]);
      losers = play(pairs);
      loserRound++;
      const drops = rounds[index]!.map((game): Source => ({ kind: "loser", gameId: game.id })).reverse();
      losers = play(losers.map((source, offset) => [source, drops[offset]!]));
      loserRound++;
    }
    const final = makeGame(`${divisionId}-GF`, divisionId, inputs[0]!, losers[0]!, { round, label: "Grand final" });
    games.push(final, makeGame(`${divisionId}-RESET`, divisionId, { kind: "winner", gameId: final.id }, { kind: "loser", gameId: final.id }, { round: round + 1, label: "If-necessary final", ifNecessary: true }));
  }
  return resolveBracket(games).games;
}

export function generateCompetition(division: Division, registrations: Registration[]): Game[] {
  const teams = registrations.filter((team) => team.divisionId === division.id && team.status === "accepted").sort((left, right) => left.seed - right.seed || left.id.localeCompare(right.id));
  if (teams.length < 2) throw new Error(`${division.name} needs at least two accepted teams.`);
  if (division.format === "single_elim" || division.format === "double_elim") {
    if (division.guaranteedGames > (division.format === "single_elim" ? 1 : 2)) throw new Error("The selected elimination format cannot satisfy the game guarantee.");
    return elimination(teams.map((team) => ({ kind: "team", registrationId: team.id })), division.id, division.format === "double_elim");
  }
  const pools = division.format === "round_robin" ? ["A"] : [...new Set(teams.map((team) => team.pool || "A"))].sort();
  const games = pools.flatMap((pool) => {
    const members = division.format === "round_robin" ? teams : teams.filter((team) => (team.pool || "A") === pool);
    if (members.length - 1 < division.guaranteedGames) throw new Error(`Pool ${pool} needs at least ${division.guaranteedGames + 1} teams for the ${division.guaranteedGames}-game guarantee.`);
    return roundRobin(members.map((team) => team.id), division.id, pool);
  });
  if (division.format === "pool_to_bracket") {
    const seeds: Source[] = [];
    for (let rank = 1; rank <= division.advancePerPool; rank++) {
      for (const pool of rank % 2 ? pools : [...pools].reverse()) seeds.push({ kind: "pool", pool, rank });
    }
    games.push(...elimination(seeds, division.id));
  }
  return games;
}

export function resolveBracket(input: Game[], poolRanks: Record<string, string[]> = {}) {
  const games = input.map((game) => ({ ...game }));
  const byId = new Map(games.map((game) => [game.id, game]));
  const flagged = new Set<string>();
  const read = (source: Source): { id: string | null; resolved: boolean } => {
    if (source.kind === "bye") return { id: null, resolved: true };
    if (source.kind === "team") return { id: source.registrationId, resolved: true };
    if (source.kind === "pool") { const id = poolRanks[source.pool]?.[source.rank - 1] ?? null; return { id, resolved: id !== null }; }
    const feeder = byId.get(source.gameId);
    if (!feeder || feeder.needsResolution || !["final", "forfeit", "bye"].includes(feeder.status)) return { id: null, resolved: false };
    return { id: source.kind === "winner" ? feeder.winnerId : feeder.status === "bye" ? null : feeder.homeId === feeder.winnerId ? feeder.awayId : feeder.homeId, resolved: true };
  };
  for (let pass = 0; pass < games.length; pass++) {
    let changed = false;
    for (const game of games) {
      const home = read(game.homeSource);
      const away = read(game.awaySource);
      if (game.ifNecessary && game.homeSource.kind === "winner") {
        const final = byId.get(game.homeSource.gameId);
        if (final?.winnerId && final.winnerId === final.homeId && !final.needsResolution) {
          if (["final", "forfeit", "in_progress"].includes(game.status)) { game.needsResolution = true; flagged.add(game.id); }
          else game.status = "cancelled";
          continue;
        }
        if (game.status === "cancelled") game.status = game.start ? "scheduled" : "unscheduled";
      }
      if (game.homeId !== home.id || game.awayId !== away.id) {
        changed = true;
        if (["final", "forfeit", "in_progress"].includes(game.status)) {
          if (!game.needsResolution) { game.needsResolution = true; game.version++; }
          flagged.add(game.id);
          continue;
        }
        game.homeId = home.id;
        game.awayId = away.id;
        game.version++;
      }
      if (home.resolved && away.resolved && (!home.id || !away.id) && game.status !== "bye") {
        game.status = "bye";
        game.winnerId = home.id ?? away.id;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return { games, flagged: [...flagged] };
}