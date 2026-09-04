'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Fades its children in the first time they scroll into view.
 *
 * The client boundary lives here rather than on the page, so a server
 * component can wrap server-rendered children in it: the children are still
 * rendered on the server and passed through as an already-built tree. That's
 * what keeps `/` able to read the session — see the note in `app/page.tsx`.
 *
 * Once shown it stays shown; the observer disconnects rather than fading the
 * section back out when it leaves.
 */
export function FadeIn({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Read the node once: reading `ref.current` again in the cleanup would
    // be reading whatever it points at *then*, which is not necessarily the
    // node this effect observed.
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      setVisible(true);
      observer.disconnect();
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={`fade-in-section${visible ? ' is-visible' : ''}`}>
      {children}
    </div>
  );
}
