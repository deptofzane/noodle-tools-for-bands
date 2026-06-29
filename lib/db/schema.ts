import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  boolean,
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