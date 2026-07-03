import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  boolean,
  date,
  timestamp,
  bigserial,
  primaryKey,
  index,
  uniqueIndex,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

// ── Enums ────────────────────────────────────────────────────────────
export const bandRole = pgEnum('band_role', ['owner', 'member']);
export const activityKind = pgEnum('activity_kind', [
  'note-created',
  'note-updated',
  'note-deleted',
  'reply-created',
  'closed',
  'reopened',
  'resolved',
  'unresolved',
]);

// ── Users ────────────────────────────────────────────────────────────
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  googleSub: text('google_sub').notNull().unique(),
  email: text('email'),
  name: text('name'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// ── Bands + membership ───────────────────────────────────────────────
export const bands = pgTable('bands', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const bandMembers = pgTable(
  'band_members',
  {
    bandId: uuid('band_id')
      .notNull()
      .references(() => bands.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: bandRole('role').notNull().default('member'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.bandId, t.userId] }),
    index('band_members_user_idx').on(t.userId),
  ],
);

// ── Conversations ────────────────────────────────────────────────────
// One row per (band, Drive audio file). The audio bytes stay in Drive;
// this row owns the conversation-level state (closed, last activity).
export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    bandId: uuid('band_id')
      .notNull()
      .references(() => bands.id, { onDelete: 'cascade' }),
    driveAudioFileId: text('drive_audio_file_id').notNull(),
    audioFileName: text('audio_file_name'), // denormalized snapshot
    closed: boolean('closed').notNull().default(false),
    // Archived songs stay in the band but move to a separate list.
    archived: boolean('archived').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex('conversations_band_audio_unique').on(
      t.bandId,
      t.driveAudioFileId,
    ),
    index('conversations_band_idx').on(t.bandId),
    index('conversations_updated_idx').on(t.updatedAt),
  ],
);

// ── Notes (threaded) ─────────────────────────────────────────────────
export const notes = pgTable(
  'notes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id),
    // Self-reference needs the explicit AnyPgColumn return type.
    parentNoteId: uuid('parent_note_id').references(
      (): AnyPgColumn => notes.id,
      { onDelete: 'cascade' },
    ),
    timestampMs: integer('timestamp_ms').notNull(),
    body: text('body').notNull(),
    resolved: boolean('resolved').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('notes_conversation_idx').on(t.conversationId),
    index('notes_parent_idx').on(t.parentNoteId),
  ],
);

// ── Mentions ─────────────────────────────────────────────────────────
export const noteMentions = pgTable(
  'note_mentions',
  {
    noteId: uuid('note_id')
      .notNull()
      .references(() => notes.id, { onDelete: 'cascade' }),
    mentionedUserId: uuid('mentioned_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.noteId, t.mentionedUserId] }),
    index('note_mentions_user_idx').on(t.mentionedUserId),
  ],
);

// ── Activity log ─────────────────────────────────────────────────────
export const activityLog = pgTable(
  'activity_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => users.id),
    kind: activityKind('kind').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index('activity_log_conversation_idx').on(t.conversationId)],
);

// ── Per-user read state (badges) ─────────────────────────────────────
export const conversationReads = pgTable(
  'conversation_reads',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.conversationId] })],
);

// ── Song files (binary, stored in Postgres) ──────────────────────────
// The audio (and, later, sheet music) for a song/conversation, owned by
// us rather than referenced in Drive. One row per (conversation, kind).
export const songFileKind = pgEnum('song_file_kind', ['audio', 'sheet_music']);

export const songFiles = pgTable(
  'song_files',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    kind: songFileKind('kind').notNull(),
    // Bytes live in object storage (S3/R2), addressed by storageKey.
    storageKey: text('storage_key'),
    fileName: text('file_name').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    // Audio duration in whole seconds, parsed on upload (null for
    // non-audio or when it couldn't be determined).
    songLength: integer('song_length'),
    // Provenance: the Drive file this was imported from, if any.
    driveFileId: text('drive_file_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex('song_files_conversation_kind_unique').on(
      t.conversationId,
      t.kind,
    ),
  ],
);

// ── Setlists ─────────────────────────────────────────────────────────
// A named, ordered list of a band's songs. Any band member can create or
// edit one. Membership in the owning band is the access scope.
export const setlists = pgTable(
  'setlists',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    bandId: uuid('band_id')
      .notNull()
      .references(() => bands.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index('setlists_band_idx').on(t.bandId)],
);

// Songs in a setlist, ordered by `position`. A conversation appears at
// most once per setlist.
export const setlistSongs = pgTable(
  'setlist_songs',
  {
    setlistId: uuid('setlist_id')
      .notNull()
      .references(() => setlists.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.setlistId, t.conversationId] }),
    index('setlist_songs_setlist_idx').on(t.setlistId),
  ],
);

// ── Events (calendar) ────────────────────────────────────────────────
// A calendar event owned by a band (chosen at creation). Visible to the
// band's members, plus any users explicitly added via `event_members`.
export const events = pgTable(
  'events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    bandId: uuid('band_id')
      .notNull()
      .references(() => bands.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    date: date('date', { mode: 'string' }).notNull(), // YYYY-MM-DD
    time: text('time'), // HH:MM, optional
    location: text('location'),
    details: text('details'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index('events_band_idx').on(t.bandId),
    index('events_date_idx').on(t.date),
  ],
);

// Extra attendees on an event, beyond the owning band's members. Added by
// email, the same way band members are.
export const eventMembers = pgTable(
  'event_members',
  {
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.eventId, t.userId] }),
    index('event_members_user_idx').on(t.userId),
  ],
);