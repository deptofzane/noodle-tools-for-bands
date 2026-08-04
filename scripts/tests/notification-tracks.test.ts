import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Conversation } from '../../app/bands/[bandId]/bandDetailShared';
import {
  batchCount,
  isUploadNotification,
  tracksForNotification,
  type UploadNotification,
} from '../../app/home/notificationTracks';

/** A band song, with audio unless `audioStoredName` is nulled out. */
function song(id: string, createdAt: string, audio = true): Conversation {
  return {
    id,
    audioFileName: `${id}.mp3`,
    closed: false,
    archived: false,
    bpm: null,
    key: null,
    createdAt,
    updatedAt: createdAt,
    songLength: 120,
    audioStoredName: audio ? `${id}-stored.mp3` : null,
    audioMimeType: audio ? 'audio/mpeg' : null,
    hasSheetMusic: false,
  };
}

function notification(
  over: Partial<UploadNotification> = {},
): UploadNotification {
  return {
    kind: 'audio-added',
    subjectId: null,
    subjectLabel: null,
    bandName: 'The Band',
    createdAt: '2026-08-04T12:00:00.000Z',
    ...over,
  };
}

test('notification tracks: only audio-added notifications are playable', () => {
  assert.equal(isUploadNotification(notification()), true);
  assert.equal(
    isUploadNotification(notification({ kind: 'song-created' })),
    false,
  );
  assert.equal(
    isUploadNotification(notification({ kind: 'chat-message' })),
    false,
  );
});

test('notification tracks: a single upload resolves to exactly its song', () => {
  const conversations = [
    song('a', '2026-08-04T11:00:00.000Z'),
    song('b', '2026-08-04T11:59:00.000Z'),
    song('c', '2026-08-04T11:59:30.000Z'),
  ];
  const tracks = tracksForNotification(
    notification({ subjectId: 'b', subjectLabel: 'b.mp3' }),
    conversations,
  );
  assert.deepEqual(
    tracks.map((t) => t.id),
    ['b'],
  );
  const [track] = tracks;
  assert.ok(track);
  assert.equal(track.src.startsWith('/api/conversations/b/files/audio'), true);
  assert.equal(track.subtitle, 'The Band');
  assert.equal(track.durationSec, 120);
});

test('notification tracks: a batch takes that many, oldest-first, and stops at the notification', () => {
  const conversations = [
    song('old', '2026-08-01T09:00:00.000Z'),
    song('x', '2026-08-04T11:59:00.000Z'),
    song('y', '2026-08-04T11:59:20.000Z'),
    song('z', '2026-08-04T11:59:40.000Z'),
    // Uploaded after the notification — a different batch, not this one.
    song('later', '2026-08-04T12:30:00.000Z'),
  ];
  const tracks = tracksForNotification(
    notification({ subjectLabel: '3 songs' }),
    conversations,
  );
  // Upload order, so the queue plays the way the batch was added.
  assert.deepEqual(
    tracks.map((t) => t.id),
    ['x', 'y', 'z'],
  );
});

test('notification tracks: songs without audio never enter the queue', () => {
  const conversations = [
    song('has-audio', '2026-08-04T11:58:00.000Z'),
    song('no-audio', '2026-08-04T11:59:00.000Z', false),
  ];
  // The batch counted two, but only one of them can actually play.
  assert.deepEqual(
    tracksForNotification(
      notification({ subjectLabel: '2 songs' }),
      conversations,
    ).map((t) => t.id),
    ['has-audio'],
  );
  // And a single upload whose audio is gone resolves to nothing rather than
  // to a queue entry that would fail to load.
  assert.deepEqual(
    tracksForNotification(
      notification({ subjectId: 'no-audio' }),
      conversations,
    ),
    [],
  );
});

test('notification tracks: a deleted song leaves nothing to play', () => {
  assert.deepEqual(
    tracksForNotification(notification({ subjectId: 'gone' }), [
      song('still-here', '2026-08-04T11:00:00.000Z'),
    ]),
    [],
  );
});

test('notification tracks: batch counts come from our own label format', () => {
  assert.equal(batchCount('7 songs'), 7);
  assert.equal(batchCount('1 song'), 1);
  // Anything unparseable means the single-upload shape.
  assert.equal(batchCount(null), 1);
  assert.equal(batchCount('some songs'), 1);
  assert.equal(batchCount('0 songs'), 1);
});

test('notification tracks: timestamps are compared as instants, not strings', () => {
  // Postgres-style offset formatting sorts differently from ISO-Z as text;
  // both name the same moment, and the cutoff has to honor that.
  const conversations = [song('a', '2026-08-04 11:59:00+00')];
  assert.deepEqual(
    tracksForNotification(
      notification({ createdAt: '2026-08-04T12:00:00.000Z' }),
      conversations,
    ).map((t) => t.id),
    ['a'],
  );
});
