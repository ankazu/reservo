import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { expect, test } from '@playwright/test'

const execFileAsync = promisify(execFile)

test('production artifact exposes readiness and accepts the scheduler runner', async ({
  request,
}) => {
  const health = await request.get('/api/health')
  expect(health.status()).toBe(200)
  await expect(health.json()).resolves.toMatchObject({
    success: true,
    data: { status: 'ok', database: 'up' },
  })

  const secret = process.env.RESERVATION_MAINTENANCE_SECRET
  expect(secret).toBeTruthy()
  const { stdout } = await execFileAsync(
    process.execPath,
    ['--experimental-strip-types', 'scripts/run-expiration-maintenance.ts'],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        RESERVO_BASE_URL: 'http://127.0.0.1:3000',
        RESERVATION_MAINTENANCE_SECRET: secret,
      },
    },
  )
  const report = JSON.parse(stdout.trim())
  expect(report).toMatchObject({
    event: 'expiration_scheduler_succeeded',
    expiredCount: expect.any(Number),
    backlogCount: expect.any(Number),
  })
  expect(new Date(report.completedAt).toISOString()).toBe(report.completedAt)
})
