import '../load-env';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { closeDb } from '../../lib/db';
import { upsertUser } from '../../lib/db/users';
import { deleteUsersByGoogleSub } from '../../lib/db/accounts';
import { createBand, deleteBand } from '../../lib/db/bands';
import {
  findOrCreateConversation,
  setConversationArchived,
} from '../../lib/db/conversations';
import { createSetlist, setSetlistArchived } from '../../lib/db/setlists';
import { createEvent } from '../../lib/db/events';
import { listPracticePicker } from '../../lib/db/practice-picker';

after(closeDb);

const TODAY = '2026-07-15';

test('practice picker: active songs, setlists with songs, upcoming events with one', async () => {
  const subs = ['PP_OWNER'];
  let bandId: string | undefined;
  try {
    const owner = await upsertUser({
      googleSub: 'PP_OWNER',
      email: 'pp@x.com',
      name: 'Owner',
    });
    bandId = (await createBand(owner.id, 'Picker Band')).id;
    const song = (title: string) =>
      findOrCreateConversation(bandId!, `pp-${title}`, title);

    const bravo = await song('bravo');
    const alpha = await song('Alpha');
    const shelved = await song('Shelved');
    await setConversationArchived(shelved.id, true);

    const setlist = (name: string, items: (string | null)[]) =>
      createSetlist({
        bandId: bandId!,
        createdBy: owner.id,
        name,
        items: items.map((conversationId) => ({
          conversationId,
          label: conversationId ? null : 'Break',
        })),
      });
    const full = await setlist('Full', [alpha.id, bravo.id]);
    const breaksOnly = await setlist('Breaks only', [null, null]);
    const empty = await setlist('Empty', []);
    const archived = await setlist('Archived', [alpha.id]);
    await setSetlistArchived(archived.id, true);

    const event = (
      title: string,
      date: string,
      setlistId: string | null,
      endDate: string | null = null,
    ) =>
      createEvent({
        bandId: bandId!,
        title,
        eventType: 'Show',
        date,
        endDate,
        time: '20:00',
        endTime: null,
        location: null,
        details: null,
        notes: null,
        setlistId,
        venueId: null,
        createdBy: owner.id,
      });
    const later = await event('Later show', '2026-08-01', full.id);
    const tonight = await event('Tonight', TODAY, full.id);
    const underway = await event(
      'Festival',
      '2026-07-13',
      full.id,
      '2026-07-16',
    );
    await event('Last week', '2026-07-08', full.id);
    await event('No setlist', '2026-07-20', null);
    await event('Breaks setlist', '2026-07-20', breaksOnly.id);

    const picker = await listPracticePicker(bandId, TODAY);

    // Active songs only, alphabetical regardless of case.
    assert.deepEqual(
      picker.songs.map((s) => s.title),
      ['Alpha', 'bravo'],
    );

    // Not archived, and with at least one song (set breaks don't count).
    assert.deepEqual(
      picker.setlists.map((s) => [s.name, s.songCount]),
      [['Full', 2]],
    );
    assert.ok(!picker.setlists.some((s) => s.id === empty.id));

    // Upcoming by last day — so today's and an under-way festival count —
    // soonest first, and only with a setlist that has songs.
    assert.deepEqual(
      picker.events.map((e) => e.id),
      [underway.id, tonight.id, later.id],
    );
    assert.equal(picker.events[0]!.setlistId, full.id);
    assert.equal(picker.events[0]!.setlistName, 'Full');
  } finally {
    if (bandId) await deleteBand(bandId);
    await deleteUsersByGoogleSub(subs);
  }
});
