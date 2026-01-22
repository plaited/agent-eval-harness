/**
 * Schemas command - export JSON schemas for non-TypeScript users.
 *
 * @remarks
 * Uses Zod 4's native `z.toJSONSchema()` to generate JSON Schema from
 * the harness schemas. Useful for validation in other languages/tools.
 *
 * @packageDocumentation
 */

import { parseArgs } from 'node:util'
import { z } from 'zod'
import * as schemas from './schemas.ts'

// ============================================================================
// Schema Registry
// ============================================================================

/** Available schemas for export */
const SCHEMA_REGISTRY: Record<string, z.ZodSchema> = {
  PromptCase: schemas.PromptCaseSchema,
  GraderResult: schemas.GraderResultSchema,
  TrajectoryStep: schemas.TrajectoryStepSchema,
  CaptureResult: schemas.CaptureResultSchema,
  SummaryResult: schemas.SummaryResultSchema,
  TrialEntry: schemas.TrialEntrySchema,
  TrialResult: schemas.TrialResultSchema,
  CalibrationSample: schemas.CalibrationSampleSchema,
  BalanceAnalysis: schemas.BalanceAnalysisSchema,
  ValidationResult: schemas.ValidationResultSchema,
  McpServerConfig: schemas.McpServerSchema,
  Session: schemas.SessionSchema,
  JsonRpcRequest: schemas.JsonRpcRequestSchema,
  JsonRpcResponse: schemas.JsonRpcResponseSchema,
  JsonRpcError: schemas.JsonRpcErrorSchema,
}

// ============================================================================
// Template Registry
// ============================================================================

/** Available templates for export */
const TEMPLATE_REGISTRY: Record<string, string> = {
  'llm-judge-gemini': 'compare-llm-judge-gemini.ts',
  'llm-judge-anthropic': 'compare-llm-judge-anthropic.ts',
}

/** Template descriptions for help */
const TEMPLATE_DESCRIPTIONS: Record<string, string> = {
  'llm-judge-gemini': 'LLM-as-Judge grader using Google GenAI (requires @google/genai)',
  'llm-judge-anthropic': 'LLM-as-Judge grader using Anthropic Claude (requires @anthropic-ai/sdk)',
}

// ============================================================================
// Types
// ============================================================================

/** Configuration for schemas command */
export type SchemasConfig = {
  /** Specific schema name to export (undefined = all) */
  schemaName?: string
  /** Output file path */
  outputPath?: string
  /** Output as JSON (vs list) */
  json?: boolean
  /** Split into separate files */
  split?: boolean
  /** List available schemas */
  list?: boolean
  /** Template name to export */
  template?: string
  /** List available templates */
  listTemplates?: boolean
}

// ============================================================================
// Helpers
// ============================================================================

/** Resolve path relative to process.cwd() */
const resolvePath = (path: string): string => {
  if (path.startsWith('/')) return path
  return `${process.cwd()}/${path}`
}

/** Generate JSON Schema from Zod schema */
const toJsonSchema = (schema: z.ZodSchema, name: string): object => {
  try {
    // Zod 4's native JSON Schema generation
    const jsonSchema = z.toJSONSchema(schema)
    return {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      title: name,
      ...jsonSchema,
    }
  } catch (error) {
    // Fallback for schemas that can't be converted
    return {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      title: name,
      description: `Schema for ${name} (auto-generation failed: ${error instanceof Error ? error.message : 'unknown error'})`,
    }
  }
}

// ============================================================================
// Schemas Implementation
// ============================================================================

/**
 * Get the assets directory path.
 *
 * @returns Path to assets/templates directory
 */
const getTemplatesDir = (): string => {
  // When running from source, templates are in assets/templates
  // relative to the package root
  const packageRoot = new URL('../..', import.meta.url).pathname
  return `${packageRoot}assets/templates`
}

/**
 * Execute schemas command with configuration object.
 *
 * @param config - Schemas configuration
 * @returns Generated JSON schemas or template content
 */
