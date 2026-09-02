// ⚠️ THIS FILE IS THE SURVIVING HALF of `tests/acceptance-video-uploader.test.ts`
// (MOTIR-4097). That file was vendored from motir-core alongside
// `scripts/upload-acceptance-video.mjs`, and it carried TWO unrelated things: the
// uploader's unit tests, which went with the uploader, and a starter-local block
// asserting on THIS repo's acceptance workflow, which did not. The lane
// assertions are re-homed here, under motir-core's own name for the same file, so
// a future re-sync has an obvious counterpart to read against.
//
// A workflow file is not typechecked, linted or executed by any suite, so the
// properties that make this lane HONEST are asserted here or nowhere.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const WORKFLOWS_DIR = path.join(process.cwd(), '.github/workflows');
const ACCEPTANCE_WORKFLOW = path.join(WORKFLOWS_DIR, 'acceptance-tests.yml');
const ACCEPTANCE_CONFIG = path.join(process.cwd(), 'playwright.acceptance.config.ts');

const workflow = fs.readFileSync(ACCEPTANCE_WORKFLOW, 'utf8');

/** The workflow with its comment lines dropped — what the file DOES, not what it says. */
function codeOf(yaml: string): string {
  return yaml
    .split('\n')
    .filter((l) => !/^\s*#/.test(l))
    .join('\n');
}

const code = codeOf(workflow);

/**
 * The YAML block for one top-level job, comments already stripped.
 *
 * Windowed to the NEXT job key rather than sliced to end-of-file: a
 * slice-to-EOF window equals "this job" only while it is the last one in the
 * file, and silently swallows whatever gets appended after it.
 */
function job(name: string): string {
  const lines = code.split('\n');
  const start = lines.findIndex((l) => l === `  ${name}:`);
  expect(start, `no job \`${name}\` in the workflow`).toBeGreaterThan(-1);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^ {2}\S.*:\s*$/.test(l));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n');
}

/** Every `.yml` / `.yaml` under `.github/`, as [path, text]. */
function ciYaml(): Array<readonly [string, string]> {
  const walk = (dir: string): string[] =>
    fs.existsSync(dir)
      ? fs
          .readdirSync(dir, { withFileTypes: true })
          .flatMap((e) =>
            e.isDirectory()
              ? walk(path.join(dir, e.name))
              : /\.ya?ml$/.test(e.name)
                ? [path.join(dir, e.name)]
                : [],
          )
      : [];
  return walk(path.join(process.cwd(), '.github')).map(
    (f) => [path.relative(process.cwd(), f), fs.readFileSync(f, 'utf8')] as const,
  );
}

describe('the acceptance lane is spec-scoped (MOTIR-1958)', () => {
  it('lives at the path the rename gave it, under the name it now claims', () => {
    // The check a scaffolded project's contributors actually SEE is the JOB's
    // display name, so it is asserted separately from the workflow's own `name:`.
    // Both used to read `Acceptance video` for a lane that publishes nothing
    // (MOTIR-4097, following motir-core's MOTIR-4096).
    expect(fs.existsSync(ACCEPTANCE_WORKFLOW)).toBe(true);
    expect(fs.existsSync(path.join(WORKFLOWS_DIR, 'acceptance-video.yml'))).toBe(false);
    expect(code).toMatch(/^name: Acceptance tests$/m);
    expect(job('acceptance')).toContain('name: Playwright E2E (acceptance)');
  });

  it('carries NO `continue-on-error` — a step that cannot go red is worse than none (MOTIR-2690)', () => {
    // The original card was about the publish step, which MOTIR-4097 retired:
    // `continue-on-error` rewrote its conclusion to `success` — in the checks UI,
    // in `gh pr checks`, AND in the REST API — so its exit code stopped being a
    // signal at all. Measured upstream (MOTIR-2499): from 2026-08-07 the publish
    // failed on every run while the lane reported `pass`, and two stories lost
    // their receipt silently.
    //
    // The step is gone and the assertion is KEPT, widened to the file: what it
    // was really protecting is that this lane can go red, and that is a property
    // of every step in it. A green lane whose tests did not run is the same
    // defect one step over.
    expect(code).not.toContain('continue-on-error');
  });

  it('runs on a push to the default branch, as well as on a spec-owning PR', () => {
    // Without this the lane only ever sees the PRs that edit a spec, which is
    // exactly the population that cannot break one by changing the app.
    expect(code).toMatch(/\n {2}push:\n {4}branches: \[main\]/);
    // ...and the PR trigger stays narrow. Widening it to the sources the specs
    // read is the alternative that was rejected: that set is most of the app,
    // so it would run this lane on nearly every pull request.
    expect(code).toMatch(/pull_request:\n\s*paths:\n\s*- 'tests\/e2e\/acceptance\*\.spec\.ts'/);
  });

  it('gates the fan-out on the lane actually holding a spec', () => {
    // An ungated `push:` trigger pays this lane's whole setup — pnpm, Prisma,
    // Postgres, Chromium, a dev server — on EVERY merge, to run zero tests
    // while the lane is empty, which is a template repo's permanent state.
    const gate = job('membership');
    expect(gate).toContain('run: ${{ steps.gate.outputs.run }}');
    expect(job('acceptance')).toContain('needs: membership');
  });

  it('leaves NO check on a pull request that owns no spec — the gate is push-only', () => {
    // The reason this lane is its own workflow rather than a job in ci.yml, and
    // the defect this repository is where it was FOUND (MOTIR-1958). A job whose
    // `if:` is false is still REPORTED, as a greyed `Skipped`, so the gate must
    // never be able to answer `false` for a `pull_request` event.
    // Two halves, and BOTH are load-bearing:
    //
    // 1. The gate short-circuits to `true` on `pull_request` before it looks at
    //    the count at all. A `push` event attaches its checks to the commit on
    //    the default branch and adds nothing to any open PR, so skipping there
    //    costs no pull request anything.
    expect(job('membership')).toMatch(
      /if \[ "\$\{EVENT_NAME\}" = 'pull_request' \]; then\n\s*RUN=true/,
    );
    // 2. The one PR-visible job's condition names the gate's output and NOTHING
    //    else. This is the assertion that stops a future edit from gating the
    //    lane on something a pull request can see (a label, an actor, a path)
    //    and quietly reintroducing the greyed check.
    const ifs = job('acceptance')
      .split('\n')
      .filter((l) => /^\s{4}if:/.test(l));
    expect(ifs).toEqual(["    if: needs.membership.outputs.run == 'true'"]);
  });

  it('does not let one merge cancel the previous merge`s baseline', () => {
    // Cancelling a superseded run is right for a PR (only the tip matters) and
    // wrong here: back-to-back merges would cancel each other and leave exactly
    // the "which merge broke it?" ambiguity the baseline exists to remove.
    expect(code).toMatch(/cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/);
  });
});

