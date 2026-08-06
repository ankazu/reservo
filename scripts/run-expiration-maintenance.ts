import { pathToFileURL } from 'node:url'

type ExpirationReport = {
  completedAt: string
  expiredCount: number
  backlogCount: number
}

type Options = {
  baseUrl: string
  secret: string
  fetchImpl?: typeof fetch
  wait?: (milliseconds: number) => Promise<void>
}

function isExpirationReport(value: unknown): value is ExpirationReport {
  if (!value || typeof value !== 'object') return false
  const report = value as Record<string, unknown>
  return (
    typeof report.completedAt === 'string' &&
    Number.isInteger(report.expiredCount) &&
    Number.isInteger(report.backlogCount)
  )
}

export async function runExpirationMaintenance({
  baseUrl,
  secret,
  fetchImpl = fetch,
  wait = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
}: Options): Promise<ExpirationReport> {
  const endpoint = new URL('/api/internal/reservations/expire', baseUrl)
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'X-Maintenance-Secret': secret },
        signal: AbortSignal.timeout(15_000),
      })
      if (response.ok) {
        const payload = (await response.json()) as {
          success?: boolean
          data?: unknown
        }
        if (payload.success && isExpirationReport(payload.data)) {
          return payload.data
        }
      }
    } catch {
      // A scheduler retry is safe because expiration is idempotent.
    }
    if (attempt < 3) await wait(attempt * 1_000)
  }
  throw new Error('expiration maintenance failed after 3 attempts')
}

async function main() {
  const baseUrl = process.env.RESERVO_BASE_URL
  const secret = process.env.RESERVATION_MAINTENANCE_SECRET
  if (!baseUrl || !secret) {
    throw new Error(
      'RESERVO_BASE_URL and RESERVATION_MAINTENANCE_SECRET are required',
    )
  }
  const report = await runExpirationMaintenance({ baseUrl, secret })
  console.info(
    JSON.stringify({ event: 'expiration_scheduler_succeeded', ...report }),
  )
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch(() => {
    console.error(JSON.stringify({ event: 'expiration_scheduler_failed' }))
    process.exitCode = 1
  })
}
