'use client';

import { useState } from 'react';
import { Select } from '../../Select';

/** The kinds offered up front. Anything else is typed in as a custom one. */
export const EVENT_TYPE_PRESETS = ['Show', 'Practice', 'Writing session'];

/** Sentinel for the "type your own" option — not a value that gets saved. */
const CUSTOM = '__custom__';

/** Matches the API's bound on a saved type. */
const MAX_LENGTH = 40;

/**
 * What kind of event this is: a dropdown of the common ones plus "Custom…",
 * which swaps in a text box for a band's own wording. The value is always the
 * plain string that gets saved ('' for none), so callers don't have to know
 * which of the two inputs produced it.
 *
 * An event already carrying a type that isn't a preset (a custom one, or a
 * preset we later rename) opens in custom mode showing that text, so editing
 * an event never silently rewrites its type.
 */
export function EventTypeField({
  value,
  onChange,
  fieldClass,
}: {
  value: string;
  onChange: (value: string) => void;
  /** The form's shared input styling. */
  fieldClass: string;
}) {
  const [custom, setCustom] = useState(
    () => value !== '' && !EVENT_TYPE_PRESETS.includes(value),
  );

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="event-type" className="text-sm font-medium">
        Event type
      </label>
      <Select
        id="event-type"
        value={custom ? CUSTOM : value}
        onChange={(v) => {
          if (v === CUSTOM) {
            // Start the custom box empty rather than carrying a preset over.
            setCustom(true);
            onChange('');
          } else {
            setCustom(false);
            onChange(v);
          }
        }}
        options={[
          { value: '', label: 'None' },
          ...EVENT_TYPE_PRESETS.map((t) => ({ value: t, label: t })),
          { value: CUSTOM, label: 'Custom…' },
        ]}
      />
      {custom && (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. Recording session"
          aria-label="Custom event type"
          maxLength={MAX_LENGTH}
          autoFocus
          className={`${fieldClass} mt-1`}
        />
      )}
    </div>
  );
}
