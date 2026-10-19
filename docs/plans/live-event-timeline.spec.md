---
type: spec
status: active
title: Live event timeline pipeline
goal: Turn the hand-run Reyes hearing timeline into a reusable, config-driven pipeline that builds and live-updates a cited, hour-by-hour timeline of any event covered by live social posts.
items:
  - id: event-config
    title: Event config schema and loader
    tier: architecture
    needs: []
  - id: post-schema
    title: Normalized post schema and pinned snapshot format
    tier: architecture
    needs: []
  - id: pipeline-layout
    title: Reusable pipeline layout with per-event directories
    tier: architecture
    needs: []
  - id: bluesky-adapter
    title: Bluesky ingest adapter
    tier: feature
    needs: [event-config, post-schema, pipeline-layout]
  - id: deterministic-prep
    title: Deterministic prep of posts before composition
    tier: feature
    needs: [post-schema, pipeline-layout]
  - id: entries-render
    title: Entries schema and renderer
    tier: feature
    needs: [event-config, pipeline-layout]
  - id: compose-step
    title: Incremental model compose step with pinned outputs
    tier: feature
    needs: [deterministic-prep, entries-render]
  - id: build-gates
    title: Build and publish verification gates
    tier: feature
    needs: [deterministic-prep, entries-render]
  - id: live-runner
    title: Live runner with settle window, stop condition, and publish
    tier: feature
    needs: [bluesky-adapter, compose-step, build-gates]
  - id: migrate-reyes
    title: Migrate the Reyes hearing timeline onto the pipeline
    tier: feature
    needs: [bluesky-adapter, entries-render, build-gates]
  - id: cloudflare-cron-runner
    title: Run the live runner on a Cloudflare cron trigger
    tier: polish
    needs: [live-runner]
  - id: live-timeline-skill
    title: Claude Code skill to start and steer a live timeline
    tier: polish
    needs: [live-runner, migrate-reyes]
  - id: more-adapters
    title: Additional ingest adapters (Mastodon, RSS)
    tier: polish
    needs: [bluesky-adapter]
constraints:
  - "Every fetched post is either cited in the rendered timeline or explicitly listed as omitted; a silent drop is a build failure."
  - "Dialogue is the reporters' paraphrase; nothing is added that is not in a cited post, and compiler notes are marked (ed.)."
  - "Reporters and their outlet are credited and linked at the top of every rendered page, with the outlet's support link when one exists."
  - "No secret or API key ever appears in a published page or committed file; server-side secrets live in the host's secret store."
  - "Zod v4 schemas at every foreign-data boundary (platform API responses, config, model output), parsed at the boundary and enforced on both emitter and consumer sides (~/.claude/CLAUDE.md data doctrine items 1 and 3)."
  - "Every data manipulation is deterministic and replayable from pinned inputs; model calls are captured once as pinned, hashed inputs and never run inline during a rebuild (~/.claude/CLAUDE.md data doctrine item 4)."
  - "Each data-artifact producer carries @displayName / @strategicPurpose / @tacticalObjective TSDoc tags for the schema registry (~/.claude/CLAUDE.md data doctrine item 2)."
  - "Preferred stack: TypeScript, Zod, Vitest, tsx, Pino, native fetch (~/.claude/CLAUDE.md preferred stack)."
  - "Long-running scripts emit heartbeat progress via ~/.claude/lib/progress.mjs and fail loudly rather than reporting a broken fetch as no new posts."
tracker: github
---

# Live event timeline pipeline

Source design: the eight-stage pipeline proposed in the Reyes hearing session on 2026-10-19 (event config, ingest adapters, deterministic prep, compose, render, gates, publish, runner). The current hand-run implementation lives in this repo: `src/fetch.sh`, `src/build.sh`, `src/watch.mjs`, `src/timeline.md`, `worker/`.

## event-config — Event config schema and loader

**Goal**: Move everything event-specific (sources, time window, time zone, credits, glossary, publish target, stop phrase) out of scripts and into one validated config file per event. Every later stage reads the config instead of hard-coding Parloff, Roberts, or the Reyes hearing.

**Acceptance**:
- A Zod v4 schema defines the config; a fixture config for the Reyes hearing parses clean.
- An invalid config (missing source handle, bad time zone, unknown platform) fails with a message naming the field.
- The config covers: sources (platform, handle, thread root or time window, citation prefix), time zone, title, credits (names, profile links, outlet, support link), who's-who and glossary, publish target, project slug for the visit beacon, stop phrases.

