# AGENTS.md

Agent guidance for this repository.

## Overview

General-purpose eval harness for CLI agents. It runs prompts through adapter scripts, captures trajectories, grades outputs, and writes JSONL trial results.

## Capabilities

| Capability | Notes |
|------------|-------|
| Multi-turn | `task.prompts: string[]` runs sequentially in adapter-owned session logic |
| Streaming modes | `run` and `grade` stream compact `trial_result` JSONL to stdout |
| Bounded modes | `compare` and `calibrate` emit one JSON object |
| Command-only hooks | Adapters and command graders are argv-array commands with JSON stdin/stdout |

## Structure

| Path | Purpose |
|------|---------|
| `src/cli.ts` | CLI entry (`eval`) |
| `src/eval.ts` | Eval mode execution and CLI handling |
| `src/eval.schemas.ts` | Zod schemas and exported types |
| `src/eval.utils.ts` | Shared eval utilities |
| `src/eval.constants.ts` | Eval constants |
| `src/tests/` | Unit tests |
| `.agents/skills/trial-runner/` | Running trials and reading results |
| `.agents/skills/trial-adapters/` | Adapter authoring |
| `.agents/skills/compare-trials/` | Statistical comparison scripts |

## Commands

| Command | Purpose |
|---------|---------|
| `bun install` | Setup; requires Bun >= v1.2.9 |
| `bun run check` | Type, lint, format, package checks |
| `bun run check:write` | Auto-fix lint/format/package ordering |
| `bun test src/` | Unit tests |

## CLI

```bash
bunx @plaited/agent-eval-harness eval '{"mode":"run","tasksPath":"./tasks.jsonl","adapter":{"command":["bun","./adapter.ts"]}}'
```

| Mode | Status | Purpose |
|------|--------|---------|
| `run` | Implemented | Execute adapter command over tasks JSONL and stream raw rows |
| `grade` | Implemented | Apply ordered graders and stream graded rows |
| `compare` | Implemented | Compare two graded trial-result sets |
| `calibrate` | Implemented | Sample graded rows for reviewer calibration |

## Package Exports

| Import | Exports |
|--------|---------|
| `@plaited/agent-eval-harness` | `evalCli`, `runEval`, `runEvalTrials`, `gradeEvalRows`, `compareEvalRuns`, `calibrateEvalRun` |
| `@plaited/agent-eval-harness/schemas` | Zod schemas and types |

## Verification

Before commit:

```bash
bun run check
bun test src/
```

Never use `--no-verify`; fix hook failures.

<!-- PLAITED-RULES-START -->

## Rules

### Workflow

**Skills first** - Before implementation, scan available skills and read each relevant `SKILL.md`.
*Verify:* Relevant skills were evaluated and activated before edits.
*Fix:* Pause, read the skill, then continue.

**Verify first** - Read live files before describing behavior or recommending fixes.
*Verify:* Claims cite current files, commands, or tests.
*Fix:* Inspect source with `rg`, `sed`, or project tools before answering.

**GitHub data** - Use `gh` for GitHub PRs/issues; include comments, reviews, inline comments, and code scanning alerts for PR evaluation.
*Verify:* `gh pr view <n> --repo <owner>/<repo> --json title,body,comments,reviews,state`; `gh api repos/<owner>/<repo>/pulls/<n>/comments`; `gh api repos/<owner>/<repo>/code-scanning/alerts`
*Fix:* Fetch missing sources before reviewing.

**Commits** - Conventional messages: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, `test:`.
*Verify:* `git log --oneline -5`
*Fix:* Amend before push if format is wrong.

### Bun And Modules

**Bun APIs** - Prefer `Bun.file`, `Bun.write`, `Bun.$`, `Bun.which`, `Bun.resolveSync`, and `import.meta.dir` in Bun code.
*Verify:* `rg "node:fs|child_process|existsSync|readFileSync|writeFileSync|process.cwd" src`
*Fix:* Replace with Bun APIs unless Node APIs are justified.

**Allowed Node APIs** - `node:path`, recursive `mkdir`, and `appendFile` are OK.
*Verify:* Review any remaining Node imports.
*Fix:* Keep only the allowed cases or add a clear reason.

**No index files** - Use named boundary files, not `index.ts`.
*Verify:* `find . -name index.ts`
*Fix:* Move `feature/index.ts` to parent `feature.ts` or another explicit name.

**Explicit imports** - Relative TS imports include `.ts`; import directly inside a module, not through that module's re-export boundary.
*Verify:* `rg "from ['\"]\\./" src` and inspect imports without `.ts`
*Fix:* Add `.ts` and point at the defining file.

