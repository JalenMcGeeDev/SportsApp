import { commandSchema, gameSchema, publicTournamentSchema, workspaceSchema, type Command, type Tournament, type Workspace } from "@season/types";
import { resolveBracket } from "./brackets/index.ts";
import { computeStandings } from "./standings/index.ts";
import { changedRegistrations, expandVenues, validateSchedule } from "./scheduling/index.ts";

export class DomainError extends Error {
  constructor(message: string, public status = 400, public details: string[] = []) { super(message); }
}

export function publicTournament(tournament: Tournament) {
  return publicTournamentSchema.parse({ ...tournament, teams: tournament.registrations.filter((team) => team.status === "accepted"), games: tournament.publishedGames });
}

export function advanceTournament(tournament: Tournament) {
  for (const division of tournament.divisions) {
    const games = tournament.games.filter((game) => game.divisionId === division.id);
    const ranks: Record<string, string[]> = {};
    for (const pool of new Set(games.filter((game) => game.pool).map((game) => game.pool!))) {
      const poolGames = games.filter((game) => game.pool === pool);
      if (!poolGames.every((game) => ["final", "forfeit"].includes(game.status) && !game.needsResolution)) continue;
      const ids = [...new Set(poolGames.flatMap((game) => [game.homeId!, game.awayId!]))];
      const standings = computeStandings(ids, poolGames, tournament.rules);
      if (!standings.some((row) => row.unresolved)) ranks[pool] = standings.map((row) => row.registrationId);
    }
    const result = resolveBracket(games, ranks);
    const byId = new Map(result.games.map((game) => [game.id, game]));
    tournament.games = tournament.games.map((game) => byId.get(game.id) ?? game);
  }
}

