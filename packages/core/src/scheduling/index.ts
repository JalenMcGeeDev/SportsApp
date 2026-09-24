import type { Division, Field, Game, Registration, Rules, Source, Tournament, VenueDraft } from "@season/types";
import { seededRandom } from "../standings/index.ts";
import { generateCompetition } from "../brackets/index.ts";

export type ScheduleInput = { games: Game[]; fields: Field[]; divisions: Division[]; registrations: Registration[]; rules: Rules; sport: string; timezone: string };
export type Violation = { code: string; gameId: string; conflictingGameId?: string; message: string };
const minute = 60_000;
const time = (value: string | null) => value ? Date.parse(value) : NaN;
const overlaps = (start: number, end: number, otherStart: number, otherEnd: number) => start < otherEnd && otherStart < end;

export function localParts(instant: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(instant));
  const get = (name: string) => parts.find((part) => part.type === name)!.value;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, clock: `${get("hour")}:${get("minute")}` };
}

function zoneOffsetMinutes(timezone: string, utcGuess: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(utcGuess);
  const get = (name: string) => Number(parts.find((part) => part.type === name)!.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return (asUtc - utcGuess.getTime()) / minute;
}

function localWallTimeToInstant(date: string, clock: string, timezone: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minuteOfHour] = clock.split(":").map(Number);
  let guess = new Date(Date.UTC(year!, month! - 1, day!, hour, minuteOfHour));
  guess = new Date(guess.getTime() - zoneOffsetMinutes(timezone, guess) * minute);
  return guess.toISOString();
}

/** One full-day 08:00-20:00 local availability window per tournament day; the wizard collects venues without asking for availability. */
export function defaultAvailability(startsOn: string, endsOn: string, timezone: string) {
  const windows: { start: string; end: string; blackout: boolean }[] = [];
  for (let cursor = new Date(`${startsOn}T00:00:00Z`); cursor <= new Date(`${endsOn}T00:00:00Z`); cursor = new Date(cursor.getTime() + 86_400_000)) {
    const date = cursor.toISOString().slice(0, 10);
    windows.push({ start: localWallTimeToInstant(date, "08:00", timezone), end: localWallTimeToInstant(date, "20:00", timezone), blackout: false });
  }
  return windows;
}

export function expandVenues(venues: VenueDraft[], sport: Tournament["sport"], startsOn: string, endsOn: string, timezone: string, id: () => string): Field[] {
  const windows = defaultAvailability(startsOn, endsOn, timezone);
  return venues.flatMap((venue) => venue.playAreas.map((playArea) => ({ id: id(), name: playArea.name, venue: venue.name, address: venue.address, sports: [sport], windows })));
}


function participants(input: ScheduleInput) {
  const games = new Map(input.games.map((game) => [game.id, game]));
  const memo = new Map<string, Set<string>>();
  const sourceTeams = (source: Source, divisionId: string, visited: Set<string>): string[] => {
    if (source.kind === "team") return [input.registrations.find((team) => team.id === source.registrationId)?.teamId ?? source.registrationId];
    if (source.kind === "bye") return [];
    if (source.kind === "pool") return input.registrations.filter((team) => team.divisionId === divisionId && team.status === "accepted" && (team.pool || "A") === source.pool).map((team) => team.teamId);
    const feeder = games.get(source.gameId);
    if (!feeder || visited.has(feeder.id)) return [];
    if (feeder.winnerId && !feeder.needsResolution && ["final", "forfeit", "bye"].includes(feeder.status)) {
      const id = source.kind === "winner" ? feeder.winnerId : feeder.homeId === feeder.winnerId ? feeder.awayId : feeder.homeId;
      return id ? [input.registrations.find((team) => team.id === id)?.teamId ?? id] : [];
    }
    return [...forGame(feeder, new Set([...visited, feeder.id]))];
  };
  const forGame = (game: Game, visited = new Set<string>()): Set<string> => {
    if (memo.has(game.id)) return memo.get(game.id)!;
    const result = new Set([...sourceTeams(game.homeSource, game.divisionId, visited), ...sourceTeams(game.awaySource, game.divisionId, visited)]);
    memo.set(game.id, result);
    return result;
  };
  for (const game of input.games) forGame(game);
  return memo;
}