// ── MOTIR-4097 ───────────────────────────────────────────────────────────────
//
// The lane RECORDS and no longer PUBLISHES. CI stopped uploading the acceptance
// recording on 2026-09-01; the receipt is published by the AGENT over the Motir
// MCP surface, and the whole vendored publishing apparatus — the publish step,
// `scripts/upload-acceptance-video.mjs`, `.github/actions/upload-acceptance-video/`,
// the `ACCEPTANCE_*` env names and the owned-specs step that fed them — is gone,
// mirroring motir-core's MOTIR-4096.
//
// These are RETIREMENT guards, and they are the reason this block exists rather
// than the deletions simply being made. A deleted mechanism leaves no error
// message behind: nothing about a workflow is type-checked or linted, so a
// publish step re-vendored from an older copy of motir-core, or a
// `MOTIR_UPLOAD_TOKEN` wired back into a job "while we are in here", would ship
// silently — and it would ship into every project scaffolded from this template.
//
// ⚠️ THE PREDICATE IS SCOPED TO `.github/`, NOT TO THE REPOSITORY.
// `tests/e2e/_helpers/acceptance-video.ts` (the recording harness) keeps its
// name deliberately — motir-core keeps it too, and specs import from it. What
// must not come back is a CI JOB that publishes, or one handed a Motir
// credential.
describe('the lane records and does not publish (MOTIR-4097)', () => {
  it('finds the CI files it is meant to police', () => {
    // Every assertion below is an ABSENCE, and a walker that returns nothing
    // reads exactly like a repository with nothing to find. `.github/` holds at
    // least the three workflows.
    const files = ciYaml().map(([f]) => f);
    expect(files).toContain('.github/workflows/acceptance-tests.yml');
    expect(files.length).toBeGreaterThanOrEqual(3);
  });

  it('no workflow or action runs the retired uploader', () => {
    const offenders = ciYaml()
      .filter(([, text]) => /upload-acceptance-video/.test(codeOf(text)))
      .map(([f]) => f);
    expect(offenders).toEqual([]);
    expect(fs.existsSync(path.join(process.cwd(), 'scripts/upload-acceptance-video.mjs'))).toBe(
      false,
    );
    expect(fs.existsSync(path.join(process.cwd(), '.github/actions/upload-acceptance-video'))).toBe(
      false,
    );
  });

  it('no job anywhere is handed a Motir credential', () => {
    // The security half: the publish step shipped an `integration` PAT into a job
    // that has nothing left to do with it, and a credential with no consumer is
    // one nobody thinks about when deciding whether to rotate it. In a TEMPLATE
    // it is also a secret every scaffolded project is told to create.
    const offenders = ciYaml()
      .filter(([, text]) => /MOTIR_UPLOAD_TOKEN/.test(codeOf(text)))
      .map(([f]) => f);
    expect(offenders).toEqual([]);
  });

  it('the acceptance lane keeps no publish scaffolding of its own', () => {
    // The env names and the owned-specs step existed ONLY to feed the uploader:
    // `changed-specs` was the ownership filter (MOTIR-1937), and the step that
    // computed it diffed the PR's base for changed specs. With nothing reading
    // them they are dead weight that reads like live machinery.
    expect(code).not.toMatch(/ACCEPTANCE_[A-Z_]+:/);
    expect(code).not.toContain('owned-specs');
    expect(code).not.toContain('BASE_SHA');
  });

  it('mints no OIDC token — nothing in any workflow publishes', () => {
    // Keyless publish (MOTIR-1650) is what `id-token: write` was for.
    const offenders = ciYaml()
      .filter(([, text]) => /^\s*id-token:\s*write/m.test(codeOf(text)))
      .map(([f]) => f);
    expect(offenders).toEqual([]);
  });

  it('still RECORDS, and still keeps the report the recording is read from', () => {
    // The negative controls for the four assertions above. Retiring the uploader
    // must not retire the recording: the clips, traces and `chapters.json` are
    // what the agent publishes FROM, so a lane that stopped emitting them would
    // pass every "no publisher" check while destroying the deliverable.
    expect(fs.readFileSync(ACCEPTANCE_CONFIG, 'utf8')).toMatch(/mode:\s*'on'/);
    const acceptance = job('acceptance');
    expect(acceptance).toContain('name: playwright-report-acceptance');
    expect(acceptance).toContain('path: out/playwright-report-acceptance');
    expect(acceptance).toMatch(/if:\s*always\(\)/);
  });
});
