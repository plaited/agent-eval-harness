import { describe, expect, test } from 'bun:test'

describe('CLI entry', () => {
  const cliPath = `${import.meta.dir}/../cli.ts`

  test('routes eval command', async () => {
    const proc = Bun.spawn(['bun', cliPath, 'eval', '--help'], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const [, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])

    expect(exitCode).toBe(0)
    expect(stderr).toContain('Usage: agent-eval-harness eval')
  })

  test('unknown command exits with error', async () => {
    const proc = Bun.spawn(['bun', cliPath, 'bogus'], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const [, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])

    expect(exitCode).toBe(1)
    expect(stderr).toContain('Unknown command: bogus')
    expect(stderr).toContain('Available commands: eval')
  })
})
