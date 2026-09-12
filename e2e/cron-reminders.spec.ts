import { test, expect } from '@playwright/test';

/**
 * The reminder sweep's trigger.
 *
 * It pushes to people's lock screens, so the only thing worth testing here is
 * that it cannot be set off by someone who hasn't got the secret — including
 * by a signed-in user, since this endpoint is not about who you are.
 */
test('the cron endpoint refuses a request without the secret', async ({
  request,
}) => {
  const res = await request.post('/api/cron/event-reminders');
  // 401 when a secret is configured, 503 when it isn't — never 200, and never
  // running the sweep either way.
  expect([401, 503]).toContain(res.status());
});

test('a wrong secret is refused too', async ({ request }) => {
  const res = await request.post('/api/cron/event-reminders', {
    headers: { authorization: 'Bearer not-the-secret' },
  });
  expect([401, 503]).toContain(res.status());
});

test('GET is not a way in', async ({ request }) => {
  const res = await request.get('/api/cron/event-reminders');
  expect(res.status()).toBe(405);
});
