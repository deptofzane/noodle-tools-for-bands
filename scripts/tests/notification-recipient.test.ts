import '../load-env';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { closeDb } from '../../lib/db';
import { upsertUser } from '../../lib/db/users';
import { deleteUsersByGoogleSub } from '../../lib/db/accounts';
import { addMember, createBand, deleteBand } from '../../lib/db/bands';
import {
  createNotification,
  getUnreadNotificationCount,
  listNotifications,
  markNotificationsRead,
  setKindMuted,
} from '../../lib/db/notifications';
import { listPushTargets } from '../../lib/db/push-subscriptions';
import { savePushSubscription } from '../../lib/db/push-subscriptions';

after(() => closeDb());

/**
 * Targeted notifications.
 *
 * A null recipient is a broadcast, which is how every kind behaved before
 * this existed — so the tests that matter are that targeting hides a row from
 * everyone else, that broadcasts are unaffected, and that the unread count
 * agrees with the list it counts.
 */
async function fixture(tag: string) {
  const actor = await upsertUser({
    googleSub: `RCP_A_${tag}`,
    email: `rcpa-${tag}@x.com`,
    name: 'Actor',
  });
  const target = await upsertUser({
    googleSub: `RCP_B_${tag}`,
    email: `rcpb-${tag}@x.com`,
    name: 'Target',
  });
  const other = await upsertUser({
    googleSub: `RCP_C_${tag}`,
    email: `rcpc-${tag}@x.com`,
    name: 'Other',
  });
  const band = await createBand(actor.id, `RCP Band ${tag}`);
  await addMember(band.id, target.id, 'member');
  await addMember(band.id, other.id, 'member');
  return { actor, target, other, bandId: band.id };
}

const cleanup = async (bandId: string, tag: string) => {
  await deleteBand(bandId);
  await deleteUsersByGoogleSub([
    `RCP_A_${tag}`,
    `RCP_B_${tag}`,
    `RCP_C_${tag}`,
  ]);
};

const titles = async (userId: string) =>
  (await listNotifications(userId)).notifications.map((n) => n.subjectLabel);

test('a targeted notification reaches only its recipient', async () => {
  const { actor, target, other, bandId } = await fixture('ONE');
  try {
    await createNotification({
      bandId,
      actorId: actor.id,
      kind: 'band-updated',
      subjectType: 'band',
      subjectLabel: 'FOR TARGET',
      recipientId: target.id,
    });

    assert.deepEqual(await titles(target.id), ['FOR TARGET']);
    assert.deepEqual(await titles(other.id), [], 'a bandmate must not see it');
    assert.deepEqual(await titles(actor.id), [], 'nor the actor who caused it');
  } finally {
    await cleanup(bandId, 'ONE');
  }
});

test('a broadcast still reaches the whole band, as before', async () => {
  const { actor, target, other, bandId } = await fixture('ALL');
  try {
    await createNotification({
      bandId,
      actorId: actor.id,
      kind: 'band-updated',
      subjectType: 'band',
      subjectLabel: 'FOR EVERYONE',
    });
    assert.deepEqual(await titles(target.id), ['FOR EVERYONE']);
    assert.deepEqual(await titles(other.id), ['FOR EVERYONE']);
  } finally {
    await cleanup(bandId, 'ALL');
  }
});

test('the unread count agrees with the list it counts', async () => {
  const { actor, target, other, bandId } = await fixture('COUNT');
  try {
    await markNotificationsRead(target.id);
    await markNotificationsRead(other.id);
    await new Promise((r) => setTimeout(r, 20));

    await createNotification({
      bandId,
      actorId: actor.id,
      kind: 'band-updated',
      subjectType: 'band',
      subjectLabel: 'BROADCAST',
    });
    await createNotification({
      bandId,
      actorId: actor.id,
      kind: 'band-updated',
      subjectType: 'band',
      subjectLabel: 'TARGETED',
      recipientId: target.id,
    });

    assert.equal(await getUnreadNotificationCount(target.id), 2);
    assert.equal((await titles(target.id)).length, 2);
    assert.equal(
      await getUnreadNotificationCount(other.id),
      1,
      'only the broadcast',
    );
    assert.equal((await titles(other.id)).length, 1);
  } finally {
    await cleanup(bandId, 'COUNT');
  }
});

test('a muted kind is still muted when it is addressed to you', async () => {
  const { actor, target, bandId } = await fixture('MUTE');
  try {
    await setKindMuted(target.id, 'band-updated', true);
    await createNotification({
      bandId,
      actorId: actor.id,
      kind: 'band-updated',
      subjectType: 'band',
      subjectLabel: 'MUTED BUT MINE',
      recipientId: target.id,
    });
    assert.deepEqual(
      await titles(target.id),
      [],
      'targeting does not override a mute',
    );
    assert.equal(await getUnreadNotificationCount(target.id), 0);
  } finally {
    await setKindMuted(target.id, 'band-updated', false);
    await cleanup(bandId, 'MUTE');
  }
});

test('push goes to the recipient alone, and never to the actor', async () => {
  const { actor, target, other, bandId } = await fixture('PUSH');
  try {
    for (const u of [actor, target, other]) {
      await savePushSubscription({
        userId: u.id,
        endpoint: `https://push.test/${u.id}`,
        p256dh: 'k',
        auth: 'a',
      });
    }

    const broadcast = await listPushTargets({
      bandId,
      actorId: actor.id,
      kind: 'band-updated',
    });
    assert.deepEqual(
      broadcast.map((t) => t.userId).sort(),
      [target.id, other.id].sort(),
      'a broadcast reaches the band except the actor',
    );

    const targeted = await listPushTargets({
      bandId,
      actorId: actor.id,
      kind: 'band-updated',
      recipientId: target.id,
    });
    assert.deepEqual(
      targeted.map((t) => t.userId),
      [target.id],
    );

    // The actor addressing something to themselves gets nothing: they did it.
    const toSelf = await listPushTargets({
      bandId,
      actorId: actor.id,
      kind: 'band-updated',
      recipientId: actor.id,
    });
    assert.deepEqual(toSelf, [], 'no push for your own action');
  } finally {
    await cleanup(bandId, 'PUSH');
  }
});
