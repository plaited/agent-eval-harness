/**
 * @plaited/acp-harness - ACP client and evaluation harness for TypeScript/Bun projects.
 *
 * @remarks
 * This module provides a headless ACP client for programmatic agent interaction,
 * optimized for testing, evaluation, and training data generation.
 *
 * **Primary exports:**
 * - `createACPClient` - Factory for headless ACP client instances
 * - `createPrompt`, `createPromptWithFiles`, `createPromptWithImage` - Prompt builders
 * - `summarizeResponse` - Response analysis utility
 *
 * **Re-exports from acp-utils (for advanced usage):**
 * - Content builders: `createTextContent`, `createImageContent`, `createAudioContent`,
 *   `createResourceLink`, `createTextResource`, `createBlobResource`
 * - Content extractors: `extractText`, `extractTextFromUpdates`, `extractToolCalls`,
 *   `extractLatestToolCalls`, `extractPlan`
 * - Tool call utilities: `filterToolCallsByStatus`, `filterToolCallsByTitle`,
 *   `hasToolCallErrors`, `getCompletedToolCallsWithContent`
 * - Plan utilities: `filterPlanByStatus`, `getPlanProgress`
 *
 * @packageDocumentation
 */

export * from './acp-client.ts'
export * from './acp-helpers.ts'
export * from './acp-utils.ts'
