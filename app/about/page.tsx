import type { Metadata } from 'next';
import { PrivacyPolicy } from '../PrivacyPolicy';
import { TermsOfService } from '../TermsOfService';
import { CONTACT_EMAIL, POLICY_UPDATED, TERMS_UPDATED } from '../legal';

export const metadata: Metadata = {
  title: 'About',
  description: 'What Noodle is, how to get in touch, and the legal detail.',
};

/**
 * About: what the app is, how to reach a person, and both legal documents in
 * full.
 *
 * The policy and terms are rendered from the same components as their own
 * pages rather than restated — one text, two places it can be read. `/privacy`
 * stays the URL Play and Google were given, so it keeps existing separately.
 *
 * Public, for the same reason those are: someone deciding whether to sign up,
 * or reviewing the listing, has to be able to read this without an account.
 */
export default function AboutPage() {
  return (
    <main className="main-container flex flex-col gap-8 py-8">
      <div className="flex flex-col gap-2">
        <h1 className="title-text">About Noodle</h1>
        <p className="text-sm leading-relaxed text-fg-soft">
          Noodle is a tool for bands: one place for the recordings you make, the
          charts you play from, the notes you leave each other, and the dates
          you have to remember. Bands are private, there is no advertising, and
          nothing here is public or discoverable.
        </p>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-medium">Contact</h2>
        <p className="text-sm leading-relaxed text-fg-soft">
          Questions, problems, a request about your data, or a copyright concern
          — write to{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="underline">
            {CONTACT_EMAIL}
          </a>
          . It reaches a person, not a queue.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1 border-t border-line pt-6">
          <h2 className="title-text text-xl">Privacy policy</h2>
          <p className="text-sm minor-text-theme-colors">
            Last updated {POLICY_UPDATED}
          </p>
        </div>
        {/* Nested under a heading of its own, so its sections drop to h3. */}
        <PrivacyPolicy level={3} />
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1 border-t border-line pt-6">
          <h2 className="title-text text-xl">Terms of service</h2>
          <p className="text-sm minor-text-theme-colors">
            Last updated {TERMS_UPDATED}
          </p>
        </div>
        <TermsOfService level={3} />
      </section>
    </main>
  );
}
