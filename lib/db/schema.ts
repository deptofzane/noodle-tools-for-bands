import { sql } from 'drizzle-orm';
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
// A user has an email/password credential (password_hash set) and/or one
// or more linked OAuth accounts (see `accounts`). `email` is the credential
// login key — unique, always stored lowercase. Linked OAuth identities
// live in `accounts`, not here, so a user can connect a Google account
// whose email differs from their login email.
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').unique(),
  passwordHash: text('password_hash'),
  name: text('name'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// ── Linked OAuth accounts ────────────────────────────────────────────
// One row per (provider, external account) linked to a user. Source of
// truth for OAuth sign-in identity, so a user can have multiple providers
// and the provider's email can differ from their login email.
export const authProvider = pgEnum('auth_provider', ['google']);

export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: authProvider('provider').notNull(),
    // The provider's stable account id (for Google, the `sub`).
    providerAccountId: text('provider_account_id').notNull(),
    // The provider account's email (informational; may differ from login).
    email: text('email'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    // One external account maps to at most one user.
    uniqueIndex('accounts_provider_account_unique').on(
      t.provider,
      t.providerAccountId,
    ),
    // At most one account per (user, provider) — makes "one Google account
    // per user" a DB invariant, not just an app-level check. Its leading
    // `user_id` column also serves the per-user lookups.
    uniqueIndex('accounts_user_provider_unique').on(t.userId, t.provider),
  ],
);

// Single-use, expiring password-reset tokens. Only the token's hash is
// stored; the raw token lives only in the emailed link.
export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index('password_reset_tokens_user_idx').on(t.userId)],
);

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

// ── Notifications (Home activity feed) ───────────────────────────────
// One row per noteworthy event, scoped to a band; recipients are that
// band's members (resolved at query time via membership). The acting user
// is recorded so they can be excluded from their own notifications.
// Actor/band/subject labels are snapshotted so the feed still reads well
// after the underlying row is renamed or deleted.
export const notificationKind = pgEnum('notification_kind', [
  'song-comment',
  'chat-message',
  'event-added',
  'song-updated',
  'event-updated',
  'band-updated',
]);

// What a notification points at, for building its link.
export const notificationSubject = pgEnum('notification_subject', [
  'conversation',
  'event',
  'band',
]);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    bandId: uuid('band_id')
      .notNull()
      .references(() => bands.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    actorName: text('actor_name'),
    bandName: text('band_name'),
    kind: notificationKind('kind').notNull(),
    subjectType: notificationSubject('subject_type').notNull(),
    subjectId: uuid('subject_id'),
    subjectLabel: text('subject_label'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index('notifications_band_created_idx').on(t.bandId, t.createdAt),
    index('notifications_created_idx').on(t.createdAt),
  ],
);

// Per-user "last seen" marker for the notification feed (one row per user).
export const notificationReads = pgTable('notification_reads', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
});

// Per-user muted notification kinds. Presence of a row means that kind is
// muted for the user; the default (no rows) is "everything on". Applied as
// a read-time filter on the feed + unread count.
export const notificationMutes = pgTable(
  'notification_mutes',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: notificationKind('kind').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.kind] })],
);

// ── Band messages (general chat) ─────────────────────────────────────
// A flat, band-wide message thread (not tied to a song). Any member can
// post; authors (or band owners) can soft-delete. Ordered by createdAt.
export const bandMessages = pgTable(
  'band_messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    bandId: uuid('band_id')
      .notNull()
      .references(() => bands.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    // Set when the body is edited (null until then) so the UI can show
    // "edited" without conflating it with the always-present updatedAt.
    editedAt: timestamp('edited_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [index('band_messages_band_created_idx').on(t.bandId, t.createdAt)],
);

// @-mentions on a band message → the mentioned users (band members).
export const bandMessageMentions = pgTable(
  'band_message_mentions',
  {
    messageId: uuid('message_id')
      .notNull()
      .references(() => bandMessages.id, { onDelete: 'cascade' }),
    mentionedUserId: uuid('mentioned_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.messageId, t.mentionedUserId] }),
    index('band_message_mentions_user_idx').on(t.mentionedUserId),
  ],
);

// Per-user read marker for a band's chat (drives the unread badge). One
// row per (user, band); lastSeenAt is DB-clock stamped.
export const bandChatReads = pgTable(
  'band_chat_reads',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    bandId: uuid('band_id')
      .notNull()
      .references(() => bands.id, { onDelete: 'cascade' }),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.bandId] })],
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
// The audio and sheet music for a song/conversation, owned by us rather
// than referenced in Drive. Sheet music is one row per conversation.
// Audio supports multiple *versions* per conversation (e.g. studio, live,
// acoustic); exactly one is flagged `isDefault` and is what the player
// loads by default.
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
    // The default audio version for a song — exactly one per conversation
    // among its audio rows (enforced by a partial unique index below).
    // Always false for sheet music.
    isDefault: boolean('is_default').notNull().default(false),
    // Optional human label for an audio version ("Live 2024", "Acoustic").
    label: text('label'),
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
    index('song_files_conversation_idx').on(t.conversationId),
    // At most one sheet-music row per conversation.
    uniqueIndex('song_files_conversation_sheet_unique')
      .on(t.conversationId)
      .where(sql`kind = 'sheet_music'`),
    // At most one *default* audio version per conversation.
    uniqueIndex('song_files_default_audio_unique')
      .on(t.conversationId)
      .where(sql`kind = 'audio' and is_default`),
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

// Items in a setlist, ordered by `position`. An item is either a song
// (conversationId set) or a free-standing marker like a set break or a
// custom entry (conversationId null, `label` holds its name). A given song
// appears at most once per setlist; markers can repeat.
export const setlistSongs = pgTable(
  'setlist_songs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    setlistId: uuid('setlist_id')
      .notNull()
      .references(() => setlists.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id').references(
      () => conversations.id,
      { onDelete: 'cascade' },
    ),
    // Name for non-song items (set break / custom); null for songs.
    label: text('label'),
    position: integer('position').notNull(),
  },
  (t) => [
    index('setlist_songs_setlist_idx').on(t.setlistId),
    // A song appears at most once per setlist (markers are exempt).
    uniqueIndex('setlist_songs_setlist_conversation_unique')
      .on(t.setlistId, t.conversationId)
      .where(sql`conversation_id is not null`),
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
    // Optional associated setlist (must belong to the same band). Cleared
    // if that setlist is deleted.
    setlistId: uuid('setlist_id').references(() => setlists.id, {
      onDelete: 'set null',
    }),
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