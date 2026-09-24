import { describe, expect, it } from "vitest";
import { applyCommand, publicTournament } from "@season/core";
import { randomUUID } from "node:crypto";
import { createDemo } from "./seed";

const context = { now: "2026-09-26T15:00:00Z", id: randomUUID };
describe("workspace operations", () => {
  it("creates valid sample data and strips all private fields from public payloads", () => {
    const state = createDemo();
    const payload = JSON.stringify(publicTournament(state.tournaments[0]!));
    for (const forbidden of ["players", "birthdate", "coachEmail", "coachName", "documents", "Sample 1", "example.test"]) expect(payload).not.toContain(forbidden);
  });
  it("rejects stale score versions without mutating the original workspace", () => {
    const state = createDemo();
    const tournament = state.tournaments[0]!;
    const game = tournament.games.find((game) => game.homeId && game.awayId)!;
    expect(() => applyCommand(state, { type: "score_game", tournamentId: tournament.id, gameId: game.id, version: game.version + 1, homeScore: 3, awayScore: 0, forfeit: false }, context)).toThrow("Refresh");
    expect(state.revision).toBe(0);
  });
  it("approves a roster and leaves an audit trail for valid check-in", () => {
    const state = createDemo();
    const approved = applyCommand(state, { type: "approve_roster", tournamentId: "autumn-cup", registrationId: "reg-3" }, context);
    expect(approved.tournaments[0]?.registrations[2]?.rosterApproved).toBe(true);
    expect(approved.audit[0]?.action).toBe("approve_roster");
    const next = applyCommand(state, { type: "check_in", tournamentId: "autumn-cup", registrationId: "reg-2", status: "checked_in" }, context);
    expect(next.tournaments[0]?.registrations[1]?.checkIn).toBe("checked_in");
    expect(next.audit[0]?.action).toBe("check_in");
    expect(next.revision).toBe(1);
    expect(state.tournaments[0]?.registrations[1]?.checkIn).toBe("not_checked_in");
  });
  it("publishes no duplicate notifications when nothing moved", () => {
    const state = createDemo();
    const next = applyCommand(state, { type: "publish_schedule", tournamentId: "autumn-cup" }, context);
    expect(next.notifications.length).toBe(state.notifications.length);
  });
  it("registers a new team without claiming a real payment occurred", () => {
    const state = createDemo();
    const next = applyCommand(state, { type: "register_team", tournamentId: "winter-classic", data: { divisionId: "division-1", teamName: "Test Club", clubName: "Test", city: "Austin", coachName: "Test Coach", coachEmail: "coach@example.test" } }, context);
    expect(next.tournaments[1]?.registrations[0]?.paymentStatus).toBe("unpaid");
  });
  it("does not start unresolved bracket games", () => {
    const state = createDemo();
    const tournament = state.tournaments[0]!;
    const game = tournament.games.find((game) => !game.homeId || !game.awayId)!;
    expect(() => applyCommand(state, { type: "game_status", tournamentId: tournament.id, gameId: game.id, version: game.version, status: "in_progress" }, context)).toThrow("Resolve both participants");
    expect(game.status).not.toBe("in_progress");
  });
});