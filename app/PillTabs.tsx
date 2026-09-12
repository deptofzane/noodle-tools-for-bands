'use client';

export interface PillTab {
  key: string;
  label: string;
  /** Shown as a count beside the label. Hidden at 0, and on the open tab. */
  badge?: number;
}

/**
 * A centred row of pills for switching between panels.
 *
 * Presentational: it owns no selection of its own, because the two callers
 * keep theirs in different places — Home remembers the tab per device, while
 * Scheduling reads it from the URL so its pills can be linked to.
 *
 * A badge is hidden while its own tab is open, since the count is about what
 * you *aren't* looking at; on Home, leaving it up would light a number on the
 * page you're already reading.
 *
 * `activeKey` matching nothing is a valid state, not a bug: Home renders with
 * no pill selected for the frame before the remembered tab is known.
 */
export function PillTabs({
  label,
  idPrefix,
  controls,
  tabs,
  activeKey,
  onChange,
}: {
  /** Names the tablist for assistive tech. */
  label: string;
  /** Prefix for each tab's own id, so the panel can point back at it. */
  idPrefix: string;
  /** Id of the panel these tabs drive. */
  controls: string;
  tabs: PillTab[];
  activeKey: string;
  onChange: (key: string) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="mx-auto inline-flex gap-1 rounded-full border border-line p-1"
    >
      {tabs.map((t) => {
        const selected = activeKey === t.key;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`${idPrefix}-${t.key}`}
            aria-selected={selected}
            aria-controls={controls}
            onClick={() => onChange(t.key)}
            className={
              'flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition ' +
              (selected
                ? 'bg-accent-fill text-accent'
                : 'minor-text-theme-colors hover:bg-surface-hover')
            }
          >
            {t.label}
            {!selected && (t.badge ?? 0) > 0 && (
              <span className="rounded-full bg-blue-600 px-1.5 text-[0.625rem] font-semibold leading-4 text-white">
                {t.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