function dependencies(game: Game, games: Game[]) {
  const ids = [game.homeSource, game.awaySource].flatMap((source) => source.kind === "winner" || source.kind === "loser" ? [source.gameId] : []);
  if (game.bracket !== "pool") ids.push(...games.filter((other) => other.divisionId === game.divisionId && other.bracket === "pool").map((other) => other.id));
  return [...new Set(ids)];
}

export function validateSchedule(input: ScheduleInput): Violation[] {
  const violations: Violation[] = [];
  const possible = participants(input);
  const active = input.games.filter((game) => game.start && game.end && !["cancelled", "bye", "postponed"].includes(game.status));
  const byId = new Map(input.games.map((game) => [game.id, game]));
  const days = new Map<string, Game[]>();
  for (const game of active) {
    const start = time(game.start);
    const end = time(game.end);
    const field = input.fields.find((field) => field.id === game.fieldId);
    const division = input.divisions.find((division) => division.id === game.divisionId);
    const add = (code: string, message: string, conflictingGameId?: string) => violations.push({ code, gameId: game.id, conflictingGameId, message });
    if (end - start !== input.rules.gameMinutes * minute) add("duration", `${game.label}: game duration must be ${input.rules.gameMinutes} minutes.`);
    if (!field || !field.sports.includes(input.sport as Field["sports"][number])) add("sport", `${game.label}: field does not support ${input.sport}.`);
    if (!field?.windows.some((window) => !window.blackout && start >= time(window.start) && end <= time(window.end))) add("availability", `${game.label}: outside field availability.`);
    if (field?.windows.some((window) => window.blackout && overlaps(start, end, time(window.start), time(window.end)))) add("blackout", `${game.label}: field is blacked out.`);
    const localStart = localParts(game.start!, input.timezone);
    const localEnd = localParts(game.end!, input.timezone);
    if (!division || localStart.date !== localEnd.date || localStart.clock < division.earliestTime || localEnd.clock > division.latestTime) add("division_hours", `${game.label}: outside division playing hours.`);
    for (const dependencyId of dependencies(game, input.games)) {
      const feeder = byId.get(dependencyId);
      if (feeder?.status === "bye") continue;
      if (!feeder?.end || start < time(feeder.end) + input.rules.restMinutes * minute) add("dependency", `${game.label}: must follow ${feeder?.label ?? dependencyId} plus rest.`, dependencyId);
    }
    for (const team of possible.get(game.id) ?? []) {
      const key = `${team}:${localStart.date}`;
      days.set(key, [...(days.get(key) ?? []), game]);
    }
  }
  for (let index = 0; index < active.length; index++) {
    const game = active[index]!;
    for (const other of active.slice(index + 1)) {
      if (game.fieldId === other.fieldId && overlaps(time(game.start), time(game.end) + input.rules.bufferMinutes * minute, time(other.start), time(other.end) + input.rules.bufferMinutes * minute)) {
        violations.push({ code: "field_conflict", gameId: game.id, conflictingGameId: other.id, message: `${game.label} conflicts with ${other.label} on the same field (including buffer).` });
      }
      if ([...(possible.get(game.id) ?? [])].some((team) => possible.get(other.id)?.has(team)) && overlaps(time(game.start), time(game.end) + input.rules.restMinutes * minute, time(other.start), time(other.end) + input.rules.restMinutes * minute)) {
        violations.push({ code: "team_rest", gameId: game.id, conflictingGameId: other.id, message: `${game.label} and ${other.label} overlap or leave less than ${input.rules.restMinutes} minutes rest for a possible participant.` });
      }
    }
  }
  for (const games of days.values()) {
    if (games.length > input.rules.maxGamesPerDay) violations.push({ code: "daily_limit", gameId: games[0]!.id, message: `A possible participant exceeds ${input.rules.maxGamesPerDay} games per day.` });
  }
  return violations;
}

