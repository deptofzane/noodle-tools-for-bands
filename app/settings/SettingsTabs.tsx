'use client';

import { useState, type ReactNode } from 'react';
import { TabStrip } from '../TabStrip';

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
      <TabStrip label="Settings sections" activeKey={active}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            data-tab-key={tab.id}
            aria-selected={active === tab.id}
            onClick={() => setActive(tab.id)}
            className={
              '-mb-px shrink-0 whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-sm font-medium transition ' +
              (active === tab.id
                ? 'text-blue-600 dark:text-blue-400'
                : 'minor-text-theme-colors hover:text-neutral-800 dark:hover:text-neutral-200')
            }
          >
            {tab.label}
          </button>
        ))}
      </TabStrip>

      <div role="tabpanel">{current?.content}</div>
    </div>
  );
}