**Module layout** - Use `feature.types.ts`, `feature.schemas.ts`, `feature.constants.ts`, and `feature.ts`; parent boundary files re-export child modules.
*Verify:* `rg --files src`
*Fix:* Rename or split files to match established layout.

### TypeScript

**Type over interface** - Prefer `type User = {}` over `interface User {}`.
*Verify:* `rg "interface [A-Z]" src`
*Fix:* Convert to type aliases unless declaration merging is required.

**No `any`** - Use `unknown` plus narrowing.
*Verify:* `rg "[:<] any\\b|as any\\b" src`
*Fix:* Add schema checks or type guards.

**Naming** - PascalCase types; Zod schemas end with `Schema`.
*Verify:* Inspect exported types and `z.` declarations in `src/`.
*Fix:* Rename type/schema symbols and references.

**Arrow functions** - Prefer `const fn = () =>` over `function fn()`.
*Verify:* `rg "function \\w" src`
*Fix:* Convert to arrow functions unless syntax requires `function`.

**Object params** - More than two arguments becomes one object parameter.
*Verify:* Review changed function signatures; CLI entry points may take `args: string[]`.
*Fix:* Replace positional groups with typed object params.

**Private fields** - Use ECMAScript `#field`, not TypeScript `private field`.
*Verify:* `rg "private \\w" src`
*Fix:* Convert to `#field`.

**JSON imports** - Use import attributes.
*Verify:* `rg "from ['\"].*\\.json['\"]" src`
*Fix:* Add `with { type: 'json' }`.

**Suppression comments** - `@ts-ignore` needs a reason.
*Verify:* `rg "@ts-ignore" src`
*Fix:* Add the reason or remove the suppression.

### Documentation For `src/`

**Public TSDoc** - Exported APIs need concise TSDoc matching current code: summary, context, `@param`, `@returns`, `@remarks`, related `@see`, and `@public` when exported from package boundaries.
*Verify:* Inspect matches from `rg "^export (const|type|class)|^export \\{" src`.
*Fix:* Add or sync TSDoc from signatures, tests, schemas, and real usages.

**Type docs** - Exported object/generic types document every property and template parameter.
*Verify:* Review exported `type` declarations in `src/eval.schemas.ts` and boundary exports.
*Fix:* Add `@property`, `@template`, constraints, validation notes, and related schema links.

**Internal docs** - Non-public helpers with non-obvious behavior use `@internal` TSDoc.
*Verify:* Review complex helpers, loaders, worker-pool code, and error handling.
*Fix:* Document purpose, invariants, constraints, and complexity only where useful.

**No examples in TSDoc** - Tests are living examples.
*Verify:* `rg "@example" src`
*Fix:* Remove examples or move coverage into tests.

**Doc sync** - TSDoc parameter names, return descriptions, generics, and `@see` links must match current code.
*Verify:* Compare comments with signatures, Zod schemas, and `rg` references.
*Fix:* Update stale tags; remove orphaned docs for deleted code.

**Comment hygiene** - Keep TSDoc, TODO, and FIXME; avoid timestamps, historical notes, obvious inline explanations, and rationale comments.
*Verify:* `rg "// (Performance|Updated|This used to|Hack|Loop through|We do this)" src`
*Fix:* Delete noise or move durable constraints into `@remarks`.

### Testing

**Use `test`** - Prefer `test(...)` over `it(...)`.
*Verify:* `rg "\\bit\\(" src/**/*.spec.ts`
*Fix:* Rename to `test(...)`.

**No conditional assertions** - Assert existence first, then assert properties.
*Verify:* `rg "if .*expect|&& .*expect" src/**/*.spec.ts`
*Fix:* Split into explicit assertions.

**Branch coverage** - Try/catch, conditionals, fallbacks, and error paths need tests.
*Verify:* Review changed branches against nearby tests.
*Fix:* Add focused tests for missing paths.

**Real dependencies** - Prefer installed packages over fake module-resolution fixtures.
*Verify:* Review test imports and temp fixtures.
*Fix:* Use real packages such as `typescript` when feasible.

**Describe groups** - Group related tests with `describe`.
*Verify:* Review spec structure.
*Fix:* Add `describe('feature', () => { ... })`.

### Markdown

**Mermaid only** - No ASCII box drawing in markdown.
*Verify:* `rg "[\\x{250c}\\x{2502}\\x{2514}\\x{2500}]" -g "*.md"`
*Fix:* Replace diagrams with Mermaid or tables.

## Learnings

- 2026-05-04: Keep `AGENTS.md` compact; move durable skill guidance into self-verifying rules instead of duplicating full skill workflows.

<!-- PLAITED-RULES-END -->
