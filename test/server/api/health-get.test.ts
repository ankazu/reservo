import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  db: {} as object | undefined,
  checkApplicationHealth: vi.fn(),
  logStructured: vi.fn(),
}))

vi.mock('h3', () => ({
  defineEventHandler: (handler: unknown) => handler,
  setResponseStatus: (event: Event, status: number) => {
    event.status = status
  },
}))
vi.mock('../../../server/services/health', () => ({
  checkApplicationHealth: state.checkApplicationHealth,
}))
vi.mock('../../../server/utils/structured-logging', () => ({
  logStructured: state.logStructured,
}))
vi.mock('../../../server/utils/db', () => state)

import handler from '../../../server/api/health.get'

type Event = { status?: number }

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-06T08:00:00.000Z'))
    state.db = {}
    vi.resetAllMocks()
  })

  it('reports readiness when PostgreSQL is reachable', async () => {
    state.checkApplicationHealth.mockResolvedValue(undefined)
    const event: Event = {}

    await expect(handler(event as never)).resolves.toEqual({
      success: true,
      data: {
        status: 'ok',
        database: 'up',
        checkedAt: '2026-08-06T08:00:00.000Z',
      },
    })
    expect(event.status).toBeUndefined()
  })

  it('returns 503 when the database is absent or unreachable', async () => {
    state.db = undefined
    const absent: Event = {}
    await expect(handler(absent as never)).resolves.toMatchObject({
      success: false,
      error: { code: 'DATABASE_UNAVAILABLE' },
    })
    expect(absent.status).toBe(503)
    expect(state.logStructured).toHaveBeenCalledWith('error', {
      event: 'health_check_failed',
    })

    state.db = {}
    state.logStructured.mockClear()
    state.checkApplicationHealth.mockRejectedValue(new Error('connection'))
    const unreachable: Event = {}
    await expect(handler(unreachable as never)).resolves.toMatchObject({
      success: false,
      error: { code: 'HEALTH_CHECK_FAILED' },
    })
    expect(unreachable.status).toBe(503)
    expect(state.logStructured).toHaveBeenCalledWith('error', {
      event: 'health_check_failed',
    })
  })
})
