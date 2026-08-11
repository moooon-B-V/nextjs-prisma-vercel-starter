import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  authHeadersFor,
  buildPublishSet,
  classifyDesignPath,
  collectChangedDesignFiles,
  contentTypeFor,
  extractChangedNoteSections,
  main,
  parseHunkRanges,
  parseWorkItemKey,
  publishDesignResult,
  resolveTargetKey,
  splitNoteSections,
} from '../scripts/upload-design-assets.mjs';

// The design-result publisher and its lane. Git and the filesystem are INJECTED,
// so nothing here needs repository state or a network.
//
// Vendored from motir-core alongside the script itself: a scaffolded project has
// no dependency on motir-core, so the tests travel with the copy. Keep the two
// recognisably identical.

const ROOT = process.cwd();

describe('resolving the target card', () => {
  it('reads a key out of a branch ref or a PR title', () => {
    expect(parseWorkItemKey('design/ACME-42-settings-panel')).toBe('ACME-42');
    expect(parseWorkItemKey('Design — the settings panel (ACME-42)')).toBe('ACME-42');
    expect(parseWorkItemKey('acme-42')).toBe('ACME-42');
    expect(parseWorkItemKey('no key here')).toBeNull();
  });

  it('prefers an explicit override, then the branch, then the title', () => {
    expect(resolveTargetKey({ DESIGN_TARGET_KEY: 'acme-1' })).toEqual({
      key: 'ACME-1',
      source: 'explicit',
    });
    expect(
      resolveTargetKey({ DESIGN_PR_REF: 'design/ACME-2-x', DESIGN_PR_TITLE: 'x (ACME-3)' }),
    ).toEqual({ key: 'ACME-2', source: 'branch' });
    expect(resolveTargetKey({ DESIGN_PR_TITLE: 'x (ACME-3)' })).toEqual({
      key: 'ACME-3',
      source: 'title',
    });
  });

  it('resolves to NOTHING rather than guessing — there is no fallback', () => {
    // A design attached to the WRONG card makes another card look designed when
    // it is not, which is worse than one attached to none.
    expect(resolveTargetKey({})).toEqual({ key: null, source: 'none' });
    expect(resolveTargetKey({ DESIGN_PR_REF: 'chore/tidy' })).toEqual({
      key: null,
      source: 'none',
    });
  });
});

describe('classifying and collecting the changed set', () => {
  it('recognises the three artifact kinds and nothing else', () => {
    expect(classifyDesignPath('design/settings/a.mock.html')).toBe('mock');
    expect(classifyDesignPath('design/settings/a.png')).toBe('image');
    expect(classifyDesignPath('design/settings/design-notes.md')).toBe('note');
    expect(classifyDesignPath('design/README.md')).toBeNull();
    expect(classifyDesignPath('design/settings/a.pen')).toBeNull();
  });

  it('maps each kind to its content type', () => {
    expect(contentTypeFor('mock')).toBe('text/html');
    expect(contentTypeFor('image')).toBe('image/png');
    expect(contentTypeFor('note_file')).toBe('text/markdown');
  });

  it('separates artifacts, notes, ignored paths and deletions', () => {
    const changed = [
      'design/settings/panel.mock.html',
      'design/settings/panel.png',
      'design/settings/design-notes.md',
      'design/README.md',
      'design/settings/gone.mock.html',
    ].join('\n');

    const out = collectChangedDesignFiles({
      base: 'base',
      git: () => changed,
      exists: (p: string) => !p.endsWith('gone.mock.html'),
      cwd: ROOT,
    });

    expect(out.assets).toEqual([
      { kind: 'mock', sourcePath: 'design/settings/panel.mock.html' },
      { kind: 'image', sourcePath: 'design/settings/panel.png' },
    ]);
    expect(out.notes).toEqual(['design/settings/design-notes.md']);
    expect(out.ignored).toEqual(['design/README.md']);
    expect(out.deleted).toEqual(['design/settings/gone.mock.html']);
  });
});

