# Agent eval harness — CI policy

How continuous integration uses this harness: what runs when, and what “green” means versus model quality.

A consolidated summary for readers browsing `docs/` lives in [docs/ci-eval-policy.md](./docs/ci-eval-policy.md).

## Language

**PR harness smoke**:
Pull-request CI whose main job is to prove the eval pipeline works (adapters, graders, schemas, wiring)—not to block merges on agent capability regressions. Runs against a **stub or fixture** (no live model API on the critical path). **CI logs are sufficient** for PR—no required artifact bundle (unlike nightly).
_Avoid_: “Full eval”, “quality CI” (for PR), using live LLM calls as the default PR signal

**Nightly regression gate**:
Scheduled CI that applies quality thresholds over a defined prompt set and can fail when those thresholds are missed. The primary failure rule is **suite aggregate**: e.g. mean **pass@k** across prompts below threshold `T` fails the workflow (not a per-prompt floor as the main gate). **Infra failure** (adapter crash, timeout, missing parseable output, grader threw) fails the workflow on **any** occurrence—do not average those into “quality.” **Flakiness** (e.g. gap between pass@k and per-trial consistency) is **report-only in v1**, not a hard fail alongside `T`.
_Avoid_: Calling this “smoke”; treating a single bad prompt as the default reason for failure unless policy is extended later; silently counting broken runs as `pass@k = 0` without failing the job

**pass@k**:
Reliability metric derived from multiple graded trials per prompt (capability of solving with at least one success in k attempts). Meaningful primarily in the **Nightly regression gate**, not required to define **PR harness smoke** success.
_Avoid_: Using “pass@k” when you only mean “the job finished without errors”

**Pinned eval stack**:
The model, adapter contract, sampling, and other settings that change outputs, fixed in checked-in config for nightly so green/red is attributable; updates happen via review, not silent drift.
_Avoid_: Evaluating “latest” without pinning while still claiming regression detection

**Declared fixture subset**:
The prompts whose golden trajectories run on **PR harness smoke**; must be an explicit subset of (or registered alongside) the **Nightly regression gate** prompt list so PR and nightly stay aligned.
_Avoid_: PR-only prompts that never appear in nightly config

**Nightly artifact bundle**:
The standard upload for every nightly run (pass or fail): structured results, config/threshold echo, pinned stack resolution, and reporting fields (including flakiness for v1). Completion of the workflow implies this bundle exists (subject to platform retention rules).
_Avoid_: Treating “green” as sufficient without retained outputs for postmortem

## Relationships

- **PR harness smoke** and **Nightly regression gate** are separate workflows; the former is primary on every PR, the latter enforces model/task regressions on a schedule.
- A **Nightly regression gate** assumes a **Grader** has already assigned pass/fail per trial so **pass@k** can be computed.
- **Nightly prompt suite** changes are **coupled to `T` review** in the same pull request: composition and threshold move together or the exception is explicit for reviewers.

## Example dialogue

> **Dev:** “PR failed because pass@k dropped on two prompts.”  
> **Domain expert:** “That belongs in the **Nightly regression gate**. For **PR harness smoke**, green means the adapter and grader ran to completion and produced valid structured output—not that the agent passed every task.”

## Flagged ambiguities

- (none yet)

## Resolved during design

- PR smoke uses **stub or fixture**, not live API; live eval is deferred to **Nightly regression gate** (or other non-blocking workflows).
- PR smoke runs the **same grader** as nightly on **golden fixtures** so grader regressions fail CI, not only model regressions.
- Nightly uses a **suite-level gate** (e.g. mean `pass@k` across prompts vs threshold `T`); per-prompt floors are not the primary rule for v1.
- Nightly treats **any infra/grading execution error** as a failed run (option 2): red workflow regardless of mean; mean reflects completed healthy prompts only when no such errors occurred.
- **`T` and `k`** (and related gate parameters) live in **checked-in versioned config** in the repo; changing the bar is an explicit, reviewable change—not a dynamic baseline-only gate.
- Nightly pins the **full evaluated stack** in that config (or files it references): model, adapter/schema contract, sampling and other output-affecting settings—so results stay attributable; bumps are intentional PRs.
- **PR golden fixtures** are a **declared subset** of the nightly prompt set (or a single shared prompt registry): PR smoke never validates prompts that the nightly gate does not also cover.
- **Flakiness metrics** are **report-only for v1**; only mean **pass@k** vs **T** (plus hard fail on any infra error) gates the workflow until baselines justify an extra ceiling.
- Every **Nightly regression gate** run must upload a **required artifact bundle** (results JSONL, resolved pinned stack / config echo, thresholds used, flakiness summary)—pass or fail—so regressions and infra breaks are auditable without re-running blind.
- **PR harness smoke** does not require uploaded artifacts; **CI log output** is enough for debugging and local re-runs.
- A PR that **changes nightly prompt suite composition** must **update `T` in the same PR** (with rationale) **or** explicitly document why `T` is unchanged and that the gate may shift until a follow-up—no silent suite edits without threshold review.
