import { spawnSync } from 'node:child_process'

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

if (!process.env.DATABASE_URL) {
  console.error(
    'DATABASE_URL is required for integration tests; refusing to run skipped tests.',
  )
  process.exit(1)
}

function run(command, args) {
  const result = spawnSync(command, args, {
    env: { ...process.env, REQUIRE_DATABASE: 'true' },
    stdio: 'inherit',
  })

  if (result.error) {
    console.error(result.error.message)
    process.exit(1)
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

run(npmCommand, ['run', 'db:migrate'])
run(npmCommand, [
  'exec',
  'vitest',
  '--',
  'run',
  '--setupFiles',
  'test/integration-setup.ts',
  'test/server/integration',
])
