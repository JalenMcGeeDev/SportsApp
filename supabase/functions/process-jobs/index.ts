import { generateCompetition, generateSchedule, validateSchedule } from "@season/core";
import { mutateWorkspace, readWorkspace } from "@season/data";
import type { Announcement, Tournament } from "@season/types";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { sendAnnouncementEmail, sendSpectatorInvites } from "./email.ts";

// Invoked per-org by the "season-dispatch-jobs" pg_cron job (see supabase/migrations),
// running job dispatch as a Vercel-deployable Edge Function instead of a standalone Node process.
Deno.serve(async (request) => {
  try {
    const { orgId } = await request.json();
    if (typeof orgId !== "string" || !orgId) return new Response(JSON.stringify({ error: "orgId is required" }), { status: 400 });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const snapshot = await readWorkspace(supabase, orgId);
    await processScheduleRun(supabase, orgId, snapshot.runs.find((run) => run.status === "queued")?.id);
    await processInviteJob(supabase, orgId, snapshot.inviteJobs.find((job) => job.status === "queued")?.id);
    return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
  } catch (error) {
    console.error("process-jobs failed:", error instanceof Error ? error.message : "Unknown error");
    return new Response(JSON.stringify({ error: "Failed to process jobs" }), { status: 500 });
  }
});

async function processScheduleRun(supabase: SupabaseClient, orgId: string, queuedId: string | undefined) {
  if (!queuedId) return;
  let tournament: Tournament | undefined;
  let seed = 0;
  await mutateWorkspace(supabase, orgId, (state) => {
    const run = state.runs.find((run) => run.id === queuedId);
    if (!run || run.status !== "queued") return state;
    run.status = "running"; state.revision++;
    tournament = structuredClone(state.tournaments.find((item) => item.id === run.tournamentId));
    seed = run.seed;
    return state;
  });
  if (!tournament) return;
  try {
    const source = tournament as Tournament;
    const fingerprint = JSON.stringify(source);
    if (!source.games.length) source.games = source.divisions.flatMap((division) => generateCompetition(division, source.registrations));
    const result = generateSchedule(source, seed);
    const violations = validateSchedule({ ...source, games: result.games });
    if (violations.length) throw new Error(violations.map((issue) => issue.message).join(" "));
    await mutateWorkspace(supabase, orgId, (state) => {
      const current = state.tournaments.find((item) => item.id === source.id)!;
      if (JSON.stringify(current) !== fingerprint) throw new Error("Tournament changed while scheduling. Run the scheduler again.");
      current.games = result.games;
      const run = state.runs.find((run) => run.id === queuedId)!;
      run.status = "succeeded"; run.completedAt = new Date().toISOString(); run.unplacedCount = result.unplaced.length; run.violations = result.violations;
      state.revision++; return state;
    });
  } catch (error) {
    await mutateWorkspace(supabase, orgId, (state) => {
      const run = state.runs.find((run) => run.id === queuedId)!;
      run.status = "failed"; run.completedAt = new Date().toISOString(); run.violations = [error instanceof Error ? error.message : "Schedule generation failed"];
      state.revision++; return state;
    });
  }
}

async function processInviteJob(supabase: SupabaseClient, orgId: string, queuedId: string | undefined) {
  if (!queuedId) return;
  let tournament: Tournament | undefined;
  let organizationSlug = "";
  let kind: "registration_open" | "schedule_published" | "announcement" = "schedule_published";
  let announcement: Announcement | undefined;
  await mutateWorkspace(supabase, orgId, (state) => {
    const job = state.inviteJobs.find((job) => job.id === queuedId);
    if (!job || job.status !== "queued") return state;
    job.status = "running"; state.revision++;
    tournament = structuredClone(state.tournaments.find((item) => item.id === job.tournamentId));
    organizationSlug = state.organization.slug;
    kind = job.kind;
    if (job.kind === "announcement") announcement = state.announcements.find((item) => item.id === job.announcementId);
    return state;
  });
  if (!tournament) return;
  try {
    if (kind === "announcement") {
      if (!announcement) throw new Error("Announcement not found");
      const contactEmails = tournament.contacts.filter((contact) => !announcement!.contactIds.length || announcement!.contactIds.includes(contact.id)).map((contact) => contact.email);
      const recipients = [...new Set([...tournament.followers, ...contactEmails])];
      await sendAnnouncementEmail(tournament, organizationSlug, recipients, announcement.subject, announcement.body);
    } else {
      await sendSpectatorInvites(tournament, organizationSlug, tournament.invitees, kind);
    }
    await mutateWorkspace(supabase, orgId, (state) => {
      const job = state.inviteJobs.find((job) => job.id === queuedId)!;
      job.status = "succeeded"; job.completedAt = new Date().toISOString();
      const current = state.tournaments.find((item) => item.id === tournament!.id);
      if (current && job.kind !== "announcement") { if (job.kind === "registration_open") current.registrationInvitesSentAt = job.completedAt; else current.invitesSentAt = job.completedAt; }
      state.revision++; return state;
    });
  } catch (error) {
    await mutateWorkspace(supabase, orgId, (state) => {
      const job = state.inviteJobs.find((job) => job.id === queuedId)!;
      job.status = "failed"; job.completedAt = new Date().toISOString(); job.error = error instanceof Error ? error.message : "Failed to send spectator invites";
      state.revision++; return state;
    });
  }
}