export const runSchemas = async (config: SchemasConfig): Promise<Record<string, object> | string[] | string> => {
  const { schemaName, outputPath, json = false, split = false, list = false, template, listTemplates = false } = config

  // List templates mode
  if (listTemplates) {
    // biome-ignore lint/suspicious/noConsole: CLI stdout output
    console.log('Available templates:')
    for (const [name, desc] of Object.entries(TEMPLATE_DESCRIPTIONS)) {
      // biome-ignore lint/suspicious/noConsole: CLI stdout output
      console.log(`  - ${name}: ${desc}`)
    }
    return Object.keys(TEMPLATE_REGISTRY)
  }

  // Template export mode
  if (template) {
    const templateFile = TEMPLATE_REGISTRY[template]
    if (!templateFile) {
      console.error(`Error: Unknown template '${template}'`)
      console.error(`Available: ${Object.keys(TEMPLATE_REGISTRY).join(', ')}`)
      process.exit(1)
    }

    const templatesDir = getTemplatesDir()
    const templatePath = `${templatesDir}/${templateFile}`

    try {
      const content = await Bun.file(templatePath).text()

      if (outputPath) {
        await Bun.write(resolvePath(outputPath), content)
        console.error(`Template written to: ${outputPath}`)
      } else {
        // biome-ignore lint/suspicious/noConsole: CLI stdout output
        console.log(content)
      }

      return content
    } catch (error) {
      console.error(`Error reading template: ${error instanceof Error ? error.message : 'unknown error'}`)
      process.exit(1)
    }
  }

  // List mode
  if (list) {
    const names = Object.keys(SCHEMA_REGISTRY)
    // biome-ignore lint/suspicious/noConsole: CLI stdout output
    console.log('Available schemas:')
    for (const name of names) {
      // biome-ignore lint/suspicious/noConsole: CLI stdout output
      console.log(`  - ${name}`)
    }
    return names
  }

  // Single schema mode
  if (schemaName) {
    const schema = SCHEMA_REGISTRY[schemaName]
    if (!schema) {
      console.error(`Error: Unknown schema '${schemaName}'`)
      console.error(`Available: ${Object.keys(SCHEMA_REGISTRY).join(', ')}`)
      process.exit(1)
    }

    const jsonSchema = toJsonSchema(schema, schemaName)
    const output = JSON.stringify(jsonSchema, null, 2)

    if (outputPath) {
      await Bun.write(resolvePath(outputPath), output)
    } else {
      // biome-ignore lint/suspicious/noConsole: CLI stdout output
      console.log(output)
    }

    return { [schemaName]: jsonSchema }
  }

  // All schemas mode
  const allSchemas: Record<string, object> = {}

  for (const [name, schema] of Object.entries(SCHEMA_REGISTRY)) {
    allSchemas[name] = toJsonSchema(schema, name)
  }

  if (split && outputPath) {
    // Create directory and write separate files
    const dir = resolvePath(outputPath)
    await Bun.$`mkdir -p ${dir}`

    for (const [name, jsonSchema] of Object.entries(allSchemas)) {
      const filePath = `${dir}/${name}.json`
      await Bun.write(filePath, JSON.stringify(jsonSchema, null, 2))
    }

    console.error(`Wrote ${Object.keys(allSchemas).length} schema files to ${dir}/`)
  } else if (json) {
    const output = JSON.stringify(allSchemas, null, 2)

    if (outputPath) {
      await Bun.write(resolvePath(outputPath), output)
    } else {
      // biome-ignore lint/suspicious/noConsole: CLI stdout output
      console.log(output)
    }
  } else {
    // Default: list schemas
    // biome-ignore lint/suspicious/noConsole: CLI stdout output
    console.log('Available schemas (use --json to export):')
    for (const name of Object.keys(allSchemas)) {
      // biome-ignore lint/suspicious/noConsole: CLI stdout output
      console.log(`  - ${name}`)
    }
  }

  return allSchemas
}

// ============================================================================
// CLI Entry Point
// ============================================================================

/**
 * Schemas command CLI handler.
 *
 * @param args - Command line arguments (after 'schemas')
 */
export const schemasCli = async (args: string[]): Promise<void> => {
  const { values, positionals } = parseArgs({
    args,
    options: {
      output: { type: 'string', short: 'o' },
      json: { type: 'boolean', short: 'j', default: false },
      split: { type: 'boolean', short: 's', default: false },
      list: { type: 'boolean', short: 'l', default: false },
      template: { type: 'string', short: 't' },
      'list-templates': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: true,
  })

  if (values.help) {
    // biome-ignore lint/suspicious/noConsole: CLI help output
    console.log(`
Usage: agent-eval-harness schemas [schema-name] [options]

Arguments:
  schema-name       Specific schema to export (optional)

Options:
  -o, --output      Output file or directory (with --split)
  -j, --json        Export as JSON (default: list names)
  -s, --split       Split into separate files (requires --output dir)
  -l, --list        List available schemas
  -t, --template    Export grader template (use --list-templates to see options)
  --list-templates  List available templates
  -h, --help        Show this help message

Available Schemas:
  PromptCase, GraderResult, TrajectoryStep, CaptureResult, SummaryResult,
  TrialEntry, TrialResult, CalibrationSample, BalanceAnalysis, ValidationResult,
  McpServerConfig, Session, JsonRpcRequest, JsonRpcResponse, JsonRpcError

Available Templates:
  llm-judge-gemini      LLM-as-Judge using Google GenAI
  llm-judge-anthropic   LLM-as-Judge using Anthropic Claude

Examples:
  # List available schemas
  agent-eval-harness schemas --list

  # Export all schemas as single JSON file
  agent-eval-harness schemas --json -o schemas.json

  # Export specific schema
  agent-eval-harness schemas CaptureResult --json
  agent-eval-harness schemas TrialResult --json -o trial-schema.json

  # Export all schemas as separate files
  agent-eval-harness schemas --json --split -o schemas/

  # Export LLM-as-Judge template
  agent-eval-harness schemas --template llm-judge-gemini -o my-grader.ts
  agent-eval-harness schemas --template llm-judge-anthropic > my-grader.ts

  # List available templates
  agent-eval-harness schemas --list-templates
`)
    return
  }

  await runSchemas({
    schemaName: positionals[0],
    outputPath: values.output,
    json: values.json ?? false,
    split: values.split ?? false,
    list: values.list ?? false,
    template: values.template,
    listTemplates: values['list-templates'] ?? false,
  })
}