describe('scoping the note to the sections a PR changed', () => {
  const note = [
    '# Settings — design notes',
    '',
    '| Surface | Asset |',
    '| --- | --- |',
    '| Panel | a |',
    '',
    '## Panel', // line 7
    'first body',
    '',
    '## Dialog', // line 10
    'second body',
    '',
    '## Empty state', // line 13
    'third body',
  ].join('\n');
  const readFile = () => note;

  it('reads the NEW-side range of each hunk, deletions included', () => {
    expect(
      parseHunkRanges(['@@ -1,3 +1,4 @@', '@@ -40 +41 @@', '@@ -9,5 +9,0 @@'].join('\n')),
    ).toEqual([
      { start: 1, end: 4 },
      { start: 41, end: 41 },
      { start: 9, end: 9 },
    ]);
  });

  it('splits on `##` only — `###` subsections travel with their parent', () => {
    const withSub = '## One\n### Detail\nbody\n## Two\nbody';
    const sections = splitNoteSections(withSub);
    expect(sections).toHaveLength(2);
    expect(sections[0]!.text).toContain('### Detail');
  });

  it('publishes ONLY the section a hunk landed in', () => {
    const out = extractChangedNoteSections({
      notePath: 'n.md',
      base: 'b',
      git: () => '@@ -8 +8 @@',
      readFile,
    });
    expect(out.noteMd).toContain('## Panel');
    expect(out.noteMd).not.toContain('## Dialog');
  });

  it('publishes two changed sections in file order, de-duplicated', () => {
    const out = extractChangedNoteSections({
      notePath: 'n.md',
      base: 'b',
      git: () => ['@@ -14 +14 @@', '@@ -8 +8 @@', '@@ -9 +9 @@'].join('\n'),
      readFile,
    });
    expect(out.sections).toBe(2);
    expect(out.noteMd!.indexOf('## Panel')).toBeLessThan(out.noteMd!.indexOf('## Empty state'));
    expect(out.noteMd).not.toContain('## Dialog');
  });

  it('publishes NOTHING for a change confined to the index table', () => {
    // The table above the first `##` is an INDEX. Falling back to the whole file
    // would attach every surface of the area as "this card's note".
    const out = extractChangedNoteSections({
      notePath: 'n.md',
      base: 'b',
      git: () => '@@ -5 +5 @@',
      readFile,
    });
    expect(out.noteMd).toBeNull();
    expect(out.reason).toBe('above-first-section');
  });
});

describe('assembling and sending the publish', () => {
  it('adds the note as a note_file asset ALONGSIDE the inline note', () => {
    const out = buildPublishSet({
      collected: { assets: [{ kind: 'mock', sourcePath: 'design/a/x.mock.html' }] },
      noteResult: { noteMd: '## X\n\nbody', notePath: 'design/a/design-notes.md' },
    });
    expect(out.noteMd).toBe('## X\n\nbody');
    expect(out.assets.map((a: { kind: string }) => a.kind)).toEqual(['mock', 'note_file']);
  });

  it('marks a keyless publish, and falls back to a bare bearer', () => {
    expect(authHeadersFor('jwt', 'pat')).toEqual({
      authorization: 'Bearer jwt',
      'x-motir-auth': 'github-oidc',
    });
    expect(authHeadersFor(null, 'pat')).toEqual({ authorization: 'Bearer pat' });
  });

  it('mints, PUTs every artifact, then registers the pathnames', async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      calls.push(url);
      if (url.endsWith('/upload-token')) {
        return {
          ok: true,
          json: async () => ({
            targets: [
              {
                kind: 'mock',
                sourcePath: 'design/a/x.mock.html',
                pathname: 'design/ws/i/x.mock.html',
                token: 'https://store.example/put/x',
                contentType: 'text/html',
              },
            ],
          }),
        };
      }
      if (url.startsWith('https://store.example/')) return { ok: true };
      return { ok: true, json: async () => ({ evidence: { id: 'ev-1' } }) };
    });

    const evidence = await publishDesignResult({
      baseUrl: 'https://app.example',
      targetKey: 'ACME-1',
      assets: [{ kind: 'mock', sourcePath: 'design/a/x.mock.html' }],
      noteMd: null,
      headers: { authorization: 'Bearer t' },
      fetchImpl: fetchImpl as never,
      readFileBuffer: () => Buffer.from('<html></html>'),
    });

    expect(evidence).toEqual({ id: 'ev-1' });
    expect(calls).toEqual([
      'https://app.example/api/work-items/ACME-1/design-evidence/upload-token',
      'https://store.example/put/x',
      'https://app.example/api/work-items/ACME-1/design-evidence',
    ]);
  });

  it('fails loudly when the mint is refused', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 403, text: async () => 'no' }));
    await expect(
      publishDesignResult({
        baseUrl: 'https://app.example',
        targetKey: 'ACME-1',
        assets: [{ kind: 'mock', sourcePath: 'a' }],
        noteMd: null,
        headers: {},
        fetchImpl: fetchImpl as never,
      }),
    ).rejects.toThrow(/403/);
  });
});

