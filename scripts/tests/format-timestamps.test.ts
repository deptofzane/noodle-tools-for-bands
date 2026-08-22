import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { formatTimeAgoOrDate } from '../../lib/format';

/*
 * The boundaries are calendar edges, so the tests pin the clock rather than
 * offsetting from a real "now" — run at 00:30, a "3h ago" case built by
 * subtraction would land yesterday and the test would be right for the wrong
 * reason.
 *
 * `local` builds times in the runner's own zone, which is the zone the
 * function reads.
 */
const local = (y: number, m: number, d: number, hh = 0, mm = 0): Date =>
  new Date(y, m - 1, d, hh, mm, 0, 0);

function at(now: Date, fn: () => void) {
  mock.timers.enable({ apis: ['Date'], now });
  try {
    fn();
  } finally {
    mock.timers.reset();
  }
}

// Mid-afternoon: an ordinary case, nowhere near a boundary.
const AFTERNOON = local(2026, 8, 22, 15, 0);

test('earlier the same day counts hours', () => {
  at(AFTERNOON, () => {
    assert.equal(
      formatTimeAgoOrDate(local(2026, 8, 22, 12, 0).toISOString()),
      '3h ago',
    );
    assert.equal(
      formatTimeAgoOrDate(local(2026, 8, 22, 14, 48).toISOString()),
      '12m ago',
    );
    assert.equal(
      formatTimeAgoOrDate(local(2026, 8, 22, 15, 0).toISOString()),
      'just now',
    );
  });
});

test('the previous calendar day is "Yesterday"', () => {
  at(AFTERNOON, () => {
    assert.equal(
      formatTimeAgoOrDate(local(2026, 8, 21, 23, 59).toISOString()),
      'Yesterday',
    );
    assert.equal(
      formatTimeAgoOrDate(local(2026, 8, 21, 0, 0).toISOString()),
      'Yesterday',
    );
  });
});

test('older than that is a date', () => {
  at(AFTERNOON, () => {
    const twoDays = local(2026, 8, 20, 23, 59);
    assert.equal(
      formatTimeAgoOrDate(twoDays.toISOString()),
      twoDays.toLocaleDateString(),
    );
    const eleven = local(2026, 8, 11, 9, 0);
    const out = formatTimeAgoOrDate(eleven.toISOString());
    assert.equal(out, eleven.toLocaleDateString());
    assert.doesNotMatch(out, /ago/); // the case that prompted the change
  });
});

test('just after midnight, last night is Yesterday — not "2h ago"', () => {
  // The whole reason this is calendar-based rather than a 24-hour window.
  at(local(2026, 8, 22, 1, 0), () => {
    assert.equal(
      formatTimeAgoOrDate(local(2026, 8, 21, 23, 0).toISOString()),
      'Yesterday',
    );
    // Something from 40 minutes ago is still today, though.
    assert.equal(
      formatTimeAgoOrDate(local(2026, 8, 22, 0, 20).toISOString()),
      '40m ago',
    );
  });
});

test('23 hours ago can still be Yesterday, and 1 hour ago can be today', () => {
  at(local(2026, 8, 22, 23, 0), () => {
    // 23h earlier is midnight *today* — same calendar day.
    assert.equal(
      formatTimeAgoOrDate(local(2026, 8, 22, 0, 0).toISOString()),
      '23h ago',
    );
  });
  at(local(2026, 8, 22, 0, 30), () => {
    // 1h earlier crosses midnight into yesterday.
    assert.equal(
      formatTimeAgoOrDate(local(2026, 8, 21, 23, 30).toISOString()),
      'Yesterday',
    );
  });
});

test('a month boundary is still just one day', () => {
  at(local(2026, 9, 1, 10, 0), () => {
    assert.equal(
      formatTimeAgoOrDate(local(2026, 8, 31, 22, 0).toISOString()),
      'Yesterday',
    );
  });
});

test('a leap day is still just one day', () => {
  at(local(2028, 3, 1, 10, 0), () => {
    assert.equal(
      formatTimeAgoOrDate(local(2028, 2, 29, 22, 0).toISOString()),
      'Yesterday',
    );
  });
});

test('garbage passes through rather than rendering "Invalid Date"', () => {
  at(AFTERNOON, () => {
    assert.equal(formatTimeAgoOrDate('not-a-date'), 'not-a-date');
  });
});

test('a future timestamp reads as today, not a date', () => {
  at(AFTERNOON, () => {
    assert.equal(
      formatTimeAgoOrDate(local(2026, 8, 22, 17, 0).toISOString()),
      'just now',
    );
  });
});
