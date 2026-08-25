import { Resend } from 'resend';

/**
 * Transactional email via Resend. If `RESEND_API_KEY` isn't set (e.g. local
 * dev), the send is skipped and the link is logged instead — so the flow is
 * still testable and the caller can safely always report success.
 */

/**
 * Resend's sandbox sender. It only delivers to the address that owns the
 * Resend account, so leaving `EMAIL_FROM` unset in production means every
 * reset email is accepted, reported as sent, and read by nobody.
 */
const RESEND_SANDBOX_FROM = 'Noodle <onboarding@resend.dev>';
const FROM = process.env.EMAIL_FROM ?? RESEND_SANDBOX_FROM;

export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(
      `[email] RESEND_API_KEY unset — password reset link for ${to}: ${resetUrl}`,
    );
    return;
  }

  // The single likeliest misconfiguration, and invisible without saying so:
  // the send succeeds, so nothing downstream looks wrong.
  if (FROM === RESEND_SANDBOX_FROM && process.env.NODE_ENV === 'production') {
    console.warn(
      '[email] EMAIL_FROM is unset, so mail is being sent from Resend’s ' +
        'sandbox address. It only delivers to the Resend account owner — ' +
        'set EMAIL_FROM to an address on a domain verified in Resend.',
    );
  }

  const resend = new Resend(apiKey);
  /*
   * Resend does NOT throw on API errors — `send` resolves to
   * `{ data, error: null } | { data: null, error }`. Ignoring the result is
   * why a rejected send (unverified domain, bad From, rate limit) used to be
   * indistinguishable from a delivered one: no exception, nothing logged, and
   * the route above answers 200 either way for enumeration safety.
   *
   * Throwing hands it to that route's existing catch, which logs it. The
   * caller still returns 200 — the failure belongs in the server log, not in
   * a response that would tell an attacker whether the address exists.
   */
  const { data, error } = await resend.emails.send({
    from: FROM,
    to,
    subject: 'Reset your Noodle password',
    text: `Reset your Noodle password:\n${resetUrl}\n\nThis link expires in 30 minutes. If you didn't request it, you can ignore this email.`,
    html: `<p>Reset your Noodle password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>This link expires in 30 minutes. If you didn't request it, you can ignore this email.</p>`,
  });

  if (error) {
    // `name` and `statusCode` are what distinguish "domain not verified" from
    // "bad key" from "rate limited" — the whole point of surfacing this.
    throw new Error(
      `Resend refused the send (${error.name}${
        error.statusCode ? ` ${error.statusCode}` : ''
      }): ${error.message} — from="${FROM}"`,
    );
  }

  // Rare enough to log every time, and it's the id to quote when someone asks
  // whether their reset email was actually sent.
  console.info(`[email] password reset sent to ${to} (resend id ${data?.id})`);
}
