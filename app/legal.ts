/**
 * Facts the public legal pages state, kept in one place so the privacy policy
 * and the deletion page can't drift apart.
 *
 * TODO before publishing: `CONTACT_EMAIL` must be an address someone actually
 * reads. Google's OAuth verification and Play's listing review both send mail
 * to it, and Play policy expects deletion requests to reach a human.
 */
export const CONTACT_EMAIL = 'sidestagesupport@gmail.com';

/** Bump when either page's substance changes, not for wording tweaks. */
export const POLICY_UPDATED = '5 August 2026';
