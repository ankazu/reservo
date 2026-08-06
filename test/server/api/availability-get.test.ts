import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  db: {} as object | undefined,
  getAvailability: vi.fn(),
  ipSequence: 30,
}))

vi.mock('h3', () => ({
  defineEventHandler: (handler: unknown) => handler,
  getQuery: (event: Event) => event.query ?? {},
  getRequestIP: () => `203.0.113.${++state.ipSequence}`,
  getHeader: () => undefined,
  setResponseHeader: () => undefined,
  setResponseStatus: (event: Event, status: number) => {
    event.status = status
  },
}))

vi.mock('../../../server/services/reservation/availability', () => ({
  getAvailability: state.getAvailability,
}))
vi.mock('../../../server/utils/db', () => state)

import handler from '../../../server/api/availability.get'

type Event = { query?: Record<string, string>; status?: number }
const validQuery = {
  roomTypeId: '00000000-0000-4000-8000-000000000001',
  checkInDate: '2027-01-10',
  checkOutDate: '2027-01-12',
  quantity: '1',
  guests: '2',
}

describe('GET /api/availability contract', () => {
  beforeEach(() => {
    state.db = {}
    state.getAvailability.mockReset()
  })

  it('returns a successful ApiResponse for valid input', async () => {
    const data = { available: true, availableQuantity: 2 }
    state.getAvailability.mockResolvedValue(data)
    const event: Event = { query: validQuery }

    await expect(handler(event as never)).resolves.toEqual({
      success: true,
      data,
    })
    expect(event.status).toBeUndefined()
  })

  it('returns stable 400, 503, and 500 ApiResponse errors', async () => {
    const invalid: Event = { query: { ...validQuery, roomTypeId: 'invalid' } }
    await expect(handler(invalid as never)).resolves.toMatchObject({
      success: false,
      error: { code: 'INVALID_REQUEST' },
    })
    expect(invalid.status).toBe(400)

    state.db = undefined
    const unavailable: Event = { query: validQuery }
    await expect(handler(unavailable as never)).resolves.toMatchObject({
      success: false,
      error: { code: 'DATABASE_UNAVAILABLE' },
    })
    expect(unavailable.status).toBe(503)

    state.db = {}
    state.getAvailability.mockRejectedValue(new Error('database failure'))
    const failed: Event = { query: validQuery }
    await expect(handler(failed as never)).resolves.toMatchObject({
      success: false,
      error: { code: 'AVAILABILITY_FAILED' },
    })
    expect(failed.status).toBe(500)
  })
})
