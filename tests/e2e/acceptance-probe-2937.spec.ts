import { test, expect } from './_helpers/acceptance-video';

// TEMPORARY PROBE — MOTIR-2937 measurement only. DO NOT MERGE.
//
// Its only job is to make this PR's diff match the lane's `paths:` filter
// (`tests/e2e/acceptance*.spec.ts`) so the acceptance workflow actually FIRES
// and the `Publish the acceptance video` step gets a chance to load the
// vendored composite action — the thing MOTIR-2937 is about.
//
// SKIPPED on purpose: a run that records nothing publishes nothing, so the
// probe cannot supersede any story's real acceptance evidence. That is the same
// shape as the MOTIR-2937 counterfactual (PR #19), whose publish step reported
// `No acceptance video … nothing to publish` and exited 0 — the manifest is
// converted before the step body runs either way, which is what is being
// measured.
test.skip('probe — never runs; the diff is the whole point', async ({ page, chapter }) => {
  await chapter('unreachable', async () => {
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
  });
});