**Touches**: `src/config/schema.ts`, `src/config/load.ts`, `events/reyes-2026-10-19/event.yaml`

**Open gaps**: config file format (YAML or JSON) not decided.

## post-schema — Normalized post schema and pinned snapshot format

**Goal**: Define one platform-neutral post shape that every adapter emits and every downstream stage consumes, and one snapshot file format so each fetch is a pinned, hashable input.

**Acceptance**:
- A Zod v4 schema defines a post: id, source prefix, author handle, timestamp, text, url, image alt text, quoted text, reply root.
- A snapshot file records the posts plus fetch metadata (source, fetched-at, input hash) and round-trips through the schema.
- The current `src/data/parloff.json` and `src/data/roberts.json` convert to the new format with a committed transform, not by hand.

**Touches**: `src/posts/schema.ts`, `src/posts/snapshot.ts`, `events/*/snapshots/`

**Open gaps**: none

## pipeline-layout — Reusable pipeline layout with per-event directories

**Goal**: Separate the reusable pipeline code from per-event data so a new event is a new directory, not a copy of the repo. Decide whether the pipeline lives in this repo or a new template repo.

**Acceptance**:
- The layout has a pipeline package (`src/`) and one directory per event (`events/<slug>/`) holding config, snapshots, entries, and rendered output.
- A TypeScript project builds with `tsc --noEmit` and runs a Vitest smoke test.
- The README documents how to add a new event directory.

**Touches**: `package.json`, `tsconfig.json`, `src/`, `events/`, `README.md`

**Open gaps**: whether to extract into a new `live-event-timeline` repo or keep it in this repo with the Reyes event as the first directory.

## bluesky-adapter — Bluesky ingest adapter

**Goal**: Port `src/fetch.sh` to a TypeScript adapter behind a common adapter interface. It fetches an author feed with paging, filters by thread root or time window, and writes a pinned snapshot.

**Acceptance**:
- The adapter pages the public `getAuthorFeed` API with a URL-encoded cursor and stops once posts predate the window.
- It filters by thread root when the config gives one, and by time window otherwise. It never relies on `getPostThread`, which truncated at 11 posts.
- Every API response is parsed with Zod at the boundary. A shape change fails loudly instead of returning an empty list.
- A Vitest test with a recorded API fixture yields the expected posts. A second test with a broken fixture fails with a clear error.

**Touches**: `src/adapters/types.ts`, `src/adapters/bluesky.ts`, `test/adapters/bluesky.test.ts`

**Open gaps**: none

## deterministic-prep — Deterministic prep of posts before composition

**Goal**: Do every step that needs no judgment in code: dedupe, sort, local-time conversion, hour bucketing, stable citation numbering per source, and pairing of posts from different sources that land in the same time window.

**Acceptance**:
- Given the same snapshots, prep output is byte-identical across runs, with no `Date.now()`, randomness, or locale-sensitive sort.
- Citation numbers are stable: a new post never renumbers existing citations.
- Cross-source pairs are emitted as candidate groups for the compose step.
- Vitest tests cover dedupe, numbering stability, hour bucketing across a DST boundary, and pairing.

**Touches**: `src/prep/`, `test/prep/`

**Open gaps**: pairing window width (2 minutes or 3) not decided.

## entries-render — Entries schema and renderer

**Goal**: Define the structured timeline entry, and render the page from entries plus config instead of hand-edited Markdown.

**Acceptance**:
- A Zod v4 schema defines an entry: time range, hour, text, citations, tags (nonverbal, notable, conflict), and an optional editor note.
- The renderer outputs:
  - the credits block
  - the how-to-read legend with 👀
  - who's-who
  - hour headings
  - entries with citations in collapsed reference form `[P12][]`
  - open items
  - a "How this was compiled" section generated from run stats
  - the source link definitions
- Adjacent citations render as separate links on GitHub Pages (kramdown). A test checks the rendered HTML.
- Rendering is deterministic: the same entries and config give byte-identical output.

**Touches**: `src/entries/schema.ts`, `src/render/`, `test/render/`

**Open gaps**: none

## compose-step — Incremental model compose step with pinned outputs

**Goal**: Use a model to turn new posts into timeline entries, incrementally. Its output is saved as a pinned input, so rebuilds never call the model again.

**Acceptance**:
- The model receives only the posts since the last composed cursor, plus the last few entries for context. It returns entries that parse against the entries schema.
- Every model call's request and response are saved under `events/<slug>/compose/` with a hash. A rebuild reads these and makes no network call.
- Output that fails the schema, or that cites a post id not in the input, is rejected and logged, and is never merged.
- Cross-source conflicts are emitted as entries tagged `conflict`, with an editor note.