export function generateSchedule(input: ScheduleInput, seed: number) {
  const random = seededRandom(seed);
  const possible = participants(input);
  const original = new Map(input.games.map((game) => [game.id, game]));
  const depthMemo = new Map<string, number>();
  const depth = (game: Game, visited = new Set<string>()): number => {
    if (depthMemo.has(game.id)) return depthMemo.get(game.id)!;
    if (visited.has(game.id)) throw new Error("Circular bracket dependency");
    const next = new Set([...visited, game.id]);
    const value = 1 + Math.max(0, ...dependencies(game, input.games).map((id) => original.has(id) ? depth(original.get(id)!, next) : 0));
    depthMemo.set(game.id, value);
    return value;
  };
  const priority = new Map(input.games.map((game) => [game.id, random()]));
  const games = input.games.map((game) => ({ ...game })).sort((left, right) => depth(left) - depth(right) || priority.get(left.id)! - priority.get(right.id)!);
  let slots = input.fields.filter((field) => field.sports.includes(input.sport as Field["sports"][number])).flatMap((field) => field.windows.filter((window) => !window.blackout).flatMap((window) => {
    const slots: { fieldId: string; start: number; end: number; date: string; clock: string; endClock: string; endDate: string }[] = [];
    for (let start = time(window.start); start + input.rules.gameMinutes * minute <= time(window.end); start += 5 * minute) {
      const end = start + input.rules.gameMinutes * minute;
      if (field.windows.some((window) => window.blackout && overlaps(start, end, time(window.start), time(window.end)))) continue;
      const localStart = localParts(new Date(start).toISOString(), input.timezone);
      const localEnd = localParts(new Date(end).toISOString(), input.timezone);
      slots.push({ fieldId: field.id, start, end, ...localStart, endClock: localEnd.clock, endDate: localEnd.date });
    }
    return slots;
  })).sort((left, right) => left.start - right.start || left.fieldId.localeCompare(right.fieldId));
  const teamGames = new Map<string, { start: number; end: number }[]>();
  const placed = new Map<string, Game>();
  const dayCounts = new Map<string, number>();
  const reserve = (game: Game) => {
    placed.set(game.id, game);
    if (!game.start || !game.end || !game.fieldId) return;
    const day = localParts(game.start, input.timezone).date;
    const start = time(game.start);
    const end = time(game.end);
    slots = slots.filter((slot) => slot.fieldId !== game.fieldId || !overlaps(slot.start, slot.end + input.rules.bufferMinutes * minute, start, end + input.rules.bufferMinutes * minute));
    for (const team of possible.get(game.id) ?? []) {
      teamGames.set(team, [...(teamGames.get(team) ?? []), { start, end }]);
      const key = `${team}:${day}`;
      dayCounts.set(key, (dayCounts.get(key) ?? 0) + 1);
    }
  };
  const locked = games.filter((game) => ["final", "forfeit", "in_progress", "bye", "cancelled"].includes(game.status));
  for (const game of locked) reserve(game);
  const unplaced: string[] = [];
  for (const game of games.filter((game) => !locked.includes(game))) {
    game.start = null; game.end = null; game.fieldId = null; game.status = "unscheduled";
    const division = input.divisions.find((division) => division.id === game.divisionId)!;
    const required = dependencies(game, input.games).map((id) => placed.get(id));
    if (required.some((feeder) => !feeder || (feeder.status !== "bye" && !feeder.end))) { unplaced.push(game.id); continue; }
    const earliest = Math.max(0, ...required.map((feeder) => feeder?.end ? time(feeder.end) + input.rules.restMinutes * minute : 0));
    const teams = [...(possible.get(game.id) ?? [])];
    const slot = slots.find((slot) => {
      if (slot.start < earliest || slot.date !== slot.endDate || slot.clock < division.earliestTime || slot.endClock > division.latestTime) return false;
      return teams.every((team) => (dayCounts.get(`${team}:${slot.date}`) ?? 0) < input.rules.maxGamesPerDay && !(teamGames.get(team) ?? []).some((other) => overlaps(slot.start, slot.end + input.rules.restMinutes * minute, other.start, other.end + input.rules.restMinutes * minute)));
    });
    if (!slot) { unplaced.push(game.id); continue; }
    game.start = new Date(slot.start).toISOString(); game.end = new Date(slot.end).toISOString(); game.fieldId = slot.fieldId; game.status = "scheduled"; game.version++;
    reserve(game);
  }
  return { games: input.games.map((game) => games.find((result) => result.id === game.id)!), unplaced, violations: unplaced.map((id) => `${original.get(id)?.label ?? id}: no feasible field/time remains; add capacity or adjust division rules.`) };
}

