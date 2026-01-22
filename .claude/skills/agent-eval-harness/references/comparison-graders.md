# Comparison Graders

## Overview

The `compare` command supports three grading strategies:

1. **Weighted** (default) - Configurable weights for quality, latency, reliability
2. **Statistical** - Bootstrap sampling for confidence intervals
3. **Custom** - Your own LLM-as-Judge or logic-based grader

## Built-in Strategy: Weighted

Scores runs by combining quality, latency, and reliability metrics with configurable weights.

### How It Works

```
weighted_score = (quality × w_q) + (latency × w_l) + (reliability × w_r)
```

Where:
- **quality**: Grader score (0-1) from previous grading step
- **latency**: Inverse duration (faster = higher, normalized)
- **reliability**: 1 if no tool errors, 0 otherwise

### Configuration

Default weights: `quality=0.5, latency=0.3, reliability=0.2`

Override via environment variables:

```bash
COMPARE_QUALITY=0.7 COMPARE_LATENCY=0.2 COMPARE_RELIABILITY=0.1 \
  agent-eval-harness compare a.jsonl b.jsonl -o comparison.json
```

### When to Use

- Quick comparisons without custom logic
- Balancing speed vs correctness tradeoffs
- Initial exploration before writing custom graders

## Built-in Strategy: Statistical

Uses bootstrap sampling to compute confidence intervals and flag statistically significant differences.

### How It Works

1. Resample scores with replacement (1000 iterations)
2. Compute mean of each resample
3. Calculate 95% confidence interval from percentiles
4. If winner's lower CI > second's upper CI → statistically significant

### Configuration

```bash
COMPARE_BOOTSTRAP_ITERATIONS=5000 \
  agent-eval-harness compare a.jsonl b.jsonl --strategy statistical -o comparison.json
```

### When to Use

- Rigorous A/B testing
- Publishing results (need significance claims)
- Small sample sizes where noise matters

### Output

The reasoning field indicates significance:

```json
{
  "reasoning": "Winner \"run-a\" is statistically significant (p<0.05, non-overlapping 95% CIs)"
}
```

Or:

```json
{
  "reasoning": "No statistically significant difference between top runs (overlapping 95% CIs)"
}
```

## Custom Graders: LLM-as-Judge

For semantic evaluation, use an LLM to compare runs holistically.

### Template Setup

Export a template and customize:

```bash
# Google GenAI template
agent-eval-harness schemas --template llm-judge-gemini -o my-grader.ts

# Anthropic Claude template
agent-eval-harness schemas --template llm-judge-anthropic -o my-grader.ts
```

### Install Dependencies

```bash
# For Gemini
bun add @google/genai
export GEMINI_API_KEY=your-api-key

# For Anthropic
bun add @anthropic-ai/sdk
export ANTHROPIC_API_KEY=your-api-key
```

### Usage

```bash
agent-eval-harness compare a.jsonl b.jsonl \
  --strategy custom \
  --grader ./my-grader.ts \
  -o comparison.json
```

### Customizing the Prompt

Edit the `buildPrompt` function in the template:

```typescript
const buildPrompt = ({ id, input, hint, runs }: ComparisonGraderInput): string => {
  // Customize evaluation criteria here
  return `You are evaluating agent runs...

## Evaluation Criteria
1. **Correctness** - Does it solve the task?
2. **Efficiency** - Minimal tool calls?
3. **Your Custom Criterion** - Add your own...

...`
}
```

### LLM Provider Comparison

| Provider | Model | Context | Best For |
|----------|-------|---------|----------|
| Google GenAI | gemini-2.5-flash | 1M tokens | Large trajectories, cost-effective |
| Google GenAI | gemini-2.5-pro | 1M tokens | Complex reasoning |
| Anthropic | claude-sonnet-4 | 200K tokens | Balanced speed/quality |
| Anthropic | claude-opus-4 | 200K tokens | Maximum capability |

## Grader Interface

All comparison graders implement:

```typescript
type ComparisonGrader = (params: ComparisonGraderInput) => Promise<ComparisonGraderResult>

type ComparisonGraderInput = {
  id: string                    // Prompt identifier
  input: string | string[]      // Original prompt
  hint?: string                 // Grader context
  runs: Record<string, {
    output: string              // Agent output
    trajectory?: TrajectoryStep[]
    score?: GraderResult        // If previously graded
    duration?: number           // Total ms
    toolErrors?: boolean
  }>
}

type ComparisonGraderResult = {
  rankings: Array<{
    run: string                 // Run label
    rank: number               // 1 = best
    score: number              // 0-1
  }>
  reasoning?: string           // Explanation
}
```

## Strategy Selection Guide

| Use Case | Recommended Strategy |
|----------|---------------------|
| Quick comparison | `weighted` (default) |
| A/B test with significance | `statistical` |
| Semantic quality evaluation | `custom` (LLM-as-Judge) |
| Complex multi-criteria scoring | `custom` (logic-based) |
| Tool usage analysis | `custom` (see below) |

## Tool Usage Analysis

Tool usage is NOT included in standard comparison output because:

1. Different adapters provide different `trajectoryRichness` levels
2. The `tool_call.name` field often contains tool use IDs, not human-readable names
3. Adapters with `messages-only` richness don't capture tool calls

### Custom Tool Analysis Grader

For tool analysis, create a custom grader:

```typescript
import type { ComparisonGrader } from '@plaited/agent-eval-harness/pipeline'

export const grade: ComparisonGrader = async ({ runs }) => {
  const runAnalysis = Object.entries(runs).map(([label, run]) => {
    const toolCalls = (run.trajectory ?? []).filter(s => s.type === 'tool_call')
    return { label, toolCount: toolCalls.length }
  })

  // Rank by efficiency (fewer calls = better)
  const sorted = runAnalysis.sort((a, b) => a.toolCount - b.toolCount)

  return {
    rankings: sorted.map((r, i) => ({
      run: r.label,
      rank: i + 1,
      score: 1 / (1 + r.toolCount / 10)
    })),
    reasoning: `Tool counts: ${sorted.map(r => `${r.label}=${r.toolCount}`).join(', ')}`
  }
}
```

### Adapter Format Reference

| Adapter | `trajectoryRichness` | Tool Name Format |
|---------|---------------------|------------------|
| claude-headless | `full` | Tool use ID (e.g., `toolu_017...`) |
| gemini-headless | `full` | Function name |
| droid | `messages-only` | N/A |
| Custom | Varies | Check your schema |

## Output Format

The compare command outputs a `ComparisonReport` JSON:

```json
{
  "meta": {
    "generatedAt": "2025-01-22T10:30:00Z",
    "runs": ["baseline", "variant"],
    "promptCount": 100,
    "promptsWithAllRuns": 98
  },
  "quality": {
    "baseline": { "avgScore": 0.85, "passRate": 0.82, ... },
    "variant": { "avgScore": 0.88, "passRate": 0.85, ... }
  },
  "performance": {
    "baseline": { "latency": { "p50": 1200, "p90": 3400, ... } },
    "variant": { "latency": { "p50": 1100, "p90": 3100, ... } }
  },
  "reliability": { ... },
  "trajectoryInfo": { ... },
  "headToHead": {
    "prompts": [ ... ],
    "pairwise": [
      { "runA": "baseline", "runB": "variant", "aWins": 35, "bWins": 55, "ties": 8 }
    ]
  }
}
```

## Related Documentation

- [graders.md](graders.md) - Standard grader interface (non-comparison)
- [eval-concepts.md](eval-concepts.md) - pass@k, pass^k metrics
- [calibration.md](calibration.md) - Grader calibration workflow
