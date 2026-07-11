import { Resend } from 'resend';

/**
 * Transactional email via Resend. If `RESEND_API_KEY` isn't set (e.g. local
 * dev), the send is skipped and the link is logged instead — so the flow is
 * still testable and the caller can safely always report success.
 */
const FROM = process.env.EMAIL_FROM ?? 'Sidestage <onboarding@resend.dev>';

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
  const resend = new Resend(apiKey);
  await resend.emails.send({
    from: FROM,
    to,
    subject: 'Reset your Sidestage password',
    text: `Reset your Sidestage password:\n${resetUrl}\n\nThis link expires in 30 minutes. If you didn't request it, you can ignore this email.`,
    html: `<p>Reset your Sidestage password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>This link expires in 30 minutes. If you didn't request it, you can ignore this email.</p>`,
  });
}
