# Acceptance videos

A **story acceptance video** is a recording of your app's happy path, produced by a
green E2E run and published to the story in Motir. A reviewer watches it and
Approves — that is the acceptance gate (Motir Principle #18: review at the story
level, not per subtask). It is distinct from verification: your tests prove the
code is **correct**; the video is what a person watches to decide it is **what
they wanted**.

This starter ships the **recording** lane pre-wired, so a project generated from it
can produce that receipt on day one. **CI records; it does not publish** — the
agent uploads the receipt over the Motir MCP surface (MOTIR-4097, following
motir-core's MOTIR-4096).

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
  passes every assertion and produces a receipt nobody can review — and since
  MOTIR-4097 nothing in CI measures that for you.

Run it locally with `pnpm test:e2e:acceptance`. It uses its own Playwright config
(`playwright.acceptance.config.ts`, port 3200) so it can run alongside the main
suite, and the main suite `testIgnore`s `acceptance*.spec.ts` so nothing runs twice.

### Retiring a spec — an empty lane is the normal state

An acceptance spec has a **lifecycle**, and it is not "written once and kept
forever". It enters the lane when its story goes into review, records the clip
the reviewer watches, and then **leaves** once that story is approved — either
_promoted_ into the main Playwright lane (rename it out of `acceptance*.spec.ts`,
so the behaviour keeps being regression-tested every PR without re-recording a
receipt nobody will watch again) or _retired_ (deleted, when the main lane
already covers it).

So the lane's membership is roughly "the stories currently in review", and its
correct size is frequently **zero** — including on a fresh project, which starts
there. Two consequences worth knowing before they surprise you:

- **The PR that retires the last spec is a normal, green PR.** A deletion matches
  the workflow's `paths:` filter exactly as an edit does, so that PR _does_ run
  the lane, and the lane then collects nothing. `pnpm test:e2e:acceptance`
  therefore carries **`--pass-with-no-tests`**: without it Playwright exits 1 on
  `No tests found` and the one PR that ends a receipt's life reports a red check
  on a diff that deletes a test — the most misreadable signal CI can give, whose
  obvious remedy is to put the spec back and keep every approved story's spec in
  the lane forever (MOTIR-2927). Do not remove the flag as a papered-over
  misconfiguration; an empty lane here is a legitimate state, not a broken one.
- **An empty lane still fails when a spec fails.** `--pass-with-no-tests` only
  changes the verdict on _zero collected tests_. One collected failing test is a
  red lane exactly as before.

## What CI does

| Run                                              | Records + checks           |
| ------------------------------------------------ | -------------------------- |
| PR that changes `tests/e2e/acceptance-X.spec.ts` | yes                        |
| PR that changes no acceptance spec               | **no run at all**          |
| Push to the default branch, lane holds ≥ 1 spec  | yes — the **baseline**     |
| Push to the default branch, lane is empty        | no — gate job only (~10 s) |

**CI publishes nothing** — that column used to exist and was retired by MOTIR-4097
(see _Who publishes the receipt_ below). The `paths:` scoping is unchanged, and it
is now load-bearing for one reason rather than two: a PR that owns no acceptance
spec must show **no acceptance check at all**, not a greyed `Skipped` one
(MOTIR-1958). The second reason is worth keeping in view because it governs
whoever publishes now, wherever they publish from:

1. **Publishing SUPERSEDES.** A new receipt for a story retires the previous one
   and unlinks its video for garbage collection. It is not additive.
2. **Each recording targets its OWN declared story**, from `acceptanceStory(...)`,
   not from the branch it was recorded on. A publisher that shipped everything it
   found would republish every story that has a spec, with clips no reviewer
   watched. That is exactly what happened in Motir's own CI before MOTIR-1937: one
   backend PR republished seven already-accepted stories.

So the lane lives in its **own workflow**,
[`.github/workflows/acceptance-tests.yml`](../.github/workflows/acceptance-tests.yml),
triggered by `on: pull_request: paths: ['tests/e2e/acceptance*.spec.ts']`, plus a
default-branch baseline.

### The default-branch baseline

That `paths:` filter is deliberately blind to your **app**. An acceptance spec
drives a real product surface, so the filter cuts straight between a page and the
only test that reads it: change the page, and the lane does not run. Widening the
filter is not the answer — the set of sources these specs read is most of your
app, so any honest widening runs the whole lane on nearly every PR, usually to
execute nothing at all.

So the lane **also runs on a push to the default branch**, which is why the table
above has two rows for it. Without that, a change that breaks an acceptance spec
merges green and then sits there until some unrelated PR happens to touch a spec
— and that PR's author inherits the diagnosis of somebody else's change. The
baseline puts the red on the merge that caused it.

Two properties keep that affordable, and both are asserted in
`tests/ci-acceptance-lane.test.ts`:

- **It is gated on the lane holding a spec.** A full run installs pnpm, generates
  a Prisma client, migrates a Postgres, downloads a Chromium and boots a dev
  server; the cost is the setup, not the specs, so an ungated trigger would pay
  it on every merge to run zero tests. A fresh project's lane is empty until
  someone writes the first acceptance spec, so that is the common case, not the
  edge case. The `membership` job is a checkout and a `find` — seconds — and the
  rest of the lane only starts if it finds something.
- **Superseded runs are cancelled on PRs only.** On a PR only the tip matters. On
  the default branch, back-to-back merges would cancel each other's baseline and
  leave exactly the "which merge broke it?" ambiguity the baseline removes.

This does not weaken the no-check-at-all requirement below. That requirement is
about **pull requests**; a `push` event attaches its checks to the commit on the
default branch and adds nothing to any open PR, so the gate can skip freely there
and cost no PR a check. For a `pull_request` event the gate answers `true`
unconditionally — the `paths:` filter has already decided.

What is still **not** covered, said plainly: the PR that breaks a spec goes green.
The baseline catches it one merge later, not before it lands. The accepted cost is
a red default branch for the length of one fix — bounded, attributed, and paid by
the author who caused it rather than by the next passer-by.

**Why a whole workflow, and not a job with an `if:`?** Because the requirement is
that a PR owning no acceptance spec shows no acceptance check _at all_, and a
job-level `if:` does not deliver that: a job whose `if:` is false is still
reported, as a greyed `Skipped` check — and so is any extra job added just to
compute the condition. Only a workflow that is never triggered leaves nothing on
the PR. This starter shipped the `if:` version first, under a comment claiming
the opposite; measured on PR #8, a PR touching no acceptance spec listed both
`Acceptance video  skipping` and `Changed acceptance specs  pass` (MOTIR-1958).

The trade is that a separate workflow cannot `needs:` another workflow's job or
read its artifacts. This lane needs neither — it runs against `pnpm dev` — but it
no longer waits for a green build, and its `env:` block is a copy of `ci.yml`'s
`e2e` job rather than a shared one. Change both together.

**Why the baseline never mattered for publishing.** The lane never publishes at
all now, so the question the old version of this section answered — should a merge
republish? — has no CI half left. The reasoning behind the answer is still the
reason the receipt belongs to the review moment: Motir's approve action moves a
story `in_review → done`, and `in_review` is the **PR-open** state, so a receipt
that only arrived after the merge would land once the story was already done and
the reviewer would never get to watch-then-approve.

## Who publishes the receipt (CHANGED — MOTIR-4097)

**The agent does, over the Motir MCP surface**, using the credential it already
holds to read the card and move it. CI publishes nothing and holds no Motir
credential.

So there is no repository secret to create, no `MOTIR_UPLOAD_TOKEN`, and no
`id-token: write` grant on any job — all three were retired with the uploader.
If you publish from something that is not an MCP client — your own CI, a script —
Motir's HTTP publish route is still there and is the supported door for it; see
`motir-core/docs/e2e/acceptance-video-byok.md`.

What CI still owes is the raw material: the clips, traces and `chapters.json`
sidecars, uploaded as the `playwright-report-acceptance` artifact on every run,
pass or fail.

## What turns the lane RED

One thing: **a failing acceptance spec**. The lane runs the specs and uploads its
Playwright report; there is nothing else in it that can fail.

Two things that USED to turn it red went with the publisher, and are recorded
because their absence is not obvious from the file: an upload that failed for a
story the PR owned, and a clip of that story's own too unpaced to watch. Nothing
in CI measures watchability now. Pacing is still the spec author's job (`chapter()`
paces itself, `beat()` adds a breath) and a clip nobody can follow is still a
receipt nobody can review — it is simply caught by the person watching it rather
than by a check.

