'use client';

import { useState } from 'react';

const field =
  'rounded-md border border-line-strong bg-surface px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

/**
 * A password input with a Show/Hide control.
 *
 * Used on login, signup and reset — the last two matter most, since those are
 * the ones where you're typing a password you've never typed before and can't
 * check by muscle memory.
 *
 * The reveal flips the input's `type` rather than swapping elements, so the
 * value survives and the browser's own password manager isn't disturbed. It
 * sits inside the field's box rather than beside it, so a form's inputs stay
 * the same width; `pr-16` keeps typed text clear of it.
 *
 * State is component-local and starts hidden, so a revealed password can't
 * survive a reload.
 */
export function PasswordField({
  value,
  onChange,
  placeholder,
  autoComplete,
  minLength,
  id,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  /** `current-password` when signing in, `new-password` when choosing one. */
  autoComplete: 'current-password' | 'new-password';
  minLength?: number;
  id?: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        minLength={minLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={field + ' w-full pr-16'}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        /*
         * Not in the tab order: tabbing out of a password field should reach
         * the submit button, not a display toggle. It stays clickable, and
         * carries its state for anyone who navigates to it directly.
         */
        tabIndex={-1}
        aria-pressed={visible}
        aria-label={visible ? 'Hide password' : 'Show password'}
        className="absolute inset-y-0 right-0 px-3 text-xs font-medium text-fg-muted hover:text-fg-strong"
      >
        {visible ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}
