import { Resend } from "resend";

const FROM_ADDRESS = "Season <notifications@season.com>";

// Falls back to logging when RESEND_API_KEY is not configured.
export async function sendRegistrationDecisionEmail(options: { to: string; replyTo: string | null; subject: string; body: string }) {
  const { to, replyTo, subject, body } = options;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[email] RESEND_API_KEY is not set. Logging registration email to ${to} instead of sending:`);
    console.log(`[email]   Subject: ${subject}`);
    console.log(`[email]   Body: ${body}`);
    return;
  }
  const resend = new Resend(apiKey);
  const html = body.split(/\n{2,}/).map((paragraph) => `<p>${paragraph.replaceAll("\n", "<br />")}</p>`).join("");
  const { error } = await resend.emails.send({ from: FROM_ADDRESS, to, subject, html, text: body, ...(replyTo ? { replyTo } : {}) });
  if (error) throw new Error(error.message);
}
