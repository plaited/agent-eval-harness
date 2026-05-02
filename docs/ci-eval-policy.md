# CI policy: pass@k, grading, and this harness

This document records how we expect **continuous integration** to use the agent eval harness: **PR harness smoke** versus **nightly regression gate**, what fails the build, what gets uploaded, and how **thresholds** and **prompt suites** stay in sync.

The canonical glossary (shared language for reviews and runbooks) lives in [`CONTEXT.md`](../CONTEXT.md) at the repo root. This file summarizes the same decisions in a single place for `docs/`.

## Summary

| Topic | Policy |
|--------|--------|
| PR vs nightly | **PR** = harness smoke (primary on every PR). **Nightly** = regression gate (scheduled). |
| PR agent | **Stub or fixture** on the critical PR path—no live model API required for default PR green. |
| PR grader | **Same grader** as nightly on **golden fixtures**. |
| PR prompts | Fixtures are a **declared subset** of the nightly prompt set (or one shared prompt registry). |
| PR artifacts | **CI logs are enough**; no required artifact upload on PR. |
| Nightly quality gate | **Mean pass@k** across prompts vs checked-in **`T`** (v1: no per-prompt floor as the primary rule). |
| Nightly `k` and thresholds | **`k`**, **`T`**, and related parameters live in **versioned config** in the repo. |
| Nightly stack | **Pinned eval stack**: model, adapter/schema contract, sampling (and anything else that changes outputs)—bumped via intentional PRs. |
| Infra / execution errors | **Any** adapter crash, timeout, unparseable output, or grader throw → **workflow fails** (do not treat as `pass@k = 0` in the mean without failing). |
| Flakiness (e.g. pass@k vs per-trial consistency) | **Report-only for v1**; not a hard gate alongside `T` until baselines justify it. |
| Nightly artifacts | **Required bundle** on every nightly run (pass or fail): results JSONL, resolved pinned stack / config echo, thresholds used, flakiness summary. |
| Suite + threshold changes | A PR that **changes nightly prompt composition** must **update `T` in the same PR** (with rationale) **or** explicitly document why `T` is unchanged and that the gate may shift. |

## PR harness smoke

- **Goal:** Prove the pipeline works: adapters, schemas, wiring, and **the same grader** used in production evals.
- **Success:** Runs complete without infra errors; outputs are structurally valid; grader returns a verdict on golden fixture trajectories. **Not** defined by model capability or pass@k on PR.
- **Inputs:** Stub or fixture adapter; prompts drawn only from the **declared fixture subset** aligned with nightly.

## Nightly regression gate

- **Goal:** Detect regressions in model + task quality under a **pinned eval stack**.
- **Primary fail:** Mean **pass@k** across the nightly prompt suite **below `T`**, after all prompts completed without infra/grading execution errors.
- **Secondary signals:** Flakiness and other analytics are emitted for humans or dashboards; **v1 does not fail the workflow on flakiness alone**.

## Artifacts

| Workflow | Artifacts |
|----------|-----------|
| PR harness smoke | Optional; **logs sufficient**. |
| Nightly regression gate | **Required** standard bundle every run (subject to CI platform retention). |

## Config and review expectations

1. **`T`**, **`k`**, nightly prompt list, fixture subset declaration, and pinned stack fields** should live in checked-in files so changes are reviewable.
2. **Prompt suite edits** are coupled to **threshold review** in the same PR (see summary table).
3. When promoting **flakiness** (or per-prompt floors) to a hard gate, update this doc and `CONTEXT.md` in the same change set.

## Related

- [`CONTEXT.md`](../CONTEXT.md) — glossary (**PR harness smoke**, **Nightly regression gate**, **Pinned eval stack**, **Declared fixture subset**, **Nightly artifact bundle**, etc.).
- [`README.md`](../README.md) — CLI commands (`trials`, `capture`, `compare`, …).
- [`.agents/skills/trial-runner/`](../.agents/skills/trial-runner/SKILL.md) — running trials and interpreting pass@k-style fields.
