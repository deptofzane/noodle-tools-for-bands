'use client';

import { useState, type ReactNode } from 'react';

export interface SettingsTab {
  id: string;
  label: string;
  content: ReactNode;
}

/**
 * Client tab switcher for the Settings page. Panel content is rendered on
 * the server and passed in as `content`, so server-only bits (session data,
 * server-action forms like Sign out) keep working inside the tabs.
 */
export function SettingsTabs({
  tabs,
  initialTabId,
}: {
  tabs: SettingsTab[];
  initialTabId?: string;
}) {
  const [active, setActive] = useState(
    initialTabId && tabs.some((t) => t.id === initialTabId)
      ? initialTabId
      : (tabs[0]?.id ?? ''),
  );
  const current = tabs.find((t) => t.id === active) ?? tabs[0];

  return (
    <div className="flex flex-col gap-6">
      <div
        role="tablist"
        aria-label="Settings sections"
        className="flex gap-1 border-b border-neutral-200 dark:border-neutral-800"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active === tab.id}
            onClick={() => setActive(tab.id)}
            className={
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ' +
              (active === tab.id
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200')
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div role="tabpanel">{current?.content}</div>
    </div>
  );
}
