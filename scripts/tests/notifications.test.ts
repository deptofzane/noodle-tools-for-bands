import '../load-env';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { eq, inArray } from 'drizzle-orm';
import { closeDb, db } from '../../lib/db';
import { users } from '../../lib/db/schema';
import { addMember, createBand, deleteBand } from '../../lib/db/bands';
import { upsertUser } from '../../lib/db/users';
import { deleteUsersByGoogleSub } from '../../lib/db/accounts';
import {
  createNotification,
  getMutedKinds,
  getUnreadNotificationCount,
  listNotifications,
  markNotificationsRead,
  setKindMuted,
} from '../../lib/db/notifications';

after(closeDb);

const SUBS = ['NT_OWNER', 'NT_MEMBER', 'NT_OTHER'];

test('notifications: muted kinds are excluded from feed + count', async () => {
  let bandId: string | undefined;
  try {
    const owner = await upsertUser({ googleSub: 'NT_OWNER', email: 'nto@x.com', name: 'Owner' });
    const member = await upsertUser({ googleSub: 'NT_MEMBER', email: 'ntm@x.com', name: 'Member' });
    const band = await createBand(owner.id, 'NT Band');
    bandId = band.id;
    await addMember(band.id, member.id, 'member');

    // Two kinds of activity by the owner → both visible to the member.
    await createNotification({
      bandId: band.id,
      actorId: owner.id,
      kind: 'chat-message',
      subjectType: 'band',
      subjectId: band.id,
    });
    await createNotification({
      bandId: band.id,
      actorId: owner.id,
      kind: 'event-added',
      subjectType: 'event',
      subjectId: band.id,
      subjectLabel: 'Gig',
    });
    assert.equal((await listNotifications(member.id)).length, 2, 'both visible by default');
    assert.equal(await getUnreadNotificationCount(member.id), 2, 'both counted');
    assert.deepEqual(await getMutedKinds(member.id), [], 'nothing muted by default');

    // Mute chat-message for the member.
    await setKindMuted(member.id, 'chat-message', true);
    assert.deepEqual(await getMutedKinds(member.id), ['chat-message'], 'kind is muted');
    const list = await listNotifications(member.id);
    assert.equal(list.length, 1, 'muted kind dropped from feed');
    assert.equal(list[0]!.kind, 'event-added', 'the surviving one');
    assert.equal(await getUnreadNotificationCount(member.id), 1, 'muted kind not counted');

    // Muting is idempotent; unmuting restores it.
    await setKindMuted(member.id, 'chat-message', true);
    assert.deepEqual(await getMutedKinds(member.id), ['chat-message'], 'still just one row');
    await setKindMuted(member.id, 'chat-message', false);
    assert.equal((await listNotifications(member.id)).length, 2, 'unmute restores the feed');
  } finally {
    if (bandId) await deleteBand(bandId);
    await deleteUsersByGoogleSub(SUBS);
  }
});

test('notifications: scope, actor exclusion, unread, mark-read', async () => {
  let bandId: string | undefined;
  let otherBandId: string | undefined;
  try {
    const owner = await upsertUser({ googleSub: 'NT_OWNER', email: 'nto@x.com', name: 'Owner' });
    const member = await upsertUser({ googleSub: 'NT_MEMBER', email: 'ntm@x.com', name: 'Member' });
    const other = await upsertUser({ googleSub: 'NT_OTHER', email: 'ntx@x.com', name: 'Other' });
    const band = await createBand(owner.id, 'NT Band');
    bandId = band.id;
    await addMember(band.id, member.id, 'member');

    // A band the member is NOT in.
    const otherBand = await createBand(other.id, 'Other Band');
    otherBandId = otherBand.id;

    // Owner acts in the band → member should see it, with snapshots.
    await createNotification({
      bandId: band.id,
      actorId: owner.id,
      kind: 'chat-message',
      subjectType: 'band',
      subjectId: band.id,
    });
    // Member's own action → member should NOT see it.
    await createNotification({
      bandId: band.id,
      actorId: member.id,
      kind: 'song-comment',
      subjectType: 'conversation',
      subjectId: band.id,
      subjectLabel: 'Song',
    });
    // Activity in a band the member isn't in → not visible to member.
    await createNotification({
      bandId: otherBand.id,
      actorId: other.id,
      kind: 'event-added',
      subjectType: 'event',
      subjectId: otherBand.id,
      subjectLabel: 'Gig',
    });

    const list = await listNotifications(member.id);
    assert.equal(list.length, 1, 'member sees exactly the one relevant notification');
    assert.equal(list[0]!.kind, 'chat-message', 'the owner-authored one');
    assert.equal(list[0]!.actorName, 'Owner', 'actor name snapshot');
    assert.equal(list[0]!.bandName, 'NT Band', 'band name snapshot');
    assert.ok(list[0]!.unread, 'unread before reading');

    assert.equal(await getUnreadNotificationCount(member.id), 1, 'one unread');
    // Owner sees the member-authored song-comment, but NOT their own
    // chat-message — confirming actor exclusion.
    const ownerList = await listNotifications(owner.id);
    assert.equal(ownerList.length, 1, 'owner sees one');
    assert.equal(ownerList[0]!.kind, 'song-comment', 'owner sees others, not their own');

    // Mark read clears the count + flag.
    await markNotificationsRead(member.id);
    assert.equal(await getUnreadNotificationCount(member.id), 0, 'read clears count');
    assert.equal((await listNotifications(member.id))[0]!.unread, false, 'read clears flag');

    // A new notification after reading is unread again.
    await createNotification({
      bandId: band.id,
      actorId: owner.id,
      kind: 'event-added',
      subjectType: 'event',
      subjectId: band.id,
      subjectLabel: 'Rehearsal',
    });
    assert.equal(await getUnreadNotificationCount(member.id), 1, 'new activity is unread');
    const after = await listNotifications(member.id);
    assert.equal(after.length, 2, 'both band notifications listed');
    assert.equal(after[0]!.kind, 'event-added', 'newest first');
  } finally {
    if (bandId) await deleteBand(bandId);
    if (otherBandId) await deleteBand(otherBandId);
    await deleteUsersByGoogleSub(SUBS);
  }
});
