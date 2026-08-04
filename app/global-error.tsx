'use client';

import { useEffect } from 'react';

/**
 * Last-resort boundary: catches errors thrown by the root layout itself,
 * which `app/error.tsx` can't — it renders *inside* that layout.
 *
 * Because the layout is what failed, this replaces the whole document and has
 * to supply its own `<html>`/`<body>`. That also means no Tailwind classes are
 * guaranteed to be applied (the stylesheet is a layout concern), so the few
 * styles here are inline and deliberately plain.
 */
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
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily:
            'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          padding: '1.5rem',
        }}
      >
        <div style={{ maxWidth: '28rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.5rem', margin: '0 0 0.5rem' }}>
            Sidestage couldn’t start
          </h1>
          <p style={{ color: '#666', margin: '0 0 1rem', lineHeight: 1.5 }}>
            Something failed before the app could load. Reloading usually clears
            it.
          </p>
          {error.digest && (
            <p
              style={{
                color: '#999',
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
              color: '#fff',
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