**The lane still carries no `continue-on-error`, and it must not acquire one**
(MOTIR-2690). The original occurrence was the publish step: `continue-on-error`
rewrites a step's conclusion to `success` in the checks UI, in `gh pr checks`,
**and** in the REST API. Measured in Motir's own CI, the publish failed on every
run for three days — `Published 0 of 2`, two `##[error]` lines — while the lane
reported `pass` each time, and two stories lost their receipt with nothing anywhere
saying so. That step is gone; the prohibition is kept and widened to the whole
file, because a check that cannot fail is worse than no check whichever step wears
it. `tests/ci-acceptance-lane.test.ts` asserts it.

## The uploader was VENDORED here, and it is GONE (MOTIR-1941 → MOTIR-4097)

`scripts/upload-acceptance-video.mjs`, `.github/actions/upload-acceptance-video/`
and `tests/acceptance-video-uploader.test.ts` used to live here as **copies** of
motir-core's, kept in sync through a SYNC POINT comment and re-copied whenever
upstream moved. All three are **deleted** (MOTIR-4097): motir-core retired its own
publisher in MOTIR-4096, and a vendored copy of a retired publisher is a copy of
nothing.

That closes a hazard as well as removing dead code. The vendored action's manifest
could only be broken here — a `${'{'}{ }}` expression inside an input `description:`
stops GitHub converting the manifest at all, so the action never LOADS and the
calling step fails at the end of an otherwise green job (MOTIR-2937, measured on
this repo's PR #17). motir-core carried the guard for it, because this repo's own
CI never parses its manifests: this repo owns no acceptance spec, so the
`paths:`-filtered lane has never fired on a pull request. motir-core deleted that
guard with the action it guarded, which would have left this copy unguarded
everywhere — so the copy goes too. `.github/actions/` is now empty; a project
scaffolded from this template that adds its own composite action is on its own
format-validation terms, and none of ours.

The rent that vendoring charged is worth recording, since it is why the copy is
not simply re-pointed somewhere else. Between 2026-07-24 and 2026-08-11 this copy
fell four upstream cards behind, and one of them had changed the WIRE: MOTIR-2389
moved the blob store to S3, so `/upload-token` returned a presigned PUT URL and
the copy was still handing it to `@vercel/blob`'s `put` as a token. Nothing was
red, because the lane's `paths:` filter never fires here — the first person to hit
it would have been whoever wrote this repo's first acceptance spec.

Upstream: `motir-core/docs/e2e/acceptance-video-byok.md` (the consumer contract for
CI that still publishes over the HTTP route) and
`motir-core/docs/decisions/acceptance-video.md` (the policy, and MOTIR-4096's
amendment recording the handover).
