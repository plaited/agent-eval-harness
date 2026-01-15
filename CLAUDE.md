# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Essential Commands

### Development Setup
```bash
# Install dependencies (requires bun >= v1.2.9)
bun install

# Type, lint, and format check (check only, no fixes)
bun run check

# Lint and format fix (auto-fix issues)
bun run check:write

# Run unit tests
bun test

# Run Docker integration tests (requires ANTHROPIC_API_KEY)
ANTHROPIC_API_KEY=sk-... bun run test:docker
```

## Project Organization

This project uses `.claude/rules/` for project-specific guidance:

- **Testing**: @.claude/rules/testing.md - Test commands and workflow
- **Code Review**: @.claude/rules/code-review.md - Review standards
- **Accuracy**: @.claude/rules/accuracy.md - Confidence thresholds
- **Bun APIs**: @.claude/rules/bun-apis.md - Bun platform API preferences
- **Git Workflow**: @.claude/rules/git-workflow.md - Commit conventions
- **GitHub**: @.claude/rules/github.md - GitHub CLI integration

## Quick Reference

### Package Overview

`@plaited/acp` provides a headless ACP (Agent Client Protocol) client for programmatic agent interaction, optimized for testing, evaluation, and training data generation.

**Primary exports:**
- `createACPClient` - Factory for headless ACP client instances
- `createPrompt`, `createPromptWithFiles`, `createPromptWithImage` - Prompt builders
- `summarizeResponse` - Response analysis utility

**Re-exports from acp-utils (for advanced usage):**
- Content builders: `createTextContent`, `createImageContent`, `createAudioContent`, `createResourceLink`, `createTextResource`, `createBlobResource`
- Content extractors: `extractText`, `extractTextFromUpdates`, `extractToolCalls`, `extractLatestToolCalls`, `extractPlan`
- Tool call utilities: `filterToolCallsByStatus`, `filterToolCallsByTitle`, `hasToolCallErrors`, `getCompletedToolCallsWithContent`
- Plan utilities: `filterPlanByStatus`, `getPlanProgress`

### Code Style Essentials

- Prefer arrow functions and `type` over `interface`
- Use `test` instead of `it` in test files
- Prefer Bun native APIs over Node.js equivalents
- Object parameters for functions with 2+ parameters
- JSON imports require `with { type: 'json' }` attribute

For complete conventions, see `.claude/rules/code-review.md`

### Plugin Development

This project is a Claude Code plugin marketplace package. Structure:
- `.claude-plugin/marketplace.json` - Plugin manifest for marketplace distribution
- `.claude/` - Plugin source (skills, rules, settings)

When working on plugins:
- Clear cache after changes: `rm -rf ~/.claude/plugins-cache`
- Restart Claude Code to see updates
- Skills are auto-invoked (won't show in `/plugins` UI)
- Test installation locally: `/plugin marketplace add plaited/acp-harness`

### Documentation

- Public APIs require comprehensive TSDoc documentation
- No `@example` sections - tests are living examples
- Use `@internal` marker for non-public APIs
- Always use `type` over `interface`
- Use Mermaid diagrams only (not ASCII art)

## Important Constraints

1. **No Open Contribution**: This is open-source but not open-contribution
2. **Bun Required**: Development requires bun >= v1.2.9
3. **ES2024 Features**: Uses Promise.withResolvers() and other modern APIs

## Plugin

The bundled **eval-harness** plugin (`.claude/skills/acp-harness/`) provides:
- ACP client API documentation
- Evaluation harness usage
- Output format specifications
- Downstream integration patterns

Install via Claude Code: `/plugin marketplace add plaited/acp-harness`

See `.claude/skills/acp-harness/SKILL.md` for complete documentation.
