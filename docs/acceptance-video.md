# Acceptance videos

A **story acceptance video** is a recording of your app's happy path, produced by a
green E2E run and published to the story in Motir. A reviewer watches it and
Approves — that is the acceptance gate (Motir Principle #18: review at the story
level, not per subtask). It is distinct from verification: your tests prove the
code is **correct**; the video is what a person watches to decide it is **what
they wanted**.

This starter ships the lane pre-wired, so a project generated from it can produce
that receipt on day one.

## Writing an acceptance spec

Create `tests/e2e/acceptance-<area>.spec.ts` and use the harness:

```ts
import { test, expect } from './_helpers/acceptance-video';

test('sign up and land on the dashboard', async ({ page, chapter, acceptanceStory, beat }) => {
  acceptanceStory('MOTIR-123'); // the STORY this clip is the receipt for

  await chapter('Open the sign-up page', async () => {
    await page.goto('/sign-up');
    await expect(page.getByRole('heading', { name: /create your account/i })).toBeVisible();
  });

  await chapter('Create the account', async () => {
    await page.getByLabel('Email').fill('ada@example.com');
    await beat(); // pace it — a human is watching
    await page.getByRole('button', { name: 'Sign up' }).click();
    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible();
  });
});
```

Two rules that are easy to get wrong:

- **`acceptanceStory(...)` names the STORY, not the subtask.** Acceptance is
  story-level. The key it declares is what the clip is published against.
- **Pace it.** The clip is a thing a person WATCHES. `chapter()` paces itself and
  `beat()` adds a breath after a user-visible action. A spec that races through
  passes every assertion and produces a receipt nobody can review — the uploader
  refuses to publish a clip under the watchable floor, and says so.

Run it locally with `pnpm test:e2e:acceptance`. It uses its own Playwright config
(`playwright.acceptance.config.ts`, port 3200) so it can run alongside the main
suite, and the main suite `testIgnore`s `acceptance*.spec.ts` so nothing runs twice.

## What CI does

| Run                                              | Records + checks | Publishes          |
| ------------------------------------------------ | ---------------- | ------------------ |
| PR that changes `tests/e2e/acceptance-X.spec.ts` | yes              | **only X's story** |
| PR that changes no acceptance spec               | **job absent**   | nothing            |
| Push to the default branch                       | job absent       | nothing            |

Two properties make that scoping necessary rather than tidy:

1. **Publishing SUPERSEDES.** A new receipt for a story retires the previous one
   and unlinks its video for garbage collection. It is not additive.
2. **Each recording targets its OWN declared story**, from `acceptanceStory(...)`,
   not from the PR. So a lane that ran everywhere would republish every story that
   has a spec, with clips recorded off an unrelated branch that no reviewer
   watched. That is exactly what happened in Motir's own CI before MOTIR-1937: one
   backend PR republished seven already-accepted stories.

So the `acceptance` job is gated on the PR actually changing an acceptance spec
(the `acceptance-specs` job computes the list), and the uploader publishes only
the recordings produced by those specs. The gate **fails closed** — an empty list
owns nothing.

**Why not just publish from the default branch instead?** Because it breaks the
flow. Motir's approve action moves a story `in_review → done`, and `in_review` is
the **PR-open** state — merging is what flips the card to `done`. Publish only
after merge and the receipt lands once the story is already done, so the reviewer
never gets to watch-then-approve.

## Publishing credentials

The publish is opt-in and no-ops without one of:

- **Keyless GitHub OIDC** — for a repo connected via the Motir GitHub App. The job
  already grants `id-token: write`; nothing to configure.
- **`MOTIR_UPLOAD_TOKEN`** — a Motir API token with the `integration` scope, added
  as a repository secret, for a repo that is not App-connected.

With neither present the job still records and checks; it just publishes nothing.

## Why the uploader is VENDORED here (the MOTIR-1941 decision)

`scripts/upload-acceptance-video.mjs` and
`.github/actions/upload-acceptance-video/` are **copies** of motir-core's, not a
remote reference. Three options were on the table; this is why this one won:

- **Reference motir-core's Action remotely** (`uses: moooon-B-V/motir-core/...@ref`)
  — appealing (fixes flow automatically), but **it does not work today**: that
  composite action's step runs `node scripts/upload-acceptance-video.mjs`, and a
  composite `run:` resolves against the CALLER's workspace, not the action's own
  directory. In any repo but motir-core that path does not exist. Making it
  remotely invocable is a motir-core change (move the script beside the action and
  invoke it via `${{ github.action_path }}`), out of scope for this repo.
- **Publish it as its own Action repo** — the cleanest long-term answer and what
  the BYOK docs imply, but it does not exist yet.
- **Vendor it** — chosen. It also happens to suit a template: a generated project
  gets a SNAPSHOT of this repo and never tracks it, so "the copy will drift" is
  true of every file here, not a cost unique to the uploader. Being self-contained
  means a generated project's CI does not clone Motir's internals at build time.

The tradeoff is real: MOTIR-1734, MOTIR-1905 and MOTIR-1937 were all uploader
bugs, and this copy will not receive the next one automatically. Two mitigations:
`tests/acceptance-video-uploader.test.ts` is vendored alongside it, so the
behaviour is pinned here and a bad sync fails locally; and when the Action becomes
remotely invocable, this repo should switch to referencing it and delete the copy.

Upstream: `motir-core/docs/e2e/acceptance-video-byok.md` (the consumer contract)
and `motir-core/docs/decisions/acceptance-video.md` (the policy).
