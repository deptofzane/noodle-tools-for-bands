'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

// Measure before paint in the browser; a plain effect on the server avoids
// React's useLayoutEffect-during-SSR warning.
const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * A row of tabs with an underline that slides to whichever is selected.
 *
 * The tabs are content-width and the strip scrolls horizontally, so the
 * underline can't be expressed in CSS alone — it's measured from the selected
 * button and moved with a transform. Children stay the caller's business
 * (Overview's chat tab carries an unread badge); they just need
 * `data-tab-key`, which is how the strip finds the one to sit under.
 *
 * Each button should keep `border-b-2 border-transparent` so the row's height
 * doesn't shift — the coloured line is this indicator, not the button.
 */
export function TabStrip({
  label,
  activeKey,
  children,
}: {
  /** Names the tablist for assistive tech. */
  label: string;
  /** Must match the selected button's `data-tab-key`. */
  activeKey: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ left: number; width: number } | null>(null);

  useIsomorphicLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;

    const measure = () => {
      const el = root.querySelector<HTMLElement>(
        `[data-tab-key="${CSS.escape(activeKey)}"]`,
      );
      // Offsets are in the strip's own content coordinates, so they stay
      // correct while it's scrolled — the indicator scrolls with the tabs.
      if (el) setBox({ left: el.offsetLeft, width: el.offsetWidth });
    };

    measure();
    // Labels change width when a badge appears, and again when a webfont
    // lands; both resize the strip rather than firing anything else.
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, [activeKey, children]);

  return (
    <div
      ref={ref}
      role="tablist"
      aria-label={label}
      className="relative flex gap-1 overflow-x-auto border-b border-line"
    >
      {children}
      {/* Rendered only once measured, so it mounts already in place — there's
          no first-paint slide in from the left. `-bottom-px` puts it over the
          strip's own border, where the buttons' `-mb-px` used to place it. */}
      {box && (
        <span
          aria-hidden="true"
          style={{ transform: `translateX(${box.left}px)`, width: box.width }}
          className="pointer-events-none absolute -bottom-px left-0 h-0.5 bg-blue-600 transition-[transform,width] duration-200 ease-out motion-reduce:transition-none"
        />
      )}
    </div>
  );
}