describe('the two ways the lane exits 0 WITHOUT publishing', () => {
  const logger = () => {
    const lines: string[] = [];
    return { log: (m: string) => lines.push(m), lines };
  };
  const oneMock = {
    assets: [{ kind: 'mock', sourcePath: 'design/a/x.mock.html' }],
    notes: [],
    ignored: [],
    deleted: [],
  };

  it('an UNRESOLVABLE target publishes nothing, and says what it would have sent', async () => {
    const log = logger();
    const publish = vi.fn();
    expect(
      await main({ DESIGN_BASE_SHA: 'base' }, log as never, { collect: () => oneMock, publish }),
    ).toBe(0);
    expect(publish).not.toHaveBeenCalled();
    expect(log.lines.join(' ')).toContain('NOT publishing');
  });

  it('no OIDC and no token → publishing is opt-in, and a fork PR does not fail', async () => {
    const log = logger();
    const publish = vi.fn();
    expect(
      await main({ DESIGN_BASE_SHA: 'base', DESIGN_PR_REF: 'design/ACME-1-x' }, log as never, {
        collect: () => oneMock,
        requestOidc: async () => null,
        publish,
      }),
    ).toBe(0);
    expect(publish).not.toHaveBeenCalled();
    expect(log.lines.join(' ')).toContain('opt-in');
  });

  it('publishes keylessly when an OIDC identity resolves', async () => {
    const log = logger();
    const publish = vi.fn(async (_args: Record<string, unknown>) => ({ id: 'ev-2' }));
    await main({ DESIGN_BASE_SHA: 'base', DESIGN_PR_REF: 'design/ACME-7-panel' }, log as never, {
      collect: () => oneMock,
      requestOidc: async () => 'jwt',
      publish,
    });

    const call = publish.mock.calls[0]![0];
    expect(call.targetKey).toBe('ACME-7');
    expect(call.headers).toEqual({ authorization: 'Bearer jwt', 'x-motir-auth': 'github-oidc' });
  });
});

// ── The lane itself ─────────────────────────────────────────────────────────
//
// A workflow file is not typechecked, linted or executed by any suite, so the
// four properties that make this lane safe are asserted here or nowhere.

describe('the design-result lane', () => {
  const wf = readFileSync(join(ROOT, '.github/workflows/design-result.yml'), 'utf8');
  const code = wf
    .split('\n')
    .filter((l) => !/^\s*#/.test(l))
    .join('\n');

  it('triggers ONLY on a pull request that touches a design asset', () => {
    // A PR touching no design asset must show NO check — not a skipped one. Only
    // an untriggered workflow leaves nothing behind (MOTIR-1958).
    expect(code).toMatch(/^on:\s*$/m);
    expect(code).toMatch(/pull_request:/);
    expect(code).toContain("- 'design/**'");
    expect(code).not.toMatch(/^\s{2}push:/m);
  });

  it('triggers on its OWN definition too, so a lane change cannot ship unexecuted', () => {
    expect(code).toContain('.github/workflows/design-result.yml');
    expect(code).toContain('scripts/upload-design-assets.mjs');
  });

  it('requests `id-token: write`, or the keyless publish cannot authenticate', () => {
    expect(code).toMatch(/permissions:[\s\S]*id-token:\s*write/);
  });

  it('carries NO `continue-on-error` — a lost publish must be able to go red', () => {
    expect(code).not.toContain('continue-on-error');
  });
});
