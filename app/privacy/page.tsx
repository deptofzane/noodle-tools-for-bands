import type { Metadata } from 'next';
import { PrivacyPolicy } from '../PrivacyPolicy';
import { POLICY_UPDATED } from '../legal';

export const metadata: Metadata = {
  title: 'Privacy policy',
  description: 'What Noodle collects, why, and how to get rid of it.',
};

/**
 * Public privacy policy.
 *
 * Required twice over: the Play listing needs a reachable URL, and so does
 * Google OAuth verification. Signed out on purpose — a reviewer, or someone
 * deciding whether to sign up, has to be able to read it. Keep this URL
 * stable for that reason; About shows the same text, but the submissions
 * point here.
 *
 * The text lives in `PrivacyPolicy` so this page and About can't drift.
 */
export default function PrivacyPage() {
  return (
    <main className="main-container flex flex-col gap-6 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="title-text">Privacy policy</h1>
        <p className="text-sm minor-text-theme-colors">
          Last updated {POLICY_UPDATED}
        </p>
      </div>

      <PrivacyPolicy />
    </main>
  );
}