export function applyCommand(input: Workspace, raw: Command, context: { now: string; id: () => string }): Workspace {
  const command = commandSchema.parse(raw);
  const state = workspaceSchema.parse(input);
  const { now, id } = context;
  const tournament = "tournamentId" in command ? state.tournaments.find((item) => item.id === command.tournamentId) : undefined;
  if ("tournamentId" in command && !tournament) throw new DomainError("Tournament not found", 404);
  const registration = "registrationId" in command ? tournament?.registrations.find((team) => team.id === command.registrationId) : undefined;
  if ("registrationId" in command && !registration) throw new DomainError("Team registration not found", 404);
  const game = "gameId" in command ? tournament?.games.find((game) => game.id === command.gameId) : undefined;
  if ("gameId" in command && !game) throw new DomainError("Game not found", 404);
  const contact = "contactId" in command ? tournament?.contacts.find((contact) => contact.id === command.contactId) : undefined;
  if ("contactId" in command && !contact) throw new DomainError("Contact not found", 404);
  if (game && "version" in command && command.version !== game.version) throw new DomainError("This game changed. Refresh before saving your score or edit.", 409);
  const notify = (title: string, body: string, registrationIds: string[]) => {
    state.notifications.unshift({ id: id(), title, body, createdAt: now, read: false, registrationIds: [...new Set(registrationIds)] });
  };
  switch (command.type) {
    case "create_tournament": {
      const tournamentId = id();
      const { venues, divisions, invitees, rules, ...details } = command.data;
      const fields = expandVenues(venues, details.sport, details.startsOn, details.endsOn, details.timezone, id);
      state.tournaments.push({ ...details, id: tournamentId, slug: `${command.data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${tournamentId.slice(0, 6)}`, status: "draft", publishedAt: null, rules: { ...rules, winPoints: 3, tiePoints: 1, lossPoints: 0, forfeitPoints: 3, shutoutPoints: 0, differentialCap: 5, tiebreakers: ["head_to_head", "difference", "against", "coin_flip"] }, divisions: divisions.map((division) => ({ ...division, id: id() })), fields, registrations: [], games: [], publishedGames: [], invitees, invitesSentAt: null, registrationInvitesSentAt: null, followers: [], contacts: [] });
      break;
    }
    case "update_tournament": {
      if (tournament!.games.length && JSON.stringify(command.rules) !== JSON.stringify(tournament!.rules)) throw new DomainError("Rules are locked after games are generated. Create a new tournament to change competition rules.");
      const enteringRegistrationOpen = command.status === "registration_open" && tournament!.status !== "registration_open";
      if (enteringRegistrationOpen && !state.organization.stripeOnboardingComplete) throw new DomainError("Connect and finish onboarding your Stripe account before opening registration.", 422);
      tournament!.name = command.name; tournament!.status = command.status; tournament!.rules = command.rules;
      if (enteringRegistrationOpen && tournament!.invitees.length && !tournament!.registrationInvitesSentAt) {
        state.inviteJobs.unshift({ id: id(), tournamentId: tournament!.id, kind: "registration_open", announcementId: null, status: "queued", createdAt: now, completedAt: null, recipientCount: tournament!.invitees.length, error: null });
      }
      break;
    }
    case "delete_tournament": {
      state.tournaments = state.tournaments.filter((item) => item.id !== command.tournamentId);
      break;
    }
    case "add_division": tournament!.divisions.push({ ...command.division, id: id() }); break;
    case "add_venue": {
      tournament!.fields.push(...expandVenues([command.venue], tournament!.sport, tournament!.startsOn, tournament!.endsOn, tournament!.timezone, id));
      break;
    }
    case "add_contact": {
      if (tournament!.contacts.some((contact) => contact.email === command.email)) throw new DomainError("This email is already on the contact list.");
      tournament!.contacts.push({ id: id(), name: command.name, email: command.email, note: command.note });
      break;
    }
    case "update_contact": {
      if (tournament!.contacts.some((item) => item.id !== command.contactId && item.email === command.email)) throw new DomainError("This email is already on the contact list.");
      contact!.name = command.name; contact!.email = command.email; contact!.note = command.note;
      break;
    }
    case "delete_contact": {
      tournament!.contacts = tournament!.contacts.filter((item) => item.id !== command.contactId);
      break;
    }
    case "register_team": {
      const division = tournament!.divisions.find((division) => division.id === command.data.divisionId);
      if (!division) throw new DomainError("Division not found", 404);
      if (tournament!.games.length) throw new DomainError("Registration is locked once competition games exist.");
      if (tournament!.registrations.some((team) => team.divisionId === division.id && team.teamName.toLowerCase() === command.data.teamName.toLowerCase() && !["declined", "withdrawn"].includes(team.status))) throw new DomainError("This team is already registered in the division.");
      const full = tournament!.registrations.filter((team) => team.divisionId === division.id && team.status === "accepted").length >= division.maxTeams;
      const teamId = id();
      const registrationId = id();
      tournament!.registrations.push({ ...command.data, id: registrationId, teamId, status: full ? "waitlisted" : "submitted", paymentStatus: "unpaid", amountCents: division.entryFeeCents, refundedCents: 0, platformFeeCents: 0, stripePaymentIntentId: null, stripeRefundId: null, stripeCustomerId: null, stripeInvoiceId: null, invoiceSentAt: null, seed: tournament!.registrations.length + 1, pool: "A", waitlistPosition: full ? tournament!.registrations.filter((team) => team.divisionId === division.id && team.status === "waitlisted").length + 1 : null, rosterApproved: false, checkIn: "not_checked_in", players: [] });
      notify("New registration", `${command.data.teamName} ${full ? "joined the waitlist" : "submitted a registration"}.`, [registrationId]);
      break;
    }
    case "registration_status": {
      if (tournament!.games.some((game) => game.divisionId === registration!.divisionId)) throw new DomainError("Registration decisions are locked after competition generation.");
      const division = tournament!.divisions.find((division) => division.id === registration!.divisionId)!;
      const accepted = tournament!.registrations.filter((team) => team.divisionId === division.id && team.status === "accepted" && team.id !== registration!.id).length;
      if (command.status === "accepted" && accepted >= division.maxTeams) throw new DomainError("Division is full. Increase capacity before accepting this team.");
      registration!.status = command.status;
      if (command.status === "accepted" && !tournament!.contacts.some((contact) => contact.email === registration!.coachEmail)) {
        tournament!.contacts.push({ id: id(), name: registration!.coachName, email: registration!.coachEmail, note: `${registration!.teamName} - Coach` });
      }
      if (command.status === "accepted" && registration!.amountCents === 0 && registration!.paymentStatus === "unpaid") registration!.paymentStatus = "paid";
      registration!.waitlistPosition = command.status === "waitlisted" ? tournament!.registrations.filter((team) => team.divisionId === division.id && team.status === "waitlisted" && team.id !== registration!.id).length + 1 : null;
      tournament!.registrations.filter((team) => team.divisionId === division.id && team.status === "waitlisted").sort((left, right) => (left.waitlistPosition ?? 0) - (right.waitlistPosition ?? 0)).forEach((team, index) => { team.waitlistPosition = index + 1; });
      notify("Registration updated", `${registration!.teamName}: ${command.status}.`, [registration!.id]);
      break;
    }
    case "check_in": {
      if (registration!.status !== "accepted") throw new DomainError("Only accepted teams can check in.");
      registration!.checkIn = command.status; break;
    }
    case "add_player": {
      registration!.players.push({ ...command.player, id: id(), documents: [], waiverVersion: null });
      registration!.rosterApproved = false; break;
    }
    case "approve_roster": {
      registration!.rosterApproved = true; notify("Roster approved", registration!.teamName, [registration!.id]); break;
    }
    case "generate_schedule": {
      if (state.runs.some((run) => run.tournamentId === tournament!.id && ["queued", "running"].includes(run.status))) throw new DomainError("A schedule job is already running.", 409);
      if (!tournament!.fields.length || !tournament!.divisions.length) throw new DomainError("Add at least one division and field before generating a schedule.");
      state.runs.unshift({ id: id(), tournamentId: tournament!.id, seed: command.seed, status: "queued", createdAt: now, completedAt: null, unplacedCount: 0, violations: [] }); break;
    }
    case "publish_schedule": {
      if (!tournament!.games.length) throw new DomainError("Generate a schedule before publishing.");
      if (tournament!.games.some((game) => game.status === "unscheduled" || game.needsResolution)) throw new DomainError("Place all games and resolve bracket corrections before publishing.");
      const violations = validateSchedule(tournament!);
      const forced = new Set(state.audit.filter((entry) => entry.action === "force_schedule_override").map((entry) => entry.detail));
      const unconfirmed = violations.filter((issue) => !forced.has(`${issue.gameId}:${tournament!.games.find((game) => game.id === issue.gameId)?.version}:${issue.code}`));
      if (unconfirmed.length) throw new DomainError("Schedule has hard-constraint violations.", 422, unconfirmed.map((issue) => issue.message));
      const affected = tournament!.publishedAt ? changedRegistrations(tournament!.publishedGames, tournament!.games) : tournament!.registrations.filter((team) => team.status === "accepted").map((team) => team.id);
      const firstPublish = !tournament!.publishedAt;
      tournament!.publishedGames = gameSchema.array().parse(tournament!.games); tournament!.publishedAt = now;
      if (tournament!.status !== "in_progress") tournament!.status = "scheduled";
      if (affected.length) notify("Schedule published", `${tournament!.name}: schedule updated for ${affected.length} teams.`, affected);
      if (firstPublish && tournament!.invitees.length && !tournament!.invitesSentAt) {
        state.inviteJobs.unshift({ id: id(), tournamentId: tournament!.id, kind: "schedule_published", announcementId: null, status: "queued", createdAt: now, completedAt: null, recipientCount: tournament!.invitees.length, error: null });
      }
      break;
    }
    case "move_game": {
      if (["final", "forfeit", "in_progress", "bye"].includes(game!.status)) throw new DomainError("Only unplayed games can be moved.");
      game!.fieldId = command.fieldId; game!.start = command.start; game!.end = new Date(Date.parse(command.start) + tournament!.rules.gameMinutes * 60000).toISOString(); game!.status = "scheduled"; game!.version++;
      const issues = validateSchedule(tournament!).filter((issue) => issue.gameId === game!.id || issue.conflictingGameId === game!.id || issue.code === "daily_limit");
      if (issues.length && (!command.force || command.reason.trim().length < 10)) throw new DomainError("This move violates schedule constraints. An explicit override and a reason of at least 10 characters are required.", 422, issues.map((issue) => issue.message));
      if (issues.length) for (const issue of issues) state.audit.unshift({ id: id(), action: "force_schedule_override", entityId: game!.id, at: now, detail: `${issue.gameId}:${tournament!.games.find((game) => game.id === issue.gameId)?.version}:${issue.code}` });
      break;
    }
    case "score_game": {
      if (!game!.homeId || !game!.awayId || ["bye", "cancelled"].includes(game!.status) || game!.needsResolution) throw new DomainError("Both participants must be resolved before scoring this game.");
      if (command.homeScore === command.awayScore && (game!.bracket !== "pool" || command.forfeit)) throw new DomainError("An elimination or forfeit result must have a winner.");
      game!.homeScore = command.homeScore; game!.awayScore = command.awayScore;
      game!.winnerId = command.homeScore === command.awayScore ? null : command.homeScore > command.awayScore ? game!.homeId : game!.awayId;
      game!.status = command.forfeit ? "forfeit" : "final"; game!.version++;
      advanceTournament(tournament!);
      const changed = changedRegistrations(tournament!.publishedGames, tournament!.games);
      if (tournament!.publishedAt) {
        const drafts = new Map(tournament!.games.map((game) => [game.id, game]));
        tournament!.publishedGames = tournament!.publishedGames.map((published) => {
          const current = drafts.get(published.id);
          return current ? { ...published, homeId: current.homeId, awayId: current.awayId, homeScore: current.homeScore, awayScore: current.awayScore, winnerId: current.winnerId, status: current.needsResolution ? "postponed" : current.status, needsResolution: current.needsResolution, version: current.version } : published;
        });
        if (changed.length) notify("Competition updated", `${tournament!.name}: results and bracket updated.`, changed);
      }
      break;
    }
    case "game_status": {
      if (["final", "forfeit", "bye"].includes(game!.status)) throw new DomainError("A completed game cannot change operational status.");
      if (command.status === "in_progress" && (!game!.homeId || !game!.awayId || !game!.start || !game!.fieldId || game!.needsResolution)) throw new DomainError("Resolve both participants and assign a field and time before starting this game.");
      game!.status = command.status; game!.version++;
      const published = tournament!.publishedGames.find((published) => published.id === game!.id);
      if (published) { published.status = game!.status; published.version = game!.version; }
      notify("Game status changed", `${game!.label}: ${command.status.replaceAll("_", " ")}.`, [game!.homeId, game!.awayId].filter((id): id is string => !!id)); break;
    }
    case "announce": {
      const contacts = command.data.contactIds.length ? tournament!.contacts.filter((contact) => command.data.contactIds.includes(contact.id)) : tournament!.contacts;
      if (!contacts.length) throw new DomainError("No contacts match the selected audience.");
      const announcementId = id();
      state.announcements.unshift({ ...command.data, id: announcementId, tournamentId: tournament!.id, sentAt: now, recipientCount: contacts.length });
      const emailRecipients = [...new Set([...tournament!.followers, ...contacts.map((contact) => contact.email)])];
      if (emailRecipients.length) state.inviteJobs.unshift({ id: id(), tournamentId: tournament!.id, kind: "announcement", announcementId, status: "queued", createdAt: now, completedAt: null, recipientCount: emailRecipients.length, error: null });
      break;
    }
    case "follow_tournament": {
      if (tournament!.followers.length >= 500) throw new DomainError("This tournament has reached its follower limit.", 422);
      if (!tournament!.followers.includes(command.email)) tournament!.followers.push(command.email);
      break;
    }
    case "message": state.messages.push({ id: id(), tournamentId: tournament!.id, registrationId: registration!.id, sender: "manager", body: command.body, sentAt: now }); break;
    case "read_notifications": state.notifications.forEach((notification) => { notification.read = true; }); break;
    case "update_organization":
      state.organization.name = command.name;
      if (command.avatarUrl !== undefined) state.organization.avatarUrl = command.avatarUrl;
      if (command.logoUrl !== undefined) state.organization.logoUrl = command.logoUrl;
      if (command.replyToEmail !== undefined) state.organization.replyToEmail = command.replyToEmail || null;
      break;
    case "update_fee_mode": state.organization.feeMode = command.feeMode; break;
    case "record_stripe_account": state.organization.stripeConnectAccountId = command.stripeConnectAccountId; state.organization.stripeOnboardingComplete = false; break;
    case "update_stripe_onboarding": state.organization.stripeOnboardingComplete = command.complete; break;
    case "record_payment_intent":
      registration!.stripePaymentIntentId = command.paymentIntentId; registration!.platformFeeCents = command.platformFeeCents; registration!.amountCents = command.totalChargedCents; registration!.paymentStatus = "processing";
      break;
    case "record_payment_status": {
      if (registration!.stripePaymentIntentId !== command.paymentIntentId) throw new DomainError("Payment intent does not match this registration.", 409);
      registration!.paymentStatus = command.status;
      if (command.status === "paid") notify("Payment received", `${registration!.teamName}: entry fee paid.`, [registration!.id]);
      break;
    }
    case "refund_registration": {
      if (command.amountCents > registration!.amountCents - registration!.refundedCents) throw new DomainError("Refund amount exceeds the amount paid.", 422);
      registration!.refundedCents += command.amountCents; registration!.stripeRefundId = command.stripeRefundId;
      registration!.paymentStatus = registration!.refundedCents >= registration!.amountCents ? "refunded" : "partially_refunded";
      notify("Refund issued", `${registration!.teamName}: refunded.`, [registration!.id]);
      break;
    }
    case "record_invoice_sent":
      registration!.stripeCustomerId = command.stripeCustomerId; registration!.stripeInvoiceId = command.stripeInvoiceId; registration!.invoiceSentAt = now;
      break;
    case "record_invoice_status": {
      if (registration!.stripeInvoiceId !== command.stripeInvoiceId) throw new DomainError("Invoice does not match this registration.", 409);
      if (command.status === "paid") {
        registration!.paymentStatus = "paid";
        if (command.paymentIntentId) registration!.stripePaymentIntentId = command.paymentIntentId;
        notify("Payment received", `${registration!.teamName}: entry fee paid.`, [registration!.id]);
      } else if (command.status === "failed") registration!.paymentStatus = "failed";
      else if (command.status === "voided") registration!.paymentStatus = "unpaid";
      break;
    }
  }
  state.audit.unshift({ id: id(), action: command.type, entityId: game?.id ?? registration?.id ?? tournament?.id ?? "organization", at: now, detail: command.type === "move_game" && command.force ? command.reason : command.type.replaceAll("_", " ") });
  state.revision++;
  return state;
}