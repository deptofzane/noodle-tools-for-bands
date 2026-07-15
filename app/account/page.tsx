import { redirect } from 'next/navigation';

/**
 * The account screen moved into the Settings page as its "Account" tab.
 * This route is kept as a redirect so old links/bookmarks still work.
 */
export default function AccountPage() {
  redirect('/settings?tab=account');
}
