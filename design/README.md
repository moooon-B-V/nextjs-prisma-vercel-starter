# `design/` — the design assets, and how they reach your work items

A design task's deliverable lives here, and it is **three files per surface**,
sharing one basename, under an area folder:

```
design/
  <area>/                       e.g. work-items, settings, onboarding
    design-notes.md             ONE per area — the spec, indexing that area's surfaces
    <surface>.mock.html         the mockup, self-contained, built from the real design system
    <surface>.png               a full-page export of that mock
```

A surface with only notes and a mock, or a mock and a PNG, is **incomplete**.

## Why the folder exists at all

Two reasons, and the second is the one people miss.

**1. It is what the next agent builds to.** A UI task starts by opening the
mockup for its surface. Without one it improvises, and you get a screen nobody
designed.

**2. It is published to your work item.** Once the three files are committed,
the agent that drew them calls Motir's **`publish_design_result`** tool, naming
the card, and a reviewer reads the result **on the card in Motir** — the note
rendered, the mock in a sandboxed frame, the screenshot in the lightbox. No
GitHub trip, no raw-file URLs.

> ⚠️ **Nothing else makes that call.** There is no CI lane, no check and no
> background job that publishes for you. A design task that commits its three
> files and never calls the tool looks _identical_ to one that succeeded — files
> written, commit landed, pull request open, checks green — and the card is
> empty. The publish is the last step of the task, not a consequence of it.

## What each file is

### `design-notes.md` — per AREA, not per surface

One file per area, opening with a table that indexes the area's surfaces, then a
`##` section per surface: the primitives it composes, the exact copy, and the
colour + shape token for every element.

> **Publish the SECTIONS you wrote, never the whole file.** `publish_design_result`
> takes `noteMd`, and what belongs in it is the `##` sections this task changed —
> you wrote them, so you know which they are. This matters because a mature
> area's notes run to hundreds of kilobytes; the call caps `noteMd` at 64 KiB and
> truncates at a `##` boundary for display, while the complete file still ships
> as the `note_file` asset. A change confined to the index table above the first
> `##` publishes no section: the table is an index, and the section carries the
> meaning.

### `<surface>.mock.html` — the source of truth

Self-contained HTML built from the **real** design system: your `components/ui/*`
primitives' markup and your `globals.css` tokens. Colour through the semantic
element tokens, never the raw palette; shape through the element-semantic
radius / spacing / size tokens, never a fixed `rounded-md` / `p-2` / `h-9`.

A mock is usually a multi-panel board — closed and open, empty and populated,
light and dark — because the states are the part a code task cannot invent.

> **It renders in a fully restrictive sandbox.** When Motir shows your mock it
> loads it in an iframe with neither `allow-scripts` nor `allow-same-origin`, so
> a mock that needs JavaScript to render appears inert. Keep mocks static: inline
> CSS, no `<script>`, no remote assets.

### `<surface>.png` — the export

A full-page render of the mock. This is what a reviewer skims on the pull request
and what appears beside the mock on the work item. Render it with Playwright
chromium — full page, light theme, `deviceScaleFactor: 2`, viewport width ~1200.

## How a design reaches the right card

**You name it.** The call takes the work item's key, so nothing is inferred from
a branch, a pull-request title or a diff:

```
publish_design_result  key: "ACME-42"
  assets: [ the *.mock.html as `mock`,
            the .png as `image`,
            design-notes.md as `note_file` ]
  noteMd: the ## sections this task wrote
```

That is the point of the design, and it is worth one sentence on why. The
previous mechanism read a `<KEY>-<number>` out of the branch ref and then the
title — so a pull request that touched `design/**` in passing published those
assets onto whichever card its own branch happened to name, silently, under a
green check. A publisher that guesses its target from a string somebody typed
will eventually guess wrong. This one is told.

The server still refuses the two mistakes it can see: a **container** target
(a design result belongs to the leaf that produced it) and a key that is not a
child of a declared `withinParentKey`.

## Setup

**Nothing.** The agent publishes with its own Motir credential — the same one it
already holds to read the card and move it — on the `work_item:edit` permission
it already has.

There is no repository secret to set, no `MOTIR_UPLOAD_TOKEN`, no workflow to
enable and no OIDC permission to grant. If you are publishing from something
that is not an MCP client — your own CI, a design tool, a script — the REST
route `POST /api/work-items/{id}/design-evidence` is still there and is the
supported door for it.
