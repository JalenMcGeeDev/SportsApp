import { z } from "zod";

export const optionalEmailSchema = z.string().trim().toLowerCase().max(200).nullable().optional().refine((value) => !value || z.string().email().safeParse(value).success, "Enter a valid email address");
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}, "Enter a valid calendar date");
export const documentTypeSchema = z.enum(["age_verification", "medical_release", "photo", "other"]);
export const documentSchema = z.object({ id: z.string().min(1), type: documentTypeSchema, status: z.enum(["pending", "approved", "rejected"]) });
export const playerSchema = z.object({
  id: z.string().min(1), firstName: z.string().trim().min(1).max(80), lastName: z.string().trim().min(1).max(80),
  birthdate: dateSchema, jerseyNumber: z.string().max(3).default(""), documents: z.array(documentSchema),
  waiverVersion: z.number().int().nonnegative().nullable(),
});
export const eligibilityRulesSchema = z.object({
  earliestBirthdate: dateSchema, latestBirthdate: dateSchema,
  rosterMin: z.number().int().positive(), rosterMax: z.number().int().positive(),
  requiredDocuments: z.array(documentTypeSchema), waiverVersion: z.number().int().positive(),
}).refine((rules) => rules.earliestBirthdate <= rules.latestBirthdate && rules.rosterMin <= rules.rosterMax, "Invalid eligibility range");
export type Player = z.infer<typeof playerSchema>;
export type EligibilityRules = z.infer<typeof eligibilityRulesSchema>;

