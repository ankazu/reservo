import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  db: {} as object | undefined,
  expireReservations: vi.fn(),
  getExpirationBacklog: vi.fn(),
  logStructured: vi.fn(),
}))

vi.mock('h3', () => ({
  defineEventHandler: (handler: unknown) => handler,
  getHeader: (event: Event, name: string) => event.headers?.[name],
  setResponseStatus: (event: Event, status: number) => {
    event.status = status
  },
}))
vi.mock('../../../server/services/reservation/transition', () => ({
  expireReservations: state.expireReservations,
  getExpirationBacklog: state.getExpirationBacklog,
}))
vi.mock('../../../server/utils/structured-logging', () => ({
  logStructured: state.logStructured,
}))
vi.mock('../../../server/utils/db', () => state)

import handler from '../../../server/api/internal/reservations/expire.post'

type Event = { headers?: Record<string, string>; status?: number }

describe('POST /api/internal/reservations/expire', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-06T08:00:00.000Z'))
    process.env.RESERVATION_MAINTENANCE_SECRET = 'configured-secret'
    state.db = {}
    vi.resetAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
    delete process.env.RESERVATION_MAINTENANCE_SECRET
  })

  it('rejects an invalid scheduler secret without running expiration', async () => {
    const event: Event = {}
    await expect(handler(event as never)).resolves.toMatchObject({
      success: false,
      error: { code: 'MAINTENANCE_UNAUTHORIZED' },
    })
    expect(event.status).toBe(401)
    expect(state.expireReservations).not.toHaveBeenCalled()
  })

  it('reports completion time, expired count, backlog, and a structured event', async () => {
    state.expireReservations.mockResolvedValue([{ id: 'reservation-1' }])
    state.getExpirationBacklog.mockResolvedValue(4)
    const event: Event = {
      headers: { 'x-maintenance-secret': 'configured-secret' },
    }

    await expect(handler(event as never)).resolves.toEqual({
      success: true,
      data: {
        completedAt: '2026-08-06T08:00:00.000Z',
        expiredCount: 1,
        backlogCount: 4,
      },
    })
    expect(state.logStructured).toHaveBeenCalledWith('info', {
      event: 'reservation_expiration_completed',
      completedAt: '2026-08-06T08:00:00.000Z',
      expiredCount: 1,
      backlogCount: 4,
    })
  })

  it('returns a retryable failure and emits a structured error event', async () => {
    state.expireReservations.mockRejectedValue(new Error('database failure'))
    const event: Event = {
      headers: { 'x-maintenance-secret': 'configured-secret' },
    }

    await expect(handler(event as never)).resolves.toMatchObject({
      success: false,
      error: { code: 'RESERVATION_EXPIRATION_FAILED' },
    })
    expect(event.status).toBe(500)
    expect(state.logStructured).toHaveBeenCalledWith('error', {
      event: 'reservation_expiration_failed',
    })
  })

  it('logs database-unavailable scheduler failures', async () => {
    state.db = undefined
    const event: Event = {
      headers: { 'x-maintenance-secret': 'configured-secret' },
    }

    await expect(handler(event as never)).resolves.toMatchObject({
      success: false,
      error: { code: 'DATABASE_UNAVAILABLE' },
    })
    expect(event.status).toBe(503)
    expect(state.logStructured).toHaveBeenCalledWith('error', {
      event: 'reservation_expiration_failed',
    })
  })
})
