'use client';

import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

// Measure before paint on the client (so the menu never flashes in the wrong
// spot); plain effect on the server avoids the useLayoutEffect SSR warning.
const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * Small kebab (⋯) dropdown for row-level actions. Closes on outside click
 * or Escape, and after any item is chosen. `icon`, `triggerClassName` and
 * `align` let it serve as a general dropdown elsewhere; left alone it's the
 * kebab. Pair with `ActionMenuItem` for consistently styled entries:
 *
 *   <ActionMenu label="Song actions">
 *     <ActionMenuItem destructive onClick={...}>Delete</ActionMenuItem>
 *   </ActionMenu>
 */
export function ActionMenu({
  children,
  label = 'Actions',
  disabled = false,
  icon,
  triggerClassName,
  align = 'right',
}: {
  children: ReactNode;
  label?: string;
  disabled?: boolean;
  /** Trigger glyph. Defaults to the kebab. */
  icon?: ReactNode;
  /** Replaces the trigger's styling wholesale, for menus outside table rows. */
  triggerClassName?: string;
  /**
   * Which edge the menu hangs from. `right` (the default) suits a trigger at
   * the end of a row; `left` is for one near the left edge of the screen,
   * where a right-hung menu would run off it.
   */
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // When opening, flip the dropdown above the trigger if it would overflow the
  // bottom of the viewport and there's more room above (e.g. rows near the
  // bottom of the screen). The fixed nav bar covers one edge of the viewport
  // (bottom on mobile, top on desktop), so whichever edge it's on doesn't
  // count as usable space. Runs before paint, so there's no visible jump.
  useIsomorphicLayoutEffect(() => {
    if (!open) return;
    const menu = menuRef.current;
    const trigger = ref.current;
    if (!menu || !trigger) return;
    const t = trigger.getBoundingClientRect();
    const nav = document.getElementById('app-nav')?.getBoundingClientRect();
    const topEdge = nav && nav.top <= 0 ? nav.bottom : 0;
    const bottomEdge =
      nav && nav.bottom >= window.innerHeight ? nav.top : window.innerHeight;
    const spaceBelow = bottomEdge - t.bottom;
    const spaceAbove = t.top - topEdge;
    setOpenUp(spaceBelow < menu.offsetHeight + 8 && spaceAbove > spaceBelow);
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        className={
          triggerClassName ??
          'rounded-md px-4 py-3 md:px-2 md:py-1 my-1 minor-text-theme-colors hover:text-fg-strong disabled:opacity-50 hover:bg-surface-hover'
        }
      >
        {icon ?? <span aria-hidden="true">⋯</span>}
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          onClick={() => setOpen(false)}
          className={
            'absolute z-50 min-w-52 overflow-hidden rounded-md border py-1.5 shadow-lg sm:py-1 border-line bg-surface ' +
            (align === 'left' ? 'left-0 ' : 'right-0 ') +
            (openUp ? 'bottom-full mb-1' : 'top-full mt-1')
          }
        >
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * Several actions as one row of a menu, split into equal columns.
 *
 * For actions that are variations on one another — play/shuffle, or
 * view/edit/share — where a full-width line each reads as more difference
 * than there is, and the row they'd occupy is worth more than the words.
 *
 * Not `ActionMenuItem`s: those are full-width by definition. Each column keeps
 * `role="menuitem"` so the menu is still structurally a menu, and carries its
 * name in `aria-label`, because a glyph has none. Closing is handled by
 * `ActionMenu` itself, which listens on the container.
 */
export function MenuIconRow({
  items,
}: {
  items: {
    key: string;
    icon: ReactNode;
    /** The accessible name. Say what it acts on, not just the verb. */
    label: string;
    /** Hover text. Short — the label carries the detail. */
    title: string;
    onClick: () => void;
  }[];
}) {
  return (
    <div role="none" className="flex items-stretch">
      {items.map((item, i) => (
        <Fragment key={item.key}>
          {/* A divider between columns, so adjacent glyphs don't read as one
              control. Between, not around — an edge rule would look like the
              menu had been cut. */}
          {i > 0 && (
            <span
              aria-hidden="true"
              className="my-1 w-px shrink-0 bg-fill-strong"
            />
          )}
          <button
            type="button"
            role="menuitem"
            onClick={item.onClick}
            aria-label={item.label}
            title={item.title}
            className="flex flex-1 items-center justify-center px-4 py-3 text-fg-body sm:py-1.5 hover:bg-surface-hover"
          >
            {item.icon}
          </button>
        </Fragment>
      ))}
    </div>
  );
}

/**
 * A heading naming the thing the items under it act on.
 *
 * Exists for menus that act on more than one subject — an event and the
 * setlist attached to it, say. Two `MenuIconRow`s stacked are the same three
 * glyphs twice with nothing to tell them apart, and the words the icons
 * replaced were carrying that distinction.
 *
 * `role="none"` because it isn't an item: arrow keys and the menu's click
 * handler should both pass straight over it.
 */
export function MenuSectionLabel({ children }: { children: ReactNode }) {
  return (
    <div
      role="none"
      className="px-4 pb-0.5 pt-2 text-xs font-semibold uppercase tracking-wide text-fg-muted sm:px-3"
    >
      {children}
    </div>
  );
}

/** A single entry inside an `ActionMenu`. */
export function ActionMenuItem({
  children,
  onClick,
  destructive = false,
  disabled = false,
  title,
}: {
  children: ReactNode;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
  /**
   * Hover text. Worth having on a *disabled* item especially: an action
   * that's greyed out with no explanation reads as broken rather than as
   * something you haven't earned yet.
   */
  title?: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={`block w-full text-nowrap px-4 py-2 sm:py-3 text-left text-base hover:bg-surface-hover sm:px-3 sm:py-1.5 sm:text-sm ${disabled && 'opacity-60'} ${
        destructive
          ? 'text-danger pt-2 border-t border-gray-700'
          : 'text-fg-body'
      }`}
    >
      {children}
    </button>
  );
}