export function changedRegistrations(before: Game[], after: Game[]) {
  const previous = new Map(before.map((game) => [game.id, game]));
  const affected = new Set<string>();
  for (const game of after) {
    const old = previous.get(game.id);
    if (!old || old.start !== game.start || old.fieldId !== game.fieldId || old.status !== game.status || old.homeId !== game.homeId || old.awayId !== game.awayId) {
      for (const id of [old?.homeId, old?.awayId, game.homeId, game.awayId]) if (id) affected.add(id);
    }
    previous.delete(game.id);
  }
  for (const game of previous.values()) for (const id of [game.homeId, game.awayId]) if (id) affected.add(id);
  return [...affected].sort();
}

export type CapacityDivisionInput = { name: string; format: string; maxTeams: number; guaranteedGames: number; advancePerPool: number; earliestTime: string; latestTime: string };
export type CapacityInput = {
  sport: string;
  startsOn: string;
  endsOn: string;
  timezone: string;
  venues: VenueDraft[];
  divisions: CapacityDivisionInput[];
  rules: { gameMinutes: number; bufferMinutes: number; restMinutes: number; maxGamesPerDay: number };
};
export type CapacityDivisionField = "maxTeams" | "guaranteedGames" | "format";
export type CapacitySetupError = { divisionIndex: number; fields: CapacityDivisionField[]; message: string };
export type CapacityIssue = { divisionIndex: number; divisionName: string; maxTeams: number; unplacedCount: number; totalGames: number };
export type CapacityResult = { feasible: boolean; setupErrors: CapacitySetupError[]; issues: CapacityIssue[]; totalGames: number; fieldCount: number; resolvedByExtraField: boolean };

/** Rewrites the (pool/bracket-oriented) errors thrown by generateCompetition into guidance that points at the actual wizard field(s) to change. */
function explainCapacitySetupError(draft: CapacityDivisionInput, message: string): { fields: CapacityDivisionField[]; message: string } {
  if (message.includes("at least two accepted teams")) return { fields: ["maxTeams"], message: `${draft.name}: "Maximum teams" is set to ${draft.maxTeams}, but at least 2 are needed. Increase "Maximum teams" for this division.` };
  if (message.includes("cannot satisfy the game guarantee")) {
    const cap = draft.format === "single_elim" ? 1 : 2;
    return { fields: ["guaranteedGames", "format"], message: `${draft.name}: a ${draft.format === "single_elim" ? "single" : "double"}-elimination bracket can guarantee at most ${cap} game${cap === 1 ? "" : "s"} per team, but "Guaranteed games" is set to ${draft.guaranteedGames}. Lower "Guaranteed games" or change this division's format.` };
  }
  if (message.startsWith("Pool ")) return { fields: ["maxTeams", "guaranteedGames"], message: `${draft.name}: "Maximum teams" (${draft.maxTeams}) is too low for a ${draft.guaranteedGames}-game guarantee, which needs at least ${draft.guaranteedGames + 1} teams. Increase "Maximum teams" or lower "Guaranteed games" for this division.` };
  return { fields: ["maxTeams"], message: `${draft.name}: ${message}` };
}

