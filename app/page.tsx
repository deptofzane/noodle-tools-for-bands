import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { FadeIn } from './FadeIn';
import { PhoneFrame } from './PhoneFrame';

/**
 * The front door.
 *
 * Signed in, this is a pass-through to `/home` — which is what the installed
 * app relies on, since the manifest's `start_url` is `/` and every launch from
 * a home-screen icon comes through here. Landing those people on a sign-in
 * pitch would be the worst outcome of having a public root at all.
 *
 * Signed out, it says what this is and offers a way in, rather than throwing
 * an anonymous visitor straight at a login form. `/` is listed in
 * `PUBLIC_PATHS` (see middleware.ts) so they get this far; every other route
 * still redirects, carrying its `callbackUrl` so a shared link survives the
 * round-trip.
 *
 * Reading the session makes this dynamic, which it has to be: the same URL
 * gives two different answers, so it can't be prerendered or cached as one.
 */
export default async function RootPage() {
  const session = await auth();
  if (session) redirect('/home');

  return (
    <main className="min-h-screen">
      <div className="flex flex-col items-center justify-center text-center h-screen">
        <h1 className="font-serif text-5xl">
          noo<span className="text-cyan-600">dle</span>
        </h1>
        <p className="m-0 pb-6 text-sm minor-text-theme-colors">
          tools for<span className="text-cyan-600"> bands</span>
        </p>

        <p className="max-w-sm text-sm text-fg-muted">
          Setlists, sheet music, and practice tools for your band — on stage and
          off.
        </p>

        <Link
          href="/login"
          className="mt-8 rounded-md bg-blue-600 px-6 py-3 text-sm font-medium text-white transition hover:bg-blue-500"
        >
          Log in
        </Link>

        {/* The three pages that are public for their own reasons (see
            middleware.ts) — and the ones someone deciding whether to sign up is
            most likely to want before they do. */}
        <nav className="mt-10 flex items-center gap-4 text-xs minor-text-theme-colors">
          <Link href="/about" className="hover:underline">
            About
          </Link>
          <Link href="/help" className="hover:underline">
            Help
          </Link>
          <Link href="/privacy" className="hover:underline">
            Privacy
          </Link>
        </nav>
        <div className="absolute bottom-0 mb-24 fade-in-element minor-text-theme-colors">
          <p>Learn more</p>
          <p>&#x2193;</p>
        </div>
      </div>
      <section
        aria-labelledby="showcase-heading"
        className="mx-auto w-full max-w-5xl px-6 pb-24"
      >
        {/* A bento grid: uneven cells, a bigger lead, and details lifted out
            of the screenshots as chips. Reads as one board on desktop and
            stacks in priority order on a phone. */}
        <FadeIn>
          <h2
            id="showcase-heading"
            className="max-w-2xl pt-16 font-serif text-3xl leading-tight sm:text-4xl"
          >
            The band&rsquo;s whole memory,{' '}
            <span className="text-cyan-600">one tap away.</span>
          </h2>
        </FadeIn>

        <FadeIn>
          <div className="mt-10 grid gap-4 lg:grid-cols-6">
            {/* Lead cell: the practice screen, with its own UI quoted back as chips. */}
            <div className="relative overflow-hidden rounded-3xl border border-line bg-gradient-to-br from-cyan-500/10 via-surface to-blue-500/10 p-7 lg:col-span-4">
              {/* Text and phone sit side by side once there is room; stacked,
                  the phone would leave half the cell empty. */}
              <div className="lg:flex lg:items-center lg:gap-10">
                <div className="lg:flex-1">
                  <h3 className="font-serif text-2xl">
                    Rehearse against the record
                  </h3>
                  <p className="mt-3 max-w-md text-sm leading-relaxed text-fg-muted">
                    Drop in a take and it becomes a workbench: slow the bridge
                    to seventy percent, loop the last ten seconds, and leave a
                    note at the exact moment you meant. Threads resolve when
                    they&rsquo;re settled, so the song carries its own
                    conversation.
                  </p>
                  <div className="mt-6 flex flex-wrap gap-2">
                    {[
                      '128 BPM · Key: Bm',
                      'Speed 100%',
                      '↺ 10s',
                      '0:46 · 1 reply',
                    ].map((chip) => (
                      <span
                        key={chip}
                        className="rounded-full border border-line-strong bg-surface px-3 py-1 text-xs text-fg-muted"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                </div>
                <PhoneFrame
                  src="/screenshots/comments.png"
                  alt="A track playing with a comment pinned at 0:46 and a reply beneath it."
                  sizes="(min-width: 1024px) 14rem, 55vw"
                  className="mx-auto mt-8 w-[55vw] max-w-[14rem] lg:mt-0 lg:w-[14rem] lg:shrink-0"
                />
              </div>
            </div>

            {/* Two phones staggered — depth is what makes this read as a showcase
                rather than a screenshot dump. */}
            <div className="relative flex flex-col overflow-hidden rounded-3xl border border-line bg-surface p-7 lg:col-span-2">
              <h3 className="font-serif text-xl">One calendar, five people</h3>
              <p className="mt-3 text-sm leading-relaxed text-fg-muted">
                Shows, practice, studio and time off, color coded so you know at
                a glance.
              </p>
              {/*
                The position lives on these wrappers, not on PhoneFrame's
                className: PhoneFrame sets `relative` for its fill image, and
                Tailwind emits `.relative` after `.absolute`, so an `absolute`
                passed in loses and the phones drop back into normal flow.
              */}
              <div className="relative mt-8 min-h-[18rem] flex-1">
                <div className="absolute left-[2%] top-1/2 w-[38vw] max-w-[7.5rem] -translate-y-[56%] -rotate-6">
                  <PhoneFrame
                    src="/screenshots/calendar.png"
                    alt="A month view with colour-coded events."
                    sizes="(min-width: 640px) 8rem, 38vw"
                    className="py-1.5 px-1"
                  />
                </div>
                <div className="absolute left-[42%] top-1/2 w-[38vw] max-w-[7.5rem] -translate-y-[44%] rotate-6">
                  <PhoneFrame
                    src="/screenshots/events.png"
                    alt="The same events as a list."
                    sizes="(min-width: 640px) 8rem, 38vw"
                    className="py-1.5 px-1"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-line bg-surface p-7 lg:col-span-2">
              <h3 className="font-serif text-xl">Nothing lands on nobody</h3>
              <p className="mt-3 text-sm leading-relaxed text-fg-muted">
                A shared todo belongs to the band — anyone can pick it up,
                finish it, or hand it on. Private todos can only be seen by you.
              </p>
              <PhoneFrame
                src="/screenshots/todos.png"
                alt="Todos grouped into active, complete and cancelled, with shared and private badges."
                sizes="(min-width: 1024px) 11rem, 50vw"
                className="mx-auto mt-7 w-[50vw] max-w-[11rem]"
              />
            </div>

            <div className="rounded-3xl border border-line bg-surface p-7 lg:col-span-2">
              <h3 className="font-serif text-xl">Walk in already caught up</h3>
              <p className="mt-3 text-sm leading-relaxed text-fg-muted">
                The landing page shows the week ahead and everything the band
                touched since you last looked.
              </p>
              <PhoneFrame
                src="/screenshots/home.png"
                alt="The home screen showing upcoming events and a notification feed."
                sizes="(min-width: 1024px) 11rem, 50vw"
                className="mx-auto mt-7 w-[50vw] max-w-[11rem]"
              />
            </div>

            {/* Text-only cell: a bento needs a beat without a picture. */}
            <div className="flex flex-col justify-center rounded-3xl border border-line bg-gradient-to-br from-blue-500/10 to-cyan-500/10 p-7 lg:col-span-2">
              <p className="font-serif text-xl leading-snug">
                Setlists, sheet music, venues, polls and the band&rsquo;s own
                notes — in the app you already have open.
              </p>
              <p className="mt-4 text-sm leading-relaxed text-fg-muted">
                Installing to the home screen will let you download audio and
                sheet music for when the internet isn&rsquo;t so available.
              </p>
              <Link
                href="/login"
                className="mt-6 inline-flex w-fit rounded-md bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500"
              >
                Start a band
              </Link>
            </div>
          </div>
        </FadeIn>
      </section>
    </main>
  );
}
