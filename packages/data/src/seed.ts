import { generateCompetition, generateSchedule, resolveBracket } from "@season/core";
import { workspaceSchema, type Division, type Registration, type Tournament, type Workspace } from "@season/types";

export function createDemo(): Workspace {
  const now = "2026-09-26T13:00:00.000Z";
  const divisions: Division[] = ["U12 Boys", "U14 Girls", "U16 Boys"].map((name, index) => ({
    id: `division-${index + 1}`, name, format: index === 2 ? "single_elim" : "pool_to_bracket", maxTeams: 16,
    guaranteedGames: index === 2 ? 1 : 3, advancePerPool: 2, entryFeeCents: 45000 + index * 5000,
    earliestTime: "08:00", latestTime: "18:00",
    eligibility: { earliestBirthdate: `${2014 - index * 2}-01-01`, latestBirthdate: `${2015 - index * 2}-12-31`, rosterMin: 7, rosterMax: 18, requiredDocuments: ["age_verification"], waiverVersion: 1 },
  }));
  const names = ["Northside FC", "River City United", "Austin Athletic", "Lone Star SC", "Cedar Park FC", "Eastside United", "Round Rock SC", "Hill Country FC", "Westlake United", "Capital City FC", "Barton Creek SC", "South Austin FC"];
  const registrations: Registration[] = names.map((teamName, index) => ({
    id: `reg-${index + 1}`, teamId: `team-${index + 1}`, divisionId: divisions[Math.floor(index / 4)]!.id,
    teamName, clubName: teamName, city: ["Austin, TX", "Round Rock, TX", "Cedar Park, TX"][index % 3]!,
    coachName: ["Jordan Davis", "Alex Morgan", "Sam Wilson", "Taylor Reed"][index % 4]!, coachEmail: `coach${index + 1}@example.test`,
    seed: index % 4 + 1, pool: "A", status: "accepted", paymentStatus: "unpaid", amountCents: divisions[Math.floor(index / 4)]!.entryFeeCents,
    refundedCents: 0, waitlistPosition: null, rosterApproved: index % 4 !== 2,
    checkIn: index % 3 === 0 ? "checked_in" : "not_checked_in",
    players: Array.from({ length: 9 }, (_, playerIndex) => ({ id: `player-${index}-${playerIndex}`, firstName: `Sample ${playerIndex + 1}`, lastName: "Player", birthdate: `${2014 - Math.floor(index / 4) * 2}-06-15`, jerseyNumber: `${playerIndex + 1}`, documents: [{ id: `document-${index}-${playerIndex}`, type: "age_verification", status: index % 4 === 2 && playerIndex === 0 ? "pending" : "approved" }], waiverVersion: 1 })),
  }));
  const tournament: Tournament = {
    id: "autumn-cup", name: "Autumn Invitational", slug: "autumn-invitational", sport: "soccer", startsOn: "2026-09-26", endsOn: "2026-09-27",
    timezone: "America/Chicago", status: "in_progress", description: "Two days of great competition in the heart of Austin.", location: "Austin, Texas", publishedAt: now,
    rules: { gameMinutes: 40, bufferMinutes: 10, restMinutes: 30, maxGamesPerDay: 4, winPoints: 3, tiePoints: 1, lossPoints: 0, forfeitPoints: 3, shutoutPoints: 0, differentialCap: 5, tiebreakers: ["head_to_head", "difference", "against", "coin_flip"] },
    divisions, registrations, games: [], publishedGames: [], invitees: [], invitesSentAt: now, registrationInvitesSentAt: now,
    fields: ["Field 01", "Field 02", "Field 03", "Field 04"].map((name, index) => ({ id: `field-${index + 1}`, name, venue: "Zilker Sports Complex", address: "2100 Barton Springs Rd, Austin, TX", sports: ["soccer", "flag_football"], windows: [26, 27].map((day) => ({ start: `2026-09-${day}T13:00:00.000Z`, end: `2026-09-${day}T23:00:00.000Z`, blackout: false })) })),
  };
  tournament.games = divisions.flatMap((division) => generateCompetition(division, registrations));
  tournament.games = generateSchedule(tournament, 42).games;
  const poolGames = tournament.games.filter((game) => game.bracket === "pool").sort((left, right) => (left.start ?? "").localeCompare(right.start ?? ""));
  for (const [index, game] of poolGames.slice(0, 4).entries()) { game.status = "final"; game.homeScore = [2, 1, 3, 0][index]!; game.awayScore = [0, 1, 1, 2][index]!; game.winnerId = game.homeScore > game.awayScore ? game.homeId : game.homeScore < game.awayScore ? game.awayId : null; game.version++; }
  for (const game of poolGames.slice(4, 6)) game.status = "in_progress";
  tournament.games = resolveBracket(tournament.games).games;
  tournament.publishedGames = structuredClone(tournament.games);
  const upcoming: Tournament = { ...structuredClone(tournament), id: "winter-classic", name: "Winter Classic", slug: "winter-classic", startsOn: "2026-12-05", endsOn: "2026-12-06", status: "registration_open", description: "Close out the year on the pitch.", registrations: [], games: [], publishedGames: [], publishedAt: null, invitesSentAt: null, registrationInvitesSentAt: null, fields: tournament.fields.map((field) => ({ ...field, windows: [5, 6].map((day) => ({ start: `2026-12-0${day}T14:00:00.000Z`, end: `2026-12-0${day}T23:00:00.000Z`, blackout: false })) })) };
  return workspaceSchema.parse({
    revision: 0, mode: "demo", organization: { name: "Austin Youth Sports", slug: "austin-youth-sports", ownerName: "Alex Morgan", timezone: "America/Chicago" },
    tournaments: [tournament, upcoming], announcements: [{ id: "welcome", tournamentId: tournament.id, subject: "Welcome to the Autumn Invitational", body: "Team check-in opens at 7:30 AM at the tournament desk. Please have your approved roster ready.", audience: "tournament", audienceId: null, sentAt: "2026-09-25T20:00:00.000Z", recipientCount: 12 }],
    notifications: [{ id: "notification-1", title: "3 rosters need attention", body: "Age-verification documents are awaiting review.", createdAt: now, read: false, registrationIds: ["reg-3", "reg-7", "reg-11"] }],
    messages: [{ id: "message-1", tournamentId: tournament.id, registrationId: "reg-1", sender: "coach", body: "Hi! Our team will arrive at 7:45 AM. Is the tournament desk near Field 01?", sentAt: "2026-09-25T21:30:00.000Z" }],
    runs: [], inviteJobs: [], audit: [{ id: "audit-1", action: "schedule_published", entityId: tournament.id, at: "2026-09-25T16:00:00.000Z", detail: "Autumn Invitational schedule published" }],
  });
}