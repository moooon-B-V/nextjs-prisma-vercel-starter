import { test, expect } from './_helpers/acceptance-video';

// THROWAWAY — a trigger probe for MOTIR-1958, never merged. Its only job is to
// make a PR that CHANGES an acceptance spec, so the paths-filtered workflow can
// be observed firing.
test('the landing page renders', async ({ page, chapter, acceptanceStory }) => {
  acceptanceStory('MOTIR-1627');

  await chapter('Open the landing page', async () => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});
