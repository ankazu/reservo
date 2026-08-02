import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  db: {} as object | undefined,
  getReservation: vi.fn(),
  ReservationLookupError: class ReservationLookupError extends Error {
    readonly code = 'RESERVATION_NOT_FOUND'
  },
}))

vi.mock('h3', () => ({
  defineEventHandler: (handler: unknown) => handler,
  getRouterParam: (event: { params?: Record<string, string> }) =>
    event.params?.reservationId,
  setResponseStatus: (event: { status?: number }, status: number) => {
    event.status = status
  },
}))

vi.mock('../../../server/services/reservation/get-reservation', () => ({
  getReservation: state.getReservation,
  ReservationLookupError: state.ReservationLookupError,
}))

vi.mock('../../../server/utils/db', () => state)

import handler from '../../../server/api/reservations/[reservationId].get'

type Event = { params?: Record<string, string>; status?: number }
const validId = '00000000-0000-4000-8000-000000000001'

describe('GET /api/reservations/:reservationId', () => {
  beforeEach(() => {
    state.db = {}
    state.getReservation.mockReset()
  })

  it('returns 400 for an invalid reservation id', async () => {
    const event: Event = { params: { reservationId: 'not-a-uuid' } }

    await expect(handler(event as never)).resolves.toEqual({
      success: false,
      error: {
        code: 'INVALID_RESERVATION_ID',
        message: 'INVALID_RESERVATION_ID',
      },
    })
    expect(event.status).toBe(400)
  })

  it('returns 503 when the database is unavailable', async () => {
    state.db = undefined
    const event: Event = { params: { reservationId: validId } }

    await expect(handler(event as never)).resolves.toMatchObject({
      success: false,
      error: { code: 'DATABASE_UNAVAILABLE' },
    })
    expect(event.status).toBe(503)
  })

  it('returns 200 with the reservation details', async () => {
    const data = { id: validId, items: [] }
    state.getReservation.mockResolvedValue(data)
    const event: Event = { params: { reservationId: validId } }

    await expect(handler(event as never)).resolves.toEqual({
      success: true,
      data,
    })
    expect(event.status).toBeUndefined()
    expect(state.getReservation).toHaveBeenCalledWith({}, validId)
  })

  it('returns 404 when the reservation does not exist', async () => {
    state.getReservation.mockRejectedValue(
      new state.ReservationLookupError('RESERVATION_NOT_FOUND'),
    )
    const event: Event = { params: { reservationId: validId } }

    await expect(handler(event as never)).resolves.toMatchObject({
      success: false,
      error: { code: 'RESERVATION_NOT_FOUND' },
    })
    expect(event.status).toBe(404)
  })

  it('returns 500 for an unknown service error', async () => {
    state.getReservation.mockRejectedValue(new Error('database failure'))
    const event: Event = { params: { reservationId: validId } }

    await expect(handler(event as never)).resolves.toMatchObject({
      success: false,
      error: { code: 'RESERVATION_LOOKUP_FAILED' },
    })
    expect(event.status).toBe(500)
  })
})
