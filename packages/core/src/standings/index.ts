import type { Game, Rules } from "@season/types";

export type Standing = { registrationId: string; played: number; wins: number; losses: number; ties: number; points: number; scored: number; conceded: number; difference: number; discipline: number; rank: number; trace: string[]; unresolved: boolean; pointsFormula: string };

export function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function computeStandings(ids: string[], games: Game[], rules: Rules, seed = 42): Standing[] {
  const completed = games.filter((game) => ["final", "forfeit"].includes(game.status) && !game.needsResolution && game.homeId && game.awayId && game.homeScore !== null && game.awayScore !== null);
  const rows = ids.map((registrationId): Standing => {
    const row: Standing = { registrationId, played: 0, wins: 0, losses: 0, ties: 0, points: 0, scored: 0, conceded: 0, difference: 0, discipline: 0, rank: 0, trace: [], unresolved: false, pointsFormula: "" };
    let normalWins = 0;
    let forfeitWins = 0;
    let shutouts = 0;
    for (const game of completed) {
      if (game.homeId !== registrationId && game.awayId !== registrationId) continue;
      const home = game.homeId === registrationId;
      const scored = (home ? game.homeScore : game.awayScore)!;
      const conceded = (home ? game.awayScore : game.homeScore)!;
      row.played++;
      row.scored += scored;
      row.conceded += conceded;
      row.difference += Math.max(-rules.differentialCap, Math.min(rules.differentialCap, scored - conceded));
      row.discipline += home ? game.disciplineHome : game.disciplineAway;
      if (scored > conceded) { row.wins++; game.status === "forfeit" ? forfeitWins++ : normalWins++; row.points += game.status === "forfeit" ? rules.forfeitPoints : rules.winPoints; }
      else if (scored < conceded) { row.losses++; row.points += rules.lossPoints; }
      else { row.ties++; row.points += rules.tiePoints; }
      if (conceded === 0 && scored > 0 && game.status !== "forfeit") { shutouts++; row.points += rules.shutoutPoints; }
    }
    const parts = [
      normalWins && `${normalWins} win${normalWins === 1 ? "" : "s"} \u00d7 ${rules.winPoints} point${rules.winPoints === 1 ? "" : "s"} per win`,
      forfeitWins && `${forfeitWins} forfeit win${forfeitWins === 1 ? "" : "s"} \u00d7 ${rules.forfeitPoints} point${rules.forfeitPoints === 1 ? "" : "s"} per forfeit win`,
      row.ties && `${row.ties} draw${row.ties === 1 ? "" : "s"} \u00d7 ${rules.tiePoints} point${rules.tiePoints === 1 ? "" : "s"} per draw`,
      row.losses && `${row.losses} loss${row.losses === 1 ? "" : "es"} \u00d7 ${rules.lossPoints} point${rules.lossPoints === 1 ? "" : "s"} per loss`,
      shutouts && rules.shutoutPoints && `${shutouts} shutout${shutouts === 1 ? "" : "s"} \u00d7 ${rules.shutoutPoints} point${rules.shutoutPoints === 1 ? "" : "s"} per shutout`,
    ].filter(Boolean);
    row.pointsFormula = parts.length ? `${parts.join(" + ")} = ${row.points}` : "No completed games yet";
    return row;
  });
  const random = seededRandom(seed);
  const coins = new Map([...ids].sort().map((id) => [id, random()]));
  const resolve = (group: Standing[]): Standing[] => {
    if (group.length < 2) return group;
    const members = new Set(group.map((row) => row.registrationId));
    for (const criterion of rules.tiebreakers) {
      if (criterion === "manual") break;
      const value = (row: Standing): number => {
        if (criterion === "difference") return row.difference;
        if (criterion === "against") return -row.conceded;
        if (criterion === "for") return row.scored;
        if (criterion === "discipline") return -row.discipline;
        if (criterion === "coin_flip") return coins.get(row.registrationId)!;
        return completed.filter((game) => members.has(game.homeId!) && members.has(game.awayId!) && (game.homeId === row.registrationId || game.awayId === row.registrationId)).reduce((total, game) => {
          const difference = game.homeId === row.registrationId ? game.homeScore! - game.awayScore! : game.awayScore! - game.homeScore!;
          return total + (criterion === "head_to_head_difference" ? Math.max(-rules.differentialCap, Math.min(rules.differentialCap, difference)) : difference > 0 ? rules.winPoints : difference === 0 ? rules.tiePoints : rules.lossPoints);
        }, 0);
      };
      const buckets = new Map<number, Standing[]>();
      for (const row of group) { const score = value(row); buckets.set(score, [...(buckets.get(score) ?? []), row]); }
      if (buckets.size === 1) continue;
      for (const row of group) row.trace.push(`${criterion.replaceAll("_", " ")}: ${criterion === "coin_flip" ? `seed ${seed}` : value(row)}`);
      return [...buckets.entries()].sort(([left], [right]) => right - left).flatMap(([, bucket]) => resolve(bucket));
    }
    for (const row of group) { row.unresolved = true; row.trace.push("Tied; manager resolution required"); }
    return group.sort((left, right) => left.registrationId.localeCompare(right.registrationId));
  };
  const points = [...new Set(rows.map((row) => row.points))].sort((left, right) => right - left);
  const ranked = points.flatMap((points) => resolve(rows.filter((row) => row.points === points)));
  ranked.forEach((row, index) => { row.rank = index + 1; row.trace.unshift(`${row.points} competition points`); });
  return ranked;
}