import type { ReactNode } from 'react';

export interface Member {
  userId: string;
  email: string | null;
  name: string | null;
  role: 'owner' | 'member';
}

export interface Conversation {
  id: string;
  audioFileName: string | null;
  closed: boolean;
  archived: boolean;
  bpm: number | null;
  key: string | null;
  updatedAt: string;
}

export interface Setlist {
  id: string;
  name: string;
  updatedAt: string;
  archived: boolean;
  songs: {
    id: string;
    conversationId: string | null;
    name: string;
    bpm: number | null;
    key: string | null;
  }[];
}

export interface Show {
  id: string;
  title: string;
  date: string;
  time: string | null;
  endTime: string | null;
  location: string | null;
  details: string | null;
  setlistId: string | null;
  setlistName: string | null;
}

/** "N songs" — counts actual songs, ignoring markers (set breaks etc.). */
export function songCountLabel(
  songs: { conversationId: string | null }[],
): string {
  const n = songs.filter((s) => s.conversationId).length;
  return `${n} ${n === 1 ? 'song' : 'songs'}`;
}

/** ▸/▾ toggle for collapsing a band-page section. */
export function MinimizeToggle({
  minimized,
  onToggle,
  label,
  children,
}: {
  minimized: boolean;
  onToggle: () => void;
  label: string;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!minimized}
      aria-label={minimized ? `Expand ${label}` : `Minimize ${label}`}
      title={minimized ? `Expand ${label}` : `Minimize ${label}`}
      className="-mr-1 px-2 py-2 text-xl leading-none flex items-center gap-2"
    >
      <span
        aria-hidden="true"
        className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
      >
        {minimized ? '▸' : '▾'}
      </span>
      {children}
    </button>
  );
}