export const sportSchema = z.enum(["soccer", "basketball", "baseball", "softball", "volleyball", "flag_football", "pickleball"]);
export const formatSchema = z.enum(["pool_to_bracket", "round_robin", "single_elim", "double_elim", "pool_only"]);
export const rulesSchema = z.object({
  gameMinutes: z.number().int().min(5).max(240), bufferMinutes: z.number().int().min(0).max(120),
  restMinutes: z.number().int().min(0).max(360), maxGamesPerDay: z.number().int().min(1).max(12),
  winPoints: z.number().int(), tiePoints: z.number().int(), lossPoints: z.number().int(),
  forfeitPoints: z.number().int(), shutoutPoints: z.number().int(), differentialCap: z.number().int().positive(),
  tiebreakers: z.array(z.enum(["head_to_head", "head_to_head_difference", "difference", "against", "for", "discipline", "coin_flip", "manual"])).min(1),
});
export const divisionSchema = z.object({
  id: z.string(), name: z.string().trim().min(2).max(80), format: formatSchema,
  maxTeams: z.number().int().min(2).max(1024), guaranteedGames: z.number().int().min(1).max(12),
  advancePerPool: z.number().int().min(1).max(8), entryFeeCents: z.number().int().nonnegative().max(10000000),
  earliestTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), latestTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  eligibility: eligibilityRulesSchema,
});
export const fieldSchema = z.object({
  id: z.string(), name: z.string().trim().min(2).max(80), venue: z.string().trim().min(2).max(100), address: z.string().trim().min(2).max(200),
  sports: z.array(sportSchema).min(1),
  windows: z.array(z.object({ start: z.string().datetime(), end: z.string().datetime(), blackout: z.boolean() })),
});
export const venueDraftSchema = z.object({
  name: z.string().trim().min(2).max(100), address: z.string().trim().min(2).max(200),
  playAreas: z.array(z.object({ name: z.string().trim().min(2).max(80) })).min(1).max(20),
});
export const registrationSchema = z.object({
  id: z.string(), teamId: z.string(), divisionId: z.string(), teamName: z.string().trim().min(2).max(80),
  clubName: z.string().max(100), city: z.string().max(100), coachName: z.string().trim().min(2).max(100),
  coachEmail: z.string().email(), seed: z.number().int().positive(), pool: z.string().max(40),
  status: z.enum(["submitted", "waitlisted", "accepted", "declined", "withdrawn"]),
  paymentStatus: z.enum(["unpaid", "processing", "paid", "refunded", "partially_refunded", "failed"]),
  amountCents: z.number().int().nonnegative(), refundedCents: z.number().int().nonnegative(),
  waitlistPosition: z.number().int().positive().nullable(), rosterApproved: z.boolean(),
  checkIn: z.enum(["not_checked_in", "checked_in", "flagged"]), players: z.array(playerSchema),
});
export const sourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("team"), registrationId: z.string() }),
  z.object({ kind: z.literal("winner"), gameId: z.string() }),
  z.object({ kind: z.literal("loser"), gameId: z.string() }),
  z.object({ kind: z.literal("pool"), pool: z.string(), rank: z.number().int().positive() }),
  z.object({ kind: z.literal("bye") }),
]);
export const gameSchema = z.object({
  id: z.string(), divisionId: z.string(), pool: z.string().nullable(), round: z.number().int().nonnegative(),
  label: z.string(), bracket: z.enum(["pool", "championship", "losers", "consolation"]),
  homeSource: sourceSchema, awaySource: sourceSchema, homeId: z.string().nullable(), awayId: z.string().nullable(),
  fieldId: z.string().nullable(), start: z.string().datetime().nullable(), end: z.string().datetime().nullable(),
  status: z.enum(["unscheduled", "scheduled", "in_progress", "final", "forfeit", "cancelled", "postponed", "bye"]),
  homeScore: z.number().int().nonnegative().nullable(), awayScore: z.number().int().nonnegative().nullable(),
  winnerId: z.string().nullable(), version: z.number().int().nonnegative(), needsResolution: z.boolean(),
  ifNecessary: z.boolean().default(false), disciplineHome: z.number().int().nonnegative().default(0), disciplineAway: z.number().int().nonnegative().default(0),
});
export const tournamentSchema = z.object({
  id: z.string(), name: z.string().trim().min(3).max(100), slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  sport: sportSchema, startsOn: dateSchema, endsOn: dateSchema,
  timezone: z.string().refine((value) => { try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; } }, "Invalid timezone"),
  status: z.enum(["draft", "registration_open", "registration_closed", "scheduled", "in_progress", "completed", "archived"]),
  description: z.string().max(3000), location: z.string().max(100), publishedAt: z.string().nullable(),
  rules: rulesSchema, divisions: z.array(divisionSchema), fields: z.array(fieldSchema),
  registrations: z.array(registrationSchema), games: z.array(gameSchema), publishedGames: z.array(gameSchema),
  invitees: z.array(z.string().trim().toLowerCase().email()).max(100), invitesSentAt: z.string().nullable(),
  registrationInvitesSentAt: z.string().nullable(),
});
export const announcementSchema = z.object({
  id: z.string(), tournamentId: z.string(), subject: z.string().trim().min(3).max(150), body: z.string().trim().min(1).max(5000),
  audience: z.enum(["tournament", "division", "team"]), audienceId: z.string().nullable(), sentAt: z.string(), recipientCount: z.number().int(),
});
export const notificationSchema = z.object({ id: z.string(), title: z.string(), body: z.string(), createdAt: z.string(), read: z.boolean(), registrationIds: z.array(z.string()) });
export const messageSchema = z.object({ id: z.string(), registrationId: z.string(), tournamentId: z.string(), sender: z.enum(["manager", "coach"]), body: z.string().trim().min(1).max(5000), sentAt: z.string() });
export const scheduleRunSchema = z.object({
  id: z.string(), tournamentId: z.string(), seed: z.number().int(), status: z.enum(["queued", "running", "succeeded", "failed"]),
  createdAt: z.string(), completedAt: z.string().nullable(), unplacedCount: z.number().int(), violations: z.array(z.string()),
});
export const inviteJobSchema = z.object({
  id: z.string(), tournamentId: z.string(), status: z.enum(["queued", "running", "succeeded", "failed"]),
  kind: z.enum(["registration_open", "schedule_published"]),
  createdAt: z.string(), completedAt: z.string().nullable(), recipientCount: z.number().int().nonnegative(), error: z.string().nullable(),
});
export const workspaceSchema = z.object({
  revision: z.number().int().nonnegative(), mode: z.enum(["demo", "live"]),
  organization: z.object({ name: z.string().trim().min(2).max(80), slug: z.string(), ownerName: z.string(), timezone: z.string(), avatarUrl: z.string().nullable().optional(), logoUrl: z.string().nullable().optional(), replyToEmail: z.string().nullable().optional() }),
  tournaments: z.array(tournamentSchema), announcements: z.array(announcementSchema), notifications: z.array(notificationSchema),
  messages: z.array(messageSchema), runs: z.array(scheduleRunSchema), inviteJobs: z.array(inviteJobSchema),
  audit: z.array(z.object({ id: z.string(), action: z.string(), entityId: z.string(), at: z.string(), detail: z.string() })),
});
export const createTournamentSchema = tournamentSchema.pick({ name: true, sport: true, startsOn: true, endsOn: true, timezone: true, location: true, description: true }).extend({
  venues: z.array(venueDraftSchema).min(1).max(10),
  divisions: z.array(divisionSchema.omit({ id: true })).min(1).max(20),
  invitees: z.array(z.string().trim().toLowerCase().email()).max(100).default([]),
  rules: z.object({
    gameMinutes: z.number().int().min(5).max(240).default(40), bufferMinutes: z.number().int().min(0).max(120).default(10),
    restMinutes: z.number().int().min(0).max(360).default(30), maxGamesPerDay: z.number().int().min(1).max(12).default(4),
  }).default({}),
}).refine((value) => value.endsOn >= value.startsOn, "End date must not precede start date");
export const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("create_tournament"), data: createTournamentSchema }),
  z.object({ type: z.literal("update_tournament"), tournamentId: z.string(), name: z.string().trim().min(3).max(100), status: tournamentSchema.shape.status, rules: rulesSchema }),
  z.object({ type: z.literal("add_division"), tournamentId: z.string(), division: divisionSchema.omit({ id: true }) }),
  z.object({ type: z.literal("add_venue"), tournamentId: z.string(), venue: venueDraftSchema }),
  z.object({ type: z.literal("register_team"), tournamentId: z.string(), data: registrationSchema.pick({ divisionId: true, teamName: true, clubName: true, city: true, coachName: true, coachEmail: true }) }),
  z.object({ type: z.literal("registration_status"), tournamentId: z.string(), registrationId: z.string(), status: registrationSchema.shape.status }),
  z.object({ type: z.literal("check_in"), tournamentId: z.string(), registrationId: z.string(), status: registrationSchema.shape.checkIn }),
  z.object({ type: z.literal("add_player"), tournamentId: z.string(), registrationId: z.string(), player: playerSchema.pick({ firstName: true, lastName: true, birthdate: true, jerseyNumber: true }) }),
  z.object({ type: z.literal("approve_roster"), tournamentId: z.string(), registrationId: z.string() }),
  z.object({ type: z.literal("generate_schedule"), tournamentId: z.string(), seed: z.number().int().min(0).max(2147483647) }),
  z.object({ type: z.literal("publish_schedule"), tournamentId: z.string() }),
  z.object({ type: z.literal("move_game"), tournamentId: z.string(), gameId: z.string(), fieldId: z.string(), start: z.string().datetime(), version: z.number().int(), force: z.boolean(), reason: z.string().max(500) }),
  z.object({ type: z.literal("score_game"), tournamentId: z.string(), gameId: z.string(), homeScore: z.number().int().min(0).max(999), awayScore: z.number().int().min(0).max(999), version: z.number().int(), forfeit: z.boolean().default(false) }),
  z.object({ type: z.literal("game_status"), tournamentId: z.string(), gameId: z.string(), status: z.enum(["in_progress", "postponed", "cancelled", "scheduled"]), version: z.number().int() }),
  z.object({ type: z.literal("announce"), tournamentId: z.string(), data: announcementSchema.pick({ subject: true, body: true, audience: true, audienceId: true }) }),
  z.object({ type: z.literal("message"), tournamentId: z.string(), registrationId: z.string(), body: z.string().trim().min(1).max(5000) }),
  z.object({ type: z.literal("read_notifications") }),
  z.object({ type: z.literal("update_organization"), name: z.string().trim().min(2).max(80), avatarUrl: z.string().nullable().optional(), logoUrl: z.string().nullable().optional(), replyToEmail: optionalEmailSchema }),
]);
export const mutationSchema = z.object({ revision: z.number().int().nonnegative(), command: commandSchema });
export const publicTournamentSchema = tournamentSchema.pick({ id: true, name: true, slug: true, sport: true, startsOn: true, endsOn: true, timezone: true, description: true, location: true, status: true, rules: true }).extend({
  divisions: z.array(divisionSchema.pick({ id: true, name: true, format: true, maxTeams: true, guaranteedGames: true, entryFeeCents: true })),
  fields: z.array(fieldSchema.pick({ id: true, name: true, venue: true })),
  teams: z.array(registrationSchema.pick({ id: true, teamName: true, divisionId: true, pool: true, seed: true, status: true })),
  games: z.array(gameSchema),
});
export const apiErrorSchema = z.object({ error: z.string(), details: z.array(z.string()).optional() });
export type Rules = z.infer<typeof rulesSchema>;
export type Division = z.infer<typeof divisionSchema>;
export type Field = z.infer<typeof fieldSchema>;
export type VenueDraft = z.infer<typeof venueDraftSchema>;
export type Registration = z.infer<typeof registrationSchema>;
export type Source = z.infer<typeof sourceSchema>;
export type Game = z.infer<typeof gameSchema>;
export type Tournament = z.infer<typeof tournamentSchema>;
export type InviteJob = z.infer<typeof inviteJobSchema>;
export type Workspace = z.infer<typeof workspaceSchema>;
export type Command = z.infer<typeof commandSchema>;
export type PublicTournament = z.infer<typeof publicTournamentSchema>;
export const registrationEmailInputSchema = z.object({
  tournamentId: z.string().min(1), registrationId: z.string().min(1),
  subject: z.string().trim().min(1).max(150), body: z.string().trim().min(1).max(5000),
});