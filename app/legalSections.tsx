/**
 * Prose primitives for the public legal pages.
 *
 * Shared because the same text is shown in two places: its own page (the URL
 * Play's review and Google's OAuth verification fetch) and the About page.
 * `level` exists for that second case — on About the policy sits under a
 * heading of its own, so its sections have to drop a level rather than claim
 * to be siblings of it.
 */

export function Section({
  title,
  level = 2,
  children,
}: {
  title: string;
  /** 2 on a page that is only this document, 3 when nested under About. */
  level?: 2 | 3;
  children: React.ReactNode;
}) {
  const Heading = level === 2 ? 'h2' : 'h3';
  return (
    <section className="flex flex-col gap-2">
      <Heading className="text-base font-medium">{title}</Heading>
      <div className="flex flex-col gap-2 text-md leading-relaxed text-fg-soft">
        {children}
      </div>
    </section>
  );
}

export function List({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="flex list-disc flex-col gap-2 pl-5">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export function B({ children }: { children: React.ReactNode }) {
  return <span className="font-medium">{children}</span>;
}

export function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-fill-muted px-1 py-0.5 text-[0.8125rem]">
      {children}
    </code>
  );
}
