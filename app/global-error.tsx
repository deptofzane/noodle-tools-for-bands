'use client';

import { useEffect } from 'react';

/**
 * Last-resort boundary: catches errors thrown by the root layout itself,
 * which `app/error.tsx` can't — it renders *inside* that layout.
 *
 * Because the layout is what failed, this replaces the whole document: no
 * `globals.css` (so no Tailwind, including every `dark:` variant), and none of
 * the layout's pre-paint scripts. In particular the one that puts the `dark`
 * class on `<html>` never runs, so the theme has to be re-established here or
 * the screen flips to light at the worst possible moment.
 *
 * It's done in CSS off `prefers-color-scheme`, which needs no script and can't
 * flash. The app pins the OS preference to localStorage on first run, so that
 * matches the user's theme unless they deliberately chose against their OS —
 * and `data-theme`, read from storage below, covers that case.
 */
const STYLES = `
:root {
  color-scheme: light;
  --bg: #ffffff;
  --fg: #171717;
  --muted: #666666;
  --faint: #999999;
}
@media (prefers-color-scheme: dark) {
  :root {
    color-scheme: dark;
    --bg: #0a0a0a;
    --fg: #f5f5f5;
    --muted: #a3a3a3;
    --faint: #737373;
  }
}
:root[data-theme='light'] {
  color-scheme: light;
  --bg: #ffffff;
  --fg: #171717;
  --muted: #666666;
  --faint: #999999;
}
:root[data-theme='dark'] {
  color-scheme: dark;
  --bg: #0a0a0a;
  --fg: #f5f5f5;
  --muted: #a3a3a3;
  --faint: #737373;
}
`;

/** The theme the user chose, or undefined on the server / with no choice. */
function storedTheme(): 'light' | 'dark' | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const v = localStorage.getItem('theme');
    return v === 'dark' || v === 'light' ? v : undefined;
  } catch {
    return undefined;
  }
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[global error]', error);
  }, [error]);

  return (
    <html lang="en" data-theme={storedTheme()}>
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg)',
          color: 'var(--fg)',
          fontFamily:
            'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          padding: '1.5rem',
        }}
      >
        <style dangerouslySetInnerHTML={{ __html: STYLES }} />
        <div style={{ maxWidth: '28rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.5rem', margin: '0 0 0.5rem' }}>
            Sidestage couldn’t start
          </h1>
          <p
            style={{
              color: 'var(--muted)',
              margin: '0 0 1rem',
              lineHeight: 1.5,
            }}
          >
            Something failed before the app could load. Reloading usually clears
            it.
          </p>
          {error.digest && (
            <p
              style={{
                color: 'var(--faint)',
                fontFamily: 'ui-monospace, monospace',
                fontSize: '0.75rem',
                margin: '0 0 1rem',
              }}
            >
              Reference: {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            style={{
              background: '#2563eb',
              color: '#ffffff',
              border: 0,
              borderRadius: '0.375rem',
              padding: '0.75rem 1.25rem',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
