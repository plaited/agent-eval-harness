/**
 * Tests for adapter scaffolding functionality.
 */

import { afterEach, describe, expect, test } from 'bun:test'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { runScaffold, type ScaffoldConfig } from '../adapter-scaffold.ts'

const testDir = join(import.meta.dir, 'fixtures', 'scaffold-output')

describe('runScaffold', () => {
  afterEach(async () => {
    // Clean up test output
    await rm(testDir, { recursive: true, force: true })
  })

  test('generates TypeScript adapter structure', async () => {
    const config: ScaffoldConfig = {
      name: 'test-agent',
      outputDir: testDir,
      lang: 'ts',
      minimal: false,
    }

    const result = await runScaffold(config)

    expect(result.outputDir).toBe(testDir)
    expect(result.lang).toBe('ts')
    expect(result.files).toContain('package.json')
    expect(result.files).toContain('tsconfig.json')
    expect(result.files).toContain('src/main.ts')
    expect(result.files).toContain('src/types.ts')
    expect(result.files).toContain('src/session-manager.ts')
    expect(result.files).toContain('src/handlers/initialize.ts')
    expect(result.files).toContain('src/handlers/session-new.ts')
    expect(result.files).toContain('src/handlers/session-prompt.ts')
    expect(result.files).toContain('src/handlers/session-cancel.ts')
    expect(result.files).toContain('README.md')

    // Verify files actually exist
    const packageJson = await Bun.file(join(testDir, 'package.json')).text()
    expect(packageJson).toContain('"test-agent-acp"')

    const mainTs = await Bun.file(join(testDir, 'src', 'main.ts')).text()
    expect(mainTs).toContain('#!/usr/bin/env bun')
    expect(mainTs).toContain('handleInitialize')
  })

  test('generates minimal TypeScript structure without README', async () => {
    const config: ScaffoldConfig = {
      name: 'minimal-agent',
      outputDir: testDir,
      lang: 'ts',
      minimal: true,
    }

    const result = await runScaffold(config)

    expect(result.files).not.toContain('README.md')
    expect(result.files).toContain('package.json')
    expect(result.files).toContain('src/main.ts')
  })

  test('generates Python adapter structure', async () => {
    const config: ScaffoldConfig = {
      name: 'python-agent',
      outputDir: testDir,
      lang: 'python',
      minimal: false,
    }

    const result = await runScaffold(config)

    expect(result.lang).toBe('python')
    expect(result.files).toContain('adapter.py')
    expect(result.files).toContain('README.md')

    const adapterPy = await Bun.file(join(testDir, 'adapter.py')).text()
    expect(adapterPy).toContain('#!/usr/bin/env python3')
    expect(adapterPy).toContain('python-agent')
    expect(adapterPy).toContain('def handle_initialize')
  })

  test('generates minimal Python structure without README', async () => {
    const config: ScaffoldConfig = {
      name: 'minimal-python',
      outputDir: testDir,
      lang: 'python',
      minimal: true,
    }

    const result = await runScaffold(config)

    expect(result.files).toContain('adapter.py')
    expect(result.files).not.toContain('README.md')
  })

  test('package.json contains correct name', async () => {
    const config: ScaffoldConfig = {
      name: 'my-special-agent',
      outputDir: testDir,
      lang: 'ts',
      minimal: true,
    }

    await runScaffold(config)

    const packageJson = JSON.parse(await Bun.file(join(testDir, 'package.json')).text())
    expect(packageJson.name).toBe('my-special-agent-acp')
  })
})
