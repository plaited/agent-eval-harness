/**
 * LLM-as-Judge Comparison Grader Template (Google GenAI)
 *
 * @remarks
 * Copy this file and customize the prompt/model for your use case.
 *
 * Setup:
 *   bun add @google/genai
 *   export GEMINI_API_KEY=your-api-key
 *
 * Usage:
 *   agent-eval-harness compare *.jsonl --strategy custom --grader ./my-llm-judge.ts -o comparison.json
 *
 * @packageDocumentation
 */
import { GoogleGenAI } from '@google/genai'
import type {
  ComparisonGrader,
  ComparisonGraderInput,
  ComparisonGraderResult,
} from '@plaited/agent-eval-harness/pipeline'

// Initialize client (reads GEMINI_API_KEY from env)
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })

// Customize: Choose model based on context needs
// - gemini-2.5-flash: Fast, 1M context, good for most evals
// - gemini-2.5-pro: More capable, 1M context, for complex reasoning
const MODEL = 'gemini-2.5-flash'

/**
 * Build the evaluation prompt for the LLM judge.
 *
 * @remarks
 * Customize this function to match your evaluation criteria.
 *
 * @param input - Comparison grader input
 * @returns Formatted prompt string
 */
const buildPrompt = ({ id, input, hint, runs }: ComparisonGraderInput): string => {
  const runDescriptions = Object.entries(runs)
    .map(
      ([label, run]) => `
## Run: ${label}
**Output:** ${run.output}
**Tool Errors:** ${run.toolErrors ?? false}
**Duration:** ${run.duration ?? 'unknown'}ms
**Trajectory Steps:** ${run.trajectory?.length ?? 0}
`,
    )
    .join('\n')

  return `You are evaluating agent runs for the same task. Compare them holistically.

## Task
**ID:** ${id}
**Input:** ${Array.isArray(input) ? input.join(' → ') : input}
${hint ? `**Expected:** ${hint}` : ''}

## Runs to Compare
${runDescriptions}

## Evaluation Criteria
1. **Correctness** - Does it solve the task? Does output match expectations?
2. **Efficiency** - Minimal tool calls? No unnecessary steps?
3. **Robustness** - Handles edge cases? No errors?

## Instructions
Rank all runs from best (rank 1) to worst. Provide:
- A score from 0.0 to 1.0 for each run
- Brief reasoning for the ranking

Respond as JSON only:
{
  "rankings": [
    {"run": "label", "rank": 1, "score": 0.95},
    {"run": "label", "rank": 2, "score": 0.72}
  ],
  "reasoning": "Run A was more efficient..."
}`
}

/**
 * LLM-as-Judge comparison grader using Google GenAI.
 *
 * @remarks
 * This grader sends the comparison input to a Gemini model for evaluation.
 * The LLM analyzes all runs holistically and returns rankings.
 *
 * @param input - Comparison grader input
 * @returns Rankings and reasoning from the LLM
 */
export const grade: ComparisonGrader = async (input: ComparisonGraderInput): Promise<ComparisonGraderResult> => {
  const prompt = buildPrompt(input)

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
  })

  const text = response.text ?? ''

  // Parse JSON from response (handle markdown code blocks)
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/\{[\s\S]*\}/)
  const jsonStr = jsonMatch?.[1] ?? jsonMatch?.[0] ?? '{}'

  try {
    const json = JSON.parse(jsonStr)
    return {
      rankings: json.rankings ?? [],
      reasoning: json.reasoning ?? 'LLM comparison complete',
    }
  } catch {
    // Fallback: return all runs with equal scores if parsing fails
    const labels = Object.keys(input.runs)
    return {
      rankings: labels.map((run, i) => ({ run, rank: i + 1, score: 0.5 })),
      reasoning: `LLM response parsing failed: ${text.slice(0, 100)}...`,
    }
  }
}