**Touches**: `src/compose/`, `test/compose/`

**Open gaps**:
- Model and provider not chosen.
- Whether the compose step runs in the runner or in a Claude Code session.

## build-gates — Build and publish verification gates

**Goal**: Fail the build, not the reader, when output is wrong. These gates encode the checks done by hand on 2026-10-19.

**Acceptance**:
- Every citation in the rendered page resolves to a link definition.
- Every fetched post is either cited or listed in an explicit omissions list with a reason.
- Every rendered link points at a post that exists in a snapshot.
- After publish, a check fetches the live page and confirms the new build is serving. It gets a cache-busting query and matches the commit.
- Each gate exits non-zero with a message naming the failing item.

**Touches**: `src/gates/`, `test/gates/`

**Open gaps**: none

## live-runner — Live runner with settle window, stop condition, and publish

**Goal**: Replace `src/watch.mjs` with a runner that polls, waits out a burst of posts, runs prep, compose, render, and gates, publishes, and stops on its own.

**Acceptance**:
- It polls on a configurable interval and waits a configurable settle window after new posts before updating.
- It stops on a configured stop phrase in a source post, on an idle timeout, or after 3 consecutive fetch failures. Each stop reason is printed and written to the progress file.
- It publishes by committing the rendered output to the configured branch (`gh-pages` by default) and never pushes to `main`.
- It emits heartbeat progress via `~/.claude/lib/progress.mjs`.
- Paths with spaces work. A test runs it from a directory containing a space (the `%20` bug).

**Touches**: `src/runner/`, `test/runner/`

**Open gaps**: none

## migrate-reyes — Migrate the Reyes hearing timeline onto the pipeline

**Goal**: Make the Reyes hearing the first event on the pipeline. Convert the hand-written `src/timeline.md` into entries once, with a committed transform, and check the result matches the live page.

**Acceptance**:
- A committed one-time transform converts `src/timeline.md` into `events/reyes-2026-10-19/entries.json`.
- The rendered page keeps every citation, entry, and 👀 tag of the current page. A diff script reports any loss.
- The visit beacon snippet and project slug come from config.
- The old `src/fetch.sh`, `src/build.sh`, and `src/watch.mjs` are deleted once parity passes.

**Touches**: `events/reyes-2026-10-19/`, `src/migrate/`, `src/fetch.sh`, `src/build.sh`, `src/watch.mjs`

**Open gaps**: none

## cloudflare-cron-runner — Run the live runner on a Cloudflare cron trigger

**Goal**: Run live updates off the laptop, so they survive a closed session and avoid the macOS launchd problem with jobs on external volumes.

**Acceptance**:
- A Worker with a per-minute cron trigger runs one runner tick and publishes through the GitHub API.
- The GitHub token and model key live in Worker secrets. None appears in a committed file.
- A stop condition disables further ticks for that event.

**Touches**: `worker/`, `src/runner/`

**Open gaps**: whether the compose model call can run inside the Worker's CPU limits or needs a queue.

## live-timeline-skill — Claude Code skill to start and steer a live timeline

**Goal**: A `/live-timeline` skill that drafts an event config with the user, starts the runner, and handles the judgment calls the compose step flags (conflicts, omissions).

**Acceptance**:
- `/live-timeline <url-or-config>` produces a valid event config from a starting thread URL and confirms the sources.
- It starts the runner and reports the page URL.
- It surfaces `conflict`-tagged entries for review instead of publishing them silently.

**Touches**: `~/.claude/skills/live-timeline/SKILL.md`

**Open gaps**: none

## more-adapters — Additional ingest adapters (Mastodon, RSS)

**Goal**: Prove the adapter interface generalizes by adding a second and third platform.

**Acceptance**:
- A Mastodon adapter and an RSS adapter emit posts that parse against the post schema.
- Each adapter has a recorded-fixture Vitest test, plus a broken-fixture test that fails loudly.

**Touches**: `src/adapters/mastodon.ts`, `src/adapters/rss.ts`, `test/adapters/`

**Open gaps**: none

## Non-goals

- No transcription of court audio or video in this spec. Only text posts from reporters are ingested.
- No editorial writing beyond merging and cleaning up the reporters' own posts. The pipeline does not summarize or analyze the event.
- No paywalled or login-only sources.
- No change to the visit beacon Worker's logging behavior beyond reading its project slug from config.
