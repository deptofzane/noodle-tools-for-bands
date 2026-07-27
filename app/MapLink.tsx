/**
 * Renders an address as a link that opens it in a maps app. Uses the Google
 * Maps universal URL, which resolves to the native maps app on
 * Android/iOS (or the browser on desktop). No client JS — safe to use from
 * server or client components.
 */
export function MapLink({
  address,
  className,
}: {
  address: string;
  className?: string;
}) {
  const href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    address,
  )}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={
        className ?? 'text-blue-600 hover:underline dark:text-blue-400'
      }
    >
      {address}
    </a>
  );
}
