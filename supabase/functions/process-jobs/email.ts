import { Resend } from "resend";
import type { InviteJob, Tournament } from "@season/types";

const publicBaseUrl = Deno.env.get("SEASON_PUBLIC_URL") ?? "http://127.0.0.1:3000";

// Falls back to logging invites when RESEND_API_KEY is not configured.
export async function sendSpectatorInvites(tournament: Tournament, organizationSlug: string, recipients: string[], kind: InviteJob["kind"]) {
  const base = `${publicBaseUrl}/${organizationSlug}/${tournament.slug}`;
  const url = kind === "registration_open" ? `${base}/register` : base;
  const subject = kind === "registration_open" ? `${tournament.name} is open for registration` : `${tournament.name} is live`;
  const html = kind === "registration_open"
    ? `<p><strong>${tournament.name}</strong> is now open for registration.</p><p>Register a team here:</p><p><a href="${url}">${url}</a></p>`
    : `<p><strong>${tournament.name}</strong> is now live.</p><p>Follow the schedule, brackets, and standings here:</p><p><a href="${url}">${url}</a></p>`;
  const text = kind === "registration_open" ? `${tournament.name} is now open for registration. Register here: ${url}` : `${tournament.name} is now live. Follow along: ${url}`;
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    console.log(`[email] RESEND_API_KEY is not set. Logging ${recipients.length} spectator invite(s) for "${tournament.name}" instead of sending:`);
    for (const email of recipients) console.log(`[email]   -> ${email}: ${url}`);
    return;
  }
  const resend = new Resend(apiKey);
  const from = Deno.env.get("EMAIL_FROM") ?? "Season <no-reply@season.app>";
  for (const email of recipients) {
    const { error } = await resend.emails.send({ from, to: email, subject, html, text });
    if (error) throw new Error(error.message);
  }
}

// Sent to public followers (self-subscribed via the tournament details page) whenever a director posts an announcement.
export async function sendAnnouncementEmail(tournament: Tournament, organizationSlug: string, recipients: string[], subject: string, body: string) {
  if (!recipients.length) return;
  const url = `${publicBaseUrl}/${organizationSlug}/${tournament.slug}`;
  const html = `<p><strong>${tournament.name}</strong></p><p>${body.replace(/\n/g, "<br />")}</p><p><a href="${url}">${url}</a></p>`;
  const text = `${tournament.name}\n\n${body}\n\n${url}`;
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    console.log(`[email] RESEND_API_KEY is not set. Logging announcement "${subject}" for ${recipients.length} follower(s) of "${tournament.name}" instead of sending:`);
    for (const email of recipients) console.log(`[email]   -> ${email}`);
    return;
  }
  const resend = new Resend(apiKey);
  const from = Deno.env.get("EMAIL_FROM") ?? "Season <no-reply@season.app>";
  for (const email of recipients) {
    const { error } = await resend.emails.send({ from, to: email, subject, html, text });
    if (error) throw new Error(error.message);
  }
}
