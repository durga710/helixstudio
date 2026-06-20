/**
 * Minimal transactional email via Resend's REST API — no SDK dependency, just
 * fetch. If RESEND_API_KEY isn't set, sending is a logged no-op (so dev works
 * without an email provider; the reset route also surfaces the link in dev).
 *
 * Env: RESEND_API_KEY (required to actually send), EMAIL_FROM (optional, defaults
 * to Resend's shared onboarding sender).
 */

type SendArgs = { to: string; subject: string; html: string; text: string };

const FROM = process.env.EMAIL_FROM ?? "Helix Studio <onboarding@resend.dev>";

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendEmail(args: SendArgs): Promise<{ delivered: boolean }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(`[email] RESEND_API_KEY unset — not sending "${args.subject}" to ${args.to}`);
    return { delivered: false };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [args.to], subject: args.subject, html: args.html, text: args.text }),
    });
    if (!res.ok) {
      console.error("[email] resend error", res.status, await res.text().catch(() => ""));
      return { delivered: false };
    }
    return { delivered: true };
  } catch (e) {
    console.error("[email] send failed", e);
    return { delivered: false };
  }
}

/** The email-verification body (matches the dark Helix brand). */
export function verifyEmail(link: string): { subject: string; html: string; text: string } {
  const subject = "Verify your Helix Studio email";
  const text =
    `Welcome to Helix Studio! Confirm your email to activate your account (link valid for 24 hours):\n\n${link}\n\n` +
    `If you didn't create an account, you can ignore this email.`;
  const html = `<!doctype html><html><body style="margin:0;background:#070b12;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:480px;margin:0 auto;padding:40px 24px;color:#f8fbff">
    <div style="font-size:20px;font-weight:800;letter-spacing:-0.02em">HELIX <span style="font-weight:600;letter-spacing:0.34em;font-size:11px;color:#9cadc4">STUDIO</span></div>
    <h1 style="font-size:20px;margin:28px 0 8px">Confirm your email</h1>
    <p style="color:#9cadc4;font-size:14px;line-height:1.6;margin:0 0 24px">Click below to activate your account. This link expires in 24 hours.</p>
    <a href="${link}" style="display:inline-block;background:#2f81f7;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:10px">Verify email</a>
    <p style="color:#5f6f86;font-size:12px;line-height:1.6;margin:28px 0 0">If you didn't sign up, ignore this email.<br>Or paste this link into your browser:<br><span style="color:#9cadc4;word-break:break-all">${link}</span></p>
  </div></body></html>`;
  return { subject, html, text };
}

/** The password-reset email body (matches the dark Helix brand). */
export function passwordResetEmail(link: string): { subject: string; html: string; text: string } {
  const subject = "Reset your Helix Studio password";
  const text =
    `Reset your Helix Studio password using the link below (valid for 1 hour):\n\n${link}\n\n` +
    `If you didn't request this, you can safely ignore this email — your password won't change.`;
  const html = `<!doctype html><html><body style="margin:0;background:#070b12;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:480px;margin:0 auto;padding:40px 24px;color:#f8fbff">
    <div style="font-size:20px;font-weight:800;letter-spacing:-0.02em">HELIX <span style="font-weight:600;letter-spacing:0.34em;font-size:11px;color:#9cadc4">STUDIO</span></div>
    <h1 style="font-size:20px;margin:28px 0 8px">Reset your password</h1>
    <p style="color:#9cadc4;font-size:14px;line-height:1.6;margin:0 0 24px">Click the button below to set a new password. This link expires in 1 hour.</p>
    <a href="${link}" style="display:inline-block;background:#2f81f7;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:10px">Reset password</a>
    <p style="color:#5f6f86;font-size:12px;line-height:1.6;margin:28px 0 0">If you didn't request this, ignore this email — your password won't change.<br>Or paste this link into your browser:<br><span style="color:#9cadc4;word-break:break-all">${link}</span></p>
  </div></body></html>`;
  return { subject, html, text };
}
