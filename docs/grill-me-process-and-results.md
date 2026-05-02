# `/grill-me`: process and session results

This document describes the **grill-me** working style (as invoked with `/grill-me`) and records **one completed session** on this repository’s product direction.

---

## What `/grill-me` is

**Grill-me** is an agent skill whose intent is to **stress-test a plan or design through structured Q&A** until decisions are explicit and ordered.

From the skill definition:

- Interview **relentlessly** about the plan until there is **shared understanding**.
- Walk **each branch** of the design tree; resolve **dependencies between decisions** in order.
- For **each** question, the agent provides a **recommended answer** (a concrete proposal, not only open options).
- Ask **one question at a time** (no question dumps).
- If a question can be settled by **reading the codebase**, the agent **explores the repo** instead of asking.

Typical invocation: `/grill-me about <topic>` (e.g. this project, a feature RFC, or a migration).

---

## How the process runs (mechanics)

1. **Frame the scope** — What is being “grilled” (whole project, one subsystem, a launch plan)?
2. **Ground in facts** — Where answers live in code or docs, the agent reads them first so questions are about **choices**, not discoverable facts.
3. **One decision per turn** — Each reply from you resolves one fork; the agent records it and asks the **next** fork that depends on prior answers.
4. **Recommendations** — Each question includes options plus **what the agent would pick** and why (tradeoffs in plain language).
5. **Stop condition** — When the open branches for *that scope* are closed, the agent **synthesizes** a decision summary and, if useful, an **implementation checklist** (see deliverables below).

---

## Session summarized here

| Field | Value |
|--------|--------|
| **Topic** | **This project** — `@plaited/agent-eval-harness`: CLI for headless agent trajectory capture, JSONL output, schema-driven adapters, grading/trials, skills distribution. |
| **Goal** | Lock **product and onboarding direction** (opinionated vs library-first, golden path, packaging, docs, CI, skills) so implementation can proceed without re-litigating basics. |

### Codebase facts used (not asked as questions)

These informed later questions instead of being left ambiguous:

- **`capture` requires `--schema` today** — no baked-in default yet (`src/commands/capture.ts`).
- **`claude-headless.json` lived under test fixtures** — `src/headless/tests/fixtures/`, excluded from npm by **`package.json` `files`**, while README examples referred to **`./schemas/claude-headless.json`** (a real packaging/docs gap).
- **`summarize` supports Markdown** via `--markdown` (`src/commands/summarize.ts` help text).

---

## Decision log (this session)

Each row is one question; **your choice** is what we locked in. **Recommendation** is what the agent proposed before you answered.

| # | Question (compressed) | Recommendation | **Your answer** |
|---|------------------------|------------------|-----------------|
| 1 | Primary win for the repo next: general library (**A**), opinionated runner (**B**), or Plaited-internal spine (**C**)? | **B**, leaning **A** | **B** |
| 2 | Canonical onboarding arc: `capture` only (**A**), `capture` → `summarize` (**B**), or `trials` + grader first (**C**)? | **B** | **B** |
| 3 | Default “done” artifact after summarize: JSONL (**A**), Markdown (**B**), or stdout (**C**)? | **B** | **B** |
| 4 | First-run inputs: repo starter (**A**), docs-only (**B**), or `init` scaffold command (**C**)? | **A** | **A** |
| 5 | Where does `--schema` come from for npm users: ship **`schemas/`** now (**A**), clone-only tutorial (**B**), or CLI default schema (**C**)? | **A** now, **C** later | **A now, C later** |
| 6 | Tutorial **cwd**: from `examples/golden-path/` (**A**), repo root (**B**), or dual full blocks (**C**)? | **B** + short note for subfolder | **B** |
| 7 | CI for golden path: none (**A**), static checks only (**B**), or full smoke with API (**C**)? | **B** | **B** |
| 8 | Where does the **full** copy-paste tutorial live: root README (**A**), **`examples/golden-path/README.md`** (**B**), or skill-only (**C**)? | **B** | **B** |
| 9 | How the **agent-eval-harness skill** aligns with that README: link only (**A**), duplicate commands (**B**), or hybrid (**C**)? | **C** | **C** |
| 10 | Should **`schemas/`** and **`examples/golden-path/`** ship in the **npm tarball**? **A** yes (extend `files`), **B** no (clone-only), **C** schema only in package. | **A** | **A** |

---

## Consolidated outcome (spec in one place)

- **Positioning:** Opinionated **“batteries included”** runner — fewer knobs, faster time-to-first-useful-output.
- **Golden path:** **`capture`** → **`summarize --markdown`** → Markdown report as the first win.
- **Starter:** **`examples/golden-path/`** with **`examples/golden-path/README.md`** as the **canonical** human tutorial; commands and paths assume **repository root** as `cwd`.
- **Schema:** **`schemas/claude-headless.json`** as the **published** canonical asset **now**; **optional CLI default** for schema **later** (after `schemas/` is stable).
- **CI:** **Static validation only** for golden-path assets (no live `capture` in default PR CI).
- **Skill:** **Hybrid** — short summary, **link** to the golden-path README, **agent-only** extras (env, workspace, parallelism) not duplicated as the only source of truth.
- **Package:** **`package.json` `files`** must include **`schemas/**`** and **`examples/golden-path/**`** so **`bunx` / npm** installs match the story; document running from **`node_modules/...`** or copying assets into the user’s tree.

---

## Deliverables tied to this session

| Deliverable | Location |
|-------------|----------|
| Implementation task checklist (checkboxes) | [`golden-path-implementation-checklist.md`](./golden-path-implementation-checklist.md) |
| This write-up (process + decision log) | [`grill-me-process-and-results.md`](./grill-me-process-and-results.md) *(this file)* |

Implementation was **not** performed in the grill-me thread; the checklist is the handoff for execution.

---

## Reusing `/grill-me` on another topic

1. State the **artifact** being grilled (PRD, migration, API, “this folder”).
2. Invoke **`/grill-me about …`** so the skill’s rules apply (one question at a time, recommendations, codebase first).
3. When done, ask for a **short decision memo** or **`docs/…` checklist** if you want the same paper trail as here.

If decisions become invalid later (e.g. you pivot to library-first), run a **new** grill-me pass; this document is a **snapshot**, not a permanent constitution unless you adopt it as such in project governance.
