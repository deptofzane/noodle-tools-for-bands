import '../load-env';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { closeDb } from '../../lib/db';
import { upsertUser } from '../../lib/db/users';
import { deleteUsersByGoogleSub } from '../../lib/db/accounts';
import { addMember, createBand, deleteBand } from '../../lib/db/bands';
import {
  countTodosByStatus,
  createTodo,
  deleteTodo,
  getTodoForUser,
  listTodos,
  setTodoOwner,
  setTodoShared,
  setTodoStatus,
  updateTodo,
} from '../../lib/db/todos';

after(() => closeDb());

async function fixture(tag: string) {
  const sam = await upsertUser({
    googleSub: `TD_A_${tag}`,
    email: `tda-${tag}@x.com`,
    name: 'Sam',
  });
  const alex = await upsertUser({
    googleSub: `TD_B_${tag}`,
    email: `tdb-${tag}@x.com`,
    name: 'Alex',
  });
  const jo = await upsertUser({
    googleSub: `TD_C_${tag}`,
    email: `tdc-${tag}@x.com`,
    name: 'Jo',
  });
  const band = await createBand(sam.id, `TD Band ${tag}`);
  await addMember(band.id, alex.id, 'member');
  await addMember(band.id, jo.id, 'member');
  const mk = async (o: {
    by?: string;
    title: string;
    shared?: boolean;
    owner?: string | null;
    deadline?: string | null;
  }) =>
    (
      await createTodo({
        bandId: band.id,
        creatorId: o.by ?? sam.id,
        title: o.title,
        description: null,
        shared: o.shared ?? false,
        ownerId: o.owner ?? null,
        deadline: o.deadline ?? null,
        links: [],
      })
    ).id;
  return { sam, alex, jo, bandId: band.id, mk };
}

const cleanup = async (bandId: string, tag: string) => {
  await deleteBand(bandId);
  await deleteUsersByGoogleSub([`TD_A_${tag}`, `TD_B_${tag}`, `TD_C_${tag}`]);
};

const titles = async (bandId: string, userId: string, scope: 'all' | 'mine') =>
  (await listTodos(bandId, userId, { scope, status: 'active' }))
    .map((t) => t.title)
    .sort();

test('a private todo is invisible to the band', async () => {
  const { sam, alex, bandId, mk } = await fixture('PRIV');
  try {
    const id = await mk({ title: 'Restring bass' });
    assert.deepEqual(await titles(bandId, sam.id, 'mine'), ['Restring bass']);
    assert.deepEqual(await titles(bandId, alex.id, 'all'), []);
    assert.deepEqual(await titles(bandId, alex.id, 'mine'), []);
    assert.equal(
      await getTodoForUser(id, alex.id),
      null,
      'not readable either',
    );
    assert.notEqual(await getTodoForUser(id, sam.id), null);
  } finally {
    await cleanup(bandId, 'PRIV');
  }
});

test('"all" is every shared todo, and excludes your private ones', async () => {
  const { sam, alex, bandId, mk } = await fixture('ALL');
  try {
    await mk({ title: 'Private of Sam' });
    await mk({ title: 'Shared by Sam', shared: true });
    await mk({ by: alex.id, title: 'Shared by Alex', shared: true });
    assert.deepEqual(await titles(bandId, sam.id, 'all'), [
      'Shared by Alex',
      'Shared by Sam',
    ]);
    assert.deepEqual(await titles(bandId, alex.id, 'all'), [
      'Shared by Alex',
      'Shared by Sam',
    ]);
  } finally {
    await cleanup(bandId, 'ALL');
  }
});

test('"mine" is private, assigned to me, or raised by me and unclaimed', async () => {
  const { sam, alex, bandId, mk } = await fixture('MINE');
  try {
    await mk({ title: 'A private' });
    await mk({ title: 'B raised, unclaimed', shared: true });
    await mk({ title: 'C raised, Alex has it', shared: true, owner: alex.id });
    await mk({
      by: alex.id,
      title: 'D Alex raised, mine now',
      shared: true,
      owner: sam.id,
    });
    await mk({ by: alex.id, title: 'E Alex raised, unclaimed', shared: true });

    assert.deepEqual(await titles(bandId, sam.id, 'mine'), [
      'A private',
      'B raised, unclaimed',
      'D Alex raised, mine now',
    ]);
    assert.deepEqual(await titles(bandId, alex.id, 'mine'), [
      'C raised, Alex has it',
      'E Alex raised, unclaimed',
    ]);
  } finally {
    await cleanup(bandId, 'MINE');
  }
});

test('sharing clears the owner, and the todo stays on the raiser’s list', async () => {
  const { sam, bandId, mk } = await fixture('SHARE');
  try {
    const id = await mk({ title: 'Book the van' });
    await setTodoShared(id, true, sam.id);
    const t = await getTodoForUser(id, sam.id);
    assert.equal(t?.shared, true);
    assert.equal(t?.ownerId, null, 'shared means up for grabs');
    // Still Sam's, because he raised it and nobody has claimed it.
    assert.deepEqual(await titles(bandId, sam.id, 'mine'), ['Book the van']);
  } finally {
    await cleanup(bandId, 'SHARE');
  }
});

