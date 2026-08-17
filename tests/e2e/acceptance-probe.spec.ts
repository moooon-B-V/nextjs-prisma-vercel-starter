import { test, expect } from './_helpers/acceptance-video';

// TEMPORARY PROBE — MOTIR-2927 measurement only. Not part of the deliverable.
test('probe — the landing page renders', async ({ page, chapter, acceptanceStory }) => {
  acceptanceStory('MOTIR-2927');

  await chapter('Open the landing page', async () => {
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
  });
});
