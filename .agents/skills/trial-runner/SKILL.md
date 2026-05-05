---
name: trial-runner
description: "End-to-end eval-suite orchestration with the `eval` command: run -> grade -> compare -> calibrate, using strict JSON contracts and schema discovery."
license: ISC
---

# Trial Runner

Use this skill to build or operate an eval suite around:

```bash
agent-eval-harness eval '<json>'
```

## Required workflow

1. Use `grill-me` first to clarify:
   - evaluation goal and reliability target
   - target agent CLI(s)
   - task corpus source and metadata
   - grading evidence and pass policy
   - comparison strategy and calibration cadence
2. Use `tdd` to build in vertical slices:
   - one task JSONL row
   - one adapter contract test
   - one `run` smoke test
   - one grader
   - one `grade` smoke test
   - one `compare` check
   - one `calibrate` check
3. Use schema discovery for contracts (do this instead of copying field lists):
   - `eval --schema task`
   - `eval --schema adapter-input`
   - `eval --schema adapter-output`
   - `eval --schema grader-input`
   - `eval --schema grader-output`
   - `eval --schema trial-row`

## Canonical pipeline

```bash
agent-eval-harness eval '{"mode":"run",...}' > raw.jsonl
agent-eval-harness eval '{"mode":"grade",...}' < raw.jsonl > graded.jsonl
agent-eval-harness eval '{"mode":"compare",...}'
agent-eval-harness eval '{"mode":"calibrate",...}'
```

`run` and `grade` stream compact `trial_result` JSONL rows to stdout.  
`compare` and `calibrate` emit one bounded JSON object.

## Suite-owned concerns (outside harness contract)

- workspace setup and cleanup
- resume/dedupe policy
- retry policy
- filtering and slicing strategy
- CI gating policy
- cost/token analysis scripts
- secrets via environment/wrappers (not JSON config)
