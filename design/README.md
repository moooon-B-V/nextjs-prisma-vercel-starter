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

**2. It is published to your work item.** On a pull request that touches
`design/**`, the `Design result` lane sends the changed assets to the card the
branch names, and a reviewer reads them **on the card in Motir** — the note
rendered, the mock in a sandboxed frame, the screenshot in the lightbox. No
GitHub trip, no raw-file URLs.

That publish is automatic. There is nothing to upload.

## What each file is

### `design-notes.md` — per AREA, not per surface

One file per area, opening with a table that indexes the area's surfaces, then a
`##` section per surface: the primitives it composes, the exact copy, and the
colour + shape token for every element.

> **The publisher scopes the note to the SECTIONS your PR changed.** It maps each
> diff hunk to its nearest enclosing `##` heading and publishes those sections
> whole. So a card that adds one surface publishes one section, not the whole
> file — which matters, because a mature area's notes run to hundreds of
> kilobytes. A change confined to the index table above the first `##` publishes
> no note: the table is an index, and the section carries the meaning.

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

The publisher resolves the target from your **branch name** first, then the **PR
title**, looking for a `<KEY>-<number>` work-item key:

```
design/ACME-42-settings-panel        →  publishes to ACME-42
```

**There is no fallback.** If neither carries a key, the lane logs what it would
have published and exits 0 without publishing — a design attached to the wrong
card is worse than one attached to none.

## Setup

Nothing, if your repository is connected to Motir through the GitHub App: the
lane authenticates keylessly off its own GitHub Actions OIDC identity.

Otherwise set a `MOTIR_UPLOAD_TOKEN` repository secret to a Motir API token with
the `integration` scope. With neither, the lane logs that publishing is opt-in
and exits 0 — it never fails your build.
