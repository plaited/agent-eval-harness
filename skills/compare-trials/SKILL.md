---
name: compare-trials
description: Analyze graded `trial_result` JSONL outputs from the eval pipeline, including reliability and custom slicing.
license: ISC
---

# Compare Trials

Use this skill for analysis over graded JSONL outputs, typically after:

```bash
agent-eval-harness eval '{"mode":"grade",...}' > graded.jsonl
```

## Default path

For normal baseline-vs-challenger comparisons, use:

```bash
agent-eval-harness eval '{"mode":"compare",...}'
```

Use custom scripts only when suite-specific analysis is required.

## Custom analysis use cases

- cost analysis
- token usage analysis
- slices by task metadata (category, difficulty, source)
- custom regression gates
- per-agent metadata summaries

## Script guidance

When writing a custom script:

1. Parse JSONL rows as `trial_result`.
2. Validate graded rows (`pass` and `score` non-null).
3. Group by stable identity fields (`taskId`, `trialIndex`, `runId`).
4. Separate:
   - standalone run metrics
   - comparable-overlap metrics
5. Report uncertainty where possible (bootstrap confidence intervals).
6. Use `exactPassAtK` naming for combinatorics-based pass@k metrics (do not label exact values as `estimatedPassAtK`).

Reference helpers remain in `references/` for bootstrap/statistics utilities.