function buildCapacityScenario(input: CapacityInput, extraField: boolean) {
  let counter = 0;
  const id = () => `preview-${counter++}`;
  const fields = expandVenues(input.venues, input.sport as Tournament["sport"], input.startsOn, input.endsOn, input.timezone, id);
  if (extraField && fields[0]) fields.push({ ...fields[0], id: id() });
  const rules: Rules = { ...input.rules, winPoints: 3, tiePoints: 1, lossPoints: 0, forfeitPoints: 3, shutoutPoints: 0, differentialCap: 5, tiebreakers: ["coin_flip"] };
  const setupErrors: CapacitySetupError[] = [];
  const divisions: Division[] = [];
  const registrations: Registration[] = [];
  const games: Game[] = [];
  input.divisions.forEach((draft, index) => {
    const divisionId = `preview-division-${index}`;
    const division: Division = { id: divisionId, name: draft.name || `Division ${index + 1}`, format: draft.format as Division["format"], maxTeams: draft.maxTeams, guaranteedGames: draft.guaranteedGames, advancePerPool: draft.advancePerPool, entryFeeCents: 0, earliestTime: draft.earliestTime, latestTime: draft.latestTime, eligibility: { earliestBirthdate: "2000-01-01", latestBirthdate: "2020-01-01", rosterMin: 1, rosterMax: 99, requiredDocuments: [], waiverVersion: 1 } };
    divisions.push(division);
    const teams: Registration[] = Array.from({ length: draft.maxTeams }, (_, teamIndex) => ({ id: `${divisionId}-team-${teamIndex}`, teamId: `${divisionId}-team-${teamIndex}`, divisionId, teamName: `Team ${teamIndex + 1}`, clubName: "", city: "", coachName: "Coach", coachEmail: "coach@example.com", seed: teamIndex + 1, pool: "A", status: "accepted", paymentStatus: "paid", amountCents: 0, refundedCents: 0, platformFeeCents: 0, stripePaymentIntentId: null, stripeRefundId: null, stripeCustomerId: null, stripeInvoiceId: null, invoiceSentAt: null, waitlistPosition: null, rosterApproved: true, checkIn: "not_checked_in", players: [] }));
    registrations.push(...teams);
    try { games.push(...generateCompetition(division, teams)); }
    catch (error) { setupErrors.push({ divisionIndex: index, ...explainCapacitySetupError(draft, error instanceof Error ? error.message : String(error)) }); }
  });
  return { fields, divisions, registrations, games, rules, setupErrors };
}

/**
 * Simulates scheduling every division at its maximum team capacity to warn tournament
 * creators, before they invite teams, that the requested venues/rules cannot fit the
 * worst-case number of games. Runs entirely client-side against the real scheduling engine.
 */
export function estimateCapacity(input: CapacityInput): CapacityResult {
  const scenario = buildCapacityScenario(input, false);
  const scheduled = generateSchedule({ games: scenario.games, fields: scenario.fields, divisions: scenario.divisions, registrations: scenario.registrations, rules: scenario.rules, sport: input.sport, timezone: input.timezone }, 1);
  const divisionNames = new Map(scenario.divisions.map((division) => [division.id, division.name]));
  const divisionMaxTeams = new Map(scenario.divisions.map((division) => [division.id, division.maxTeams]));
  const gameDivisions = new Map(scenario.games.map((game) => [game.id, game.divisionId]));
  const unplacedByDivision = new Map<string, number>();
  for (const gameId of scheduled.unplaced) {
    const divisionId = gameDivisions.get(gameId);
    if (divisionId) unplacedByDivision.set(divisionId, (unplacedByDivision.get(divisionId) ?? 0) + 1);
  }
  const divisionIndexById = new Map(scenario.divisions.map((division, index) => [division.id, index]));
  const issues: CapacityIssue[] = [...unplacedByDivision.entries()].map(([divisionId, unplacedCount]) => ({ divisionIndex: divisionIndexById.get(divisionId) ?? 0, divisionName: divisionNames.get(divisionId) ?? divisionId, maxTeams: divisionMaxTeams.get(divisionId) ?? 0, unplacedCount, totalGames: scenario.games.filter((game) => game.divisionId === divisionId).length }));
  let resolvedByExtraField = false;
  if (issues.length) {
    const withExtraField = buildCapacityScenario(input, true);
    const retry = generateSchedule({ games: withExtraField.games, fields: withExtraField.fields, divisions: withExtraField.divisions, registrations: withExtraField.registrations, rules: withExtraField.rules, sport: input.sport, timezone: input.timezone }, 1);
    resolvedByExtraField = retry.unplaced.length === 0;
  }
  return { feasible: issues.length === 0 && scenario.setupErrors.length === 0, setupErrors: scenario.setupErrors, issues, totalGames: scenario.games.length, fieldCount: scenario.fields.length, resolvedByExtraField };
}