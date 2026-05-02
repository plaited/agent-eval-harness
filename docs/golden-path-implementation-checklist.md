# Golden path implementation checklist

Checklist derived from the agreed product direction: opinionated runner, **`capture` → `summarize --markdown`**, starter under **`examples/golden-path/`**, canonical **`schemas/claude-headless.json`** shipped in npm, tutorial in **`examples/golden-path/README.md`** (repo-root paths), CI static validation only, agent skill hybrid (summary + link + agent notes), optional CLI default schema later.

## Schema and tests

- [ ] Add **`schemas/claude-headless.json`** as the canonical headless schema (publishable path).
- [ ] Point **`src/headless/tests/fixtures/claude-headless.json`** at the canonical file (import/re-export, symlink, or single source + CI sync) so tests and docs cannot drift.

## Starter bundle

- [ ] Add **`examples/golden-path/prompts.jsonl`** (minimal valid prompts for first run).
- [ ] Add **`examples/golden-path/README.md`** — canonical walkthrough: repo-root **`cwd`**, commands through **`capture`** then **`summarize --markdown`**, paths **`examples/golden-path/...`** and **`schemas/claude-headless.json`**.

## Package publishing

- [ ] Extend **`package.json`** field **`files`** to include **`schemas/**`** and **`examples/golden-path/**`** so **`bunx` / `npm`** installs contain the golden-path assets.
- [ ] Document how to run from the **installed package directory** (e.g. under `node_modules/@plaited/agent-eval-harness`) or after **copying** `schemas/` + `examples/golden-path/` into the user’s project (wherever you put this: root README and/or golden-path README).

## Root README

- [ ] Add a short **Quickstart** (or equivalent) in **`README.md`** that links to **`examples/golden-path/README.md`**.
- [ ] Align all **`--schema`** / path examples with **published** layout (no references to paths that are not in the tarball, e.g. test-only fixture paths).

## CI (static only)

- [ ] **`schemas/claude-headless.json`** parses / validates as expected by existing harness validation (reuse or mirror headless schema checks).
- [ ] **`examples/golden-path/prompts.jsonl`** is valid JSONL and matches the prompt schema the CLI expects.
- [ ] Paths and filenames referenced in **`examples/golden-path/README.md`** exist in the repo (and, after publish, would exist in the package — optional script or simple grep/guard).
- [ ] Do **not** add default CI jobs that run **`capture`** against live APIs (no secrets / flake in PR CI).

## Agent skill

- [ ] Update **`.agents/skills/agent-eval-harness/SKILL.md`** (or equivalent) with **hybrid** golden-path guidance: short step summary, **link** to **`examples/golden-path/README.md`**, and **agent-only** notes (workspace, env vars, parallelism) that stay out of the human walkthrough.

## Follow-up (explicitly later)

- [ ] Optional **CLI default schema** / **`--schema` not required** when the blessed `claude-headless` preset is implied — only after **`schemas/`** is stable and documented.
