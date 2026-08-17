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

| Run                                              | Records + checks           | Publishes          |
| ------------------------------------------------ | -------------------------- | ------------------ |
| PR that changes `tests/e2e/acceptance-X.spec.ts` | yes                        | **only X's story** |
| PR that changes no acceptance spec               | **no run at all**          | nothing            |
| Push to the default branch, lane holds ≥ 1 spec  | yes — the **baseline**     | **nothing, ever**  |
| Push to the default branch, lane is empty        | no — gate job only (~10 s) | nothing            |

Two properties make that scoping necessary rather than tidy:

1. **Publishing SUPERSEDES.** A new receipt for a story retires the previous one
   and unlinks its video for garbage collection. It is not additive.
2. **Each recording targets its OWN declared story**, from `acceptanceStory(...)`,
   not from the PR. So a lane that ran everywhere would republish every story that
   has a spec, with clips recorded off an unrelated branch that no reviewer
   watched. That is exactly what happened in Motir's own CI before MOTIR-1937: one
   backend PR republished seven already-accepted stories.

So the lane lives in its **own workflow**,
[`.github/workflows/acceptance-video.yml`](../.github/workflows/acceptance-video.yml),
triggered by `on: pull_request: paths: ['tests/e2e/acceptance*.spec.ts']`, and
the uploader publishes only the recordings produced by the specs that PR
changed. The workflow recomputes that list itself (`git diff --name-only` against
the PR base) and passes it to the uploader, which **fails closed** — an empty
list owns nothing.

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

Three properties keep that affordable and safe, and all three are asserted in
`tests/acceptance-video-uploader.test.ts`:

- **It is gated on the lane holding a spec.** A full run installs pnpm, generates
  a Prisma client, migrates a Postgres, downloads a Chromium and boots a dev
  server; the cost is the setup, not the specs, so an ungated trigger would pay
  it on every merge to run zero tests. A fresh project's lane is empty until
  someone writes the first acceptance spec, so that is the common case, not the
  edge case. The `membership` job is a checkout and a `find` — seconds — and the
  rest of the lane only starts if it finds something.
- **The baseline never publishes.** Two independent mechanisms, because
  publishing supersedes: the publish step only runs for a `pull_request` event,
  and the owned-specs step emits an empty list on a push (there is no base ref to
  diff against), which the uploader fails closed on. A baseline run _rehearses_ —
  it records and checks the clips and writes none of them anywhere.
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

**Why not just publish from the default branch instead?** Because it breaks the
flow. Motir's approve action moves a story `in_review → done`, and `in_review` is
the **PR-open** state — merging is what flips the card to `done`. Publish only
after merge and the receipt lands once the story is already done, so the reviewer
never gets to watch-then-approve. This is why the baseline above **runs** the
lane on the default branch but never **publishes** from it: the two questions are
separate, and only the first one has changed.

## Publishing credentials

The publish is opt-in and no-ops without one of:

- **Keyless GitHub OIDC** — for a repo connected via the Motir GitHub App. The job
  already grants `id-token: write`; nothing to configure.
- **`MOTIR_UPLOAD_TOKEN`** — a Motir API token with the `integration` scope, added
  as a repository secret, for a repo that is not App-connected.

With neither present the job still records and checks; it just publishes nothing.

## What turns the lane RED (MOTIR-2690)

The publish step deliberately carries **no `continue-on-error`**, so its exit code
is the signal. It fails on exactly one thing: **a story this PR owns ending the
run without a published receipt** — a failed upload, a clip of its own that is
too unpaced to watch, or a video of its own too large for the publish target.

It does **not** fail on any of these:

- **No credential.** A fork PR gets neither OIDC nor the secret. The uploader logs
  that publishing is opt-in and returns 0.
- **A defect in a spec this run does not own.** An unwatchable or over-limit
  _rehearsed_ recording is reported, annotated as a `warning`, and counted
  separately. The PR that changes that spec is the one it fails.
- **An over-limit TRACE** (MOTIR-1911). The video _is_ the receipt; a debugging
  aid must not cost a story its evidence. The trace is dropped with a warning and
  the video publishes without it. An over-limit **video** is the fatal half.
- **A story that has already been accepted** (MOTIR-2768). The server refuses to
  supersede an approved receipt, and the uploader reports that as a `notice` and
  a `⏭️` summary line rather than a failure — once a backlog of accepted stories
  builds up it is the commonest answer the loop gets.

The per-file cap the size gate measures against defaults to 100 MB. **Set the
action's `max-artifact-bytes` to `10485760` if you self-host Motir** — off-cloud
the server's real cap is the 10 MB baseline, and left at the default the gate
waves through artifacts the store will reject.

`continue-on-error` was there so a side effect could never gate a merge, and it
did more than that: it rewrites the step's conclusion to `success` in the checks
UI, in `gh pr checks`, **and** in the REST API. Measured in Motir's own CI, the
publish failed on every run for three days — `Published 0 of 2`, two `##[error]`
lines — while the lane reported `pass` each time, and two stories lost their
receipt with nothing anywhere saying so. A check that cannot fail is worse than
no check, because it actively reassures. Do not add it back.

The `::error::` annotation and the job summary stay, so the reason lands on the
run page rather than thousands of lines into the raw log. They are a second
channel now, not the only one.

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

### Keeping the copy in sync (MOTIR-2693)

That rent came due once already. Between 2026-07-24 and 2026-08-11 this copy fell
four upstream cards behind, and one of them had changed the WIRE: MOTIR-2389 moved
the blob store to S3, so `/upload-token` returns a presigned PUT URL and the copy
was still handing it to `@vercel/blob`'s `put` as a token. Nothing was red, because
this repo owns no acceptance spec and the lane's `paths:` filter never fires it —
the first person to hit it would have been whoever wrote the first acceptance spec,
and what they would have seen is `Failed to parse URL from <a long opaque string>`
thrown from inside a third-party SDK.

So the three vendored files carry a **SYNC POINT** comment naming the motir-core
commit they were copied from, and the body below it is upstream **verbatim**:

| file                                                 | local edits                                                                                                                                                                                                       |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/upload-acceptance-video.mjs`                | the header only                                                                                                                                                                                                   |
| `.github/actions/upload-acceptance-video/action.yml` | the banner only                                                                                                                                                                                                   |
| `tests/acceptance-video-uploader.test.ts`            | the header, one commented divergence (`ALREADY_APPROVED_CODE` cannot be pinned to a motir-core class this repo does not have), and the `the acceptance-video lane` block, which asserts on _this_ repo's workflow |

Re-syncing is then `git -C motir-core show <ref>:<path>`, re-apply the header,
re-read the table. Every local edit you add outside that table is a hunk the next
sync has to adjudicate — prefer fixing it upstream and re-copying.

Upstream: `motir-core/docs/e2e/acceptance-video-byok.md` (the consumer contract)
and `motir-core/docs/decisions/acceptance-video.md` (the policy).