test('assigning it to someone else moves it off your list onto theirs', async () => {
  const { sam, alex, bandId, mk } = await fixture('ASSIGN');
  try {
    const id = await mk({ title: 'Book the van', shared: true });
    await setTodoOwner(id, alex.id);
    assert.deepEqual(await titles(bandId, sam.id, 'mine'), []);
    assert.deepEqual(await titles(bandId, alex.id, 'mine'), ['Book the van']);
    const t = await getTodoForUser(id, sam.id);
    assert.equal(t?.ownerName, 'Alex', 'the owner is named for the UI');
  } finally {
    await cleanup(bandId, 'ASSIGN');
  }
});

test('the creator unsharing keeps it theirs; an owner unsharing takes it', async () => {
  const { sam, alex, jo, bandId, mk } = await fixture('UNSHARE');
  try {
    // Creator takes their own back: nothing is displaced.
    const own = await mk({ title: 'Mine again', shared: true, owner: alex.id });
    const r1 = await setTodoShared(own, false, sam.id);
    assert.equal(r1.takenFrom, null);
    let t = await getTodoForUser(own, sam.id);
    assert.equal(t?.creatorId, sam.id);
    assert.equal(t?.ownerId, null);

    // Owner takes it: they become the creator, and Sam loses it entirely.
    const taken = await mk({ title: 'Taken', shared: true, owner: alex.id });
    const r2 = await setTodoShared(taken, false, alex.id);
    assert.equal(r2.takenFrom, sam.id, 'the displaced creator is reported');
    t = await getTodoForUser(taken, alex.id);
    assert.equal(t?.creatorId, alex.id);
    assert.equal(
      await getTodoForUser(taken, sam.id),
      null,
      'Sam can no longer see it',
    );
    assert.equal(await getTodoForUser(taken, jo.id), null);
    assert.deepEqual(await titles(bandId, alex.id, 'mine'), ['Taken']);
  } finally {
    await cleanup(bandId, 'UNSHARE');
  }
});

test('status is its own move, and the counts follow', async () => {
  const { sam, bandId, mk } = await fixture('STATUS');
  try {
    const a = await mk({ title: 'One', shared: true });
    const b = await mk({ title: 'Two', shared: true });
    await mk({ title: 'Three', shared: true });
    await setTodoStatus(a, 'complete');
    await setTodoStatus(b, 'cancelled');

    assert.deepEqual(await countTodosByStatus(bandId, sam.id, 'all'), {
      active: 1,
      complete: 1,
      cancelled: 1,
    });
    const done = await listTodos(bandId, sam.id, {
      scope: 'all',
      status: 'complete',
    });
    assert.deepEqual(
      done.map((t) => t.title),
      ['One'],
    );
  } finally {
    await cleanup(bandId, 'STATUS');
  }
});

test('deadlines sort soonest first, with undated last', async () => {
  const { sam, bandId, mk } = await fixture('SORT');
  try {
    await mk({ title: 'No date', shared: true });
    await mk({ title: 'Later', shared: true, deadline: '2026-12-01' });
    await mk({ title: 'Soon', shared: true, deadline: '2026-09-01' });
    const rows = await listTodos(bandId, sam.id, {
      scope: 'all',
      status: 'active',
    });
    assert.deepEqual(
      rows.map((t) => t.title),
      ['Soon', 'Later', 'No date'],
      'nulls must sort last, not first',
    );
  } finally {
    await cleanup(bandId, 'SORT');
  }
});

test('links round-trip, and an edit replaces them', async () => {
  const { sam, bandId } = await fixture('LINKS');
  try {
    const { id } = await createTodo({
      bandId,
      creatorId: sam.id,
      title: 'With links',
      description: null,
      shared: false,
      ownerId: null,
      deadline: null,
      links: [
        {
          kind: 'song',
          targetId: '11111111-1111-4111-8111-111111111111',
          url: null,
          label: 'Cascade',
          practice: true,
        },
        {
          kind: 'other',
          targetId: null,
          url: 'https://x.test',
          label: 'Depot',
          practice: false,
        },
      ],
    });
    let t = await getTodoForUser(id, sam.id);
    assert.equal(t?.links.length, 2);
    assert.equal(
      t?.links[0]?.practice,
      true,
      'practice survives on a todo link',
    );
    assert.equal(t?.links[1]?.url, 'https://x.test');

    await updateTodo(id, {
      title: 'With links',
      description: null,
      deadline: null,
      status: 'active',
      ownerId: null,
      links: [
        {
          kind: 'venue',
          targetId: '22222222-2222-4222-8222-222222222222',
          url: null,
          label: 'The Loft',
          practice: false,
        },
      ],
    });
    t = await getTodoForUser(id, sam.id);
    assert.deepEqual(
      t?.links.map((l) => l.label),
      ['The Loft'],
    );

    await deleteTodo(id);
    assert.equal(await getTodoForUser(id, sam.id), null);
  } finally {
    await cleanup(bandId, 'LINKS');
  }
});
