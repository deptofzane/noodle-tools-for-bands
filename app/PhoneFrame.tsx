import Image from 'next/image';

/**
 * A screenshot shown straight-on in a phone-shaped frame.
 *
 * Every screenshot in `public/screenshots` is 1320×2868, so the frame locks
 * that ratio and scales from whatever width the caller gives it. That is what
 * lets the same component sit in a carousel, a bento cell, or a hero without
 * per-instance tuning.
 *
 * The ratio is on the *screen*, not on the outer frame, and that distinction
 * matters: percentage padding resolves against width on all four sides, so a
 * ratio set outside is not the ratio left inside once the bezel is subtracted
 * — the screen came out narrower than the image and `object-cover` quietly
 * shaved the left and right edges, which is where the event accent bars and
 * the row kebabs live. Sizing the screen itself means the box the image lands
 * in is exactly the image's own shape, and `object-contain` guarantees that
 * anything left over letterboxes rather than crops.
 *
 * Deliberately no notch or dynamic island: these captures start at the app's
 * own first row, with no iOS status bar above it, so an island drawn at the
 * top would sit on "Upcoming events" and the back button rather than on empty
 * bezel. The corner radius, the bezel and the aspect ratio carry the "phone"
 * reading on their own — button nubs drawn on the edge are invisible at the
 * sizes these actually render at, and only ever smeared under antialiasing.
 *
 * `sizes` is not optional in practice — these are 1320px-wide PNGs displayed
 * a few hundred CSS pixels across, and without it every visitor downloads
 * full-resolution panels.
 */
export function PhoneFrame({
  src,
  alt,
  sizes = '(min-width: 1024px) 20rem, 60vw',
  className = '',
}: {
  src: string;
  alt: string;
  sizes?: string;
  className?: string;
}) {
  return (
    <div
      className={`relative rounded-[1.4rem] bg-neutral-900 p-[2%] shadow-2xl ring-1 ring-white/10 sm:rounded-[1.3rem] ${className}`}
    >
      {/* A modest screen radius: the corners are real estate the screenshots
          use — the back button and the row menus sit in them — so this rounds
          just enough to read as a screen without eating content. */}
      <div className="relative aspect-[1320/2868] w-full overflow-hidden rounded-[0.7rem] bg-black sm:rounded-[0.9rem]">
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          className="object-contain"
        />
      </div>
    </div>
  );
}
