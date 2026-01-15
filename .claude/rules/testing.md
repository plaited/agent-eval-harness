# Testing

This project uses Bun's built-in test runner for unit and integration tests.

## Test Types

### Unit/Integration Tests (`*.spec.ts`)

- Standard Bun tests using `*.spec.ts` extension
- Run with `bun test` command
- Used for testing business logic, utilities, and non-visual functionality

### Docker Integration Tests (`*.docker.ts`)

- Tests that require external services or API keys run in Docker containers
- Use `*.docker.ts` extension
- Run with `bun run test:docker`

## Running Tests

```bash
# Run all unit tests
bun test

# Run a specific spec test file
bun test path/to/file.spec.ts

# Run tests matching a pattern
bun test pattern

# Run Docker integration tests (requires ANTHROPIC_API_KEY)
ANTHROPIC_API_KEY=sk-... bun run test:docker
```

## Test Style Conventions

### Use `test` Instead of `it`

Use `test` instead of `it` in test files for consistency:

```typescript
// ✅ Good
test('should create ACP client correctly', () => {
  // ...
})

// ❌ Avoid
it('should create ACP client correctly', () => {
  // ...
})
```

## Skill Script Tests

Claude Code skills in `.claude/skills/` may include executable scripts. Tests for these scripts follow a specific structure:

### Directory Structure

```
.claude/skills/<skill-name>/
├── SKILL.md
├── scripts/
│   ├── script-name.ts        # Executable script
│   └── tests/
│       └── script-name.spec.ts  # Tests for the script
```

### Running Skill Script Tests

```bash
# From skill directory
bun test scripts/tests/
```

### Test Pattern

Scripts that output JSON can be tested using Bun's shell API:

```typescript
import { describe, test, expect } from 'bun:test'
import { join } from 'node:path'
import { $ } from 'bun'

const scriptsDir = join(import.meta.dir, '..')

describe('script-name', () => {
  test('outputs expected JSON', async () => {
    const result = await $`bun ${scriptsDir}/script-name.ts arg1 arg2`.json()
    expect(result.filePath).toEndWith('expected.ts')
  })

  test('exits with error on invalid input', async () => {
    const proc = Bun.spawn(['bun', `${scriptsDir}/script-name.ts`], {
      stderr: 'pipe',
    })
    const exitCode = await proc.exited
    expect(exitCode).toBe(1)
  })
})
```

## Docker Integration Tests

Tests that require the Anthropic API run in Docker containers for consistent, isolated execution.

### ACP Integration Tests

The ACP client integration tests require the Anthropic API and run in a Docker container:

```bash
# Run locally with Docker (requires ANTHROPIC_API_KEY)
ANTHROPIC_API_KEY=sk-... docker compose -f docker-compose.test.yml run --rm acp-test

# Or using the npm script (still requires Docker)
ANTHROPIC_API_KEY=sk-... bun run test:docker
```

### File Naming

- **`*.docker.ts`**: Tests that run in Docker containers
- These are excluded from `bun test` and run separately in CI

### CI Workflow

Docker tests use path filtering to reduce API costs:

```yaml
# .github/workflows/ci.yml
jobs:
  changes:
    # Detects which paths changed
    steps:
      - uses: dorny/paths-filter@v3
        with:
          filters: |
            acp:
              - 'src/**'

  test-acp-integration:
    needs: changes
    if: ${{ needs.changes.outputs.acp == 'true' }}
    # Only runs when src/ files change
```

## Anti-Patterns

### No Conditionals Around Assertions

Never wrap assertions in conditionals. Tests should fail explicitly, not silently skip assertions.

```typescript
// ❌ WRONG: Conditional assertion
if (result) {
  expect(result.value).toBe(expected)
}

// ❌ WRONG: Optional chaining with assertion
result?.value && expect(result.value).toBe(expected)

// ✅ CORRECT: Assert the condition, then assert the value
expect(result).toBeDefined()
expect(result.value).toBe(expected)

// ✅ CORRECT: Use type narrowing assertion
expect(result).not.toBeNull()
expect(result!.value).toBe(expected)
```

If a value might not exist, the test should either:
1. Assert that it exists first, then check its value
2. Assert that it doesn't exist (if that's the expected behavior)
3. Restructure the test to ensure the value is always present
