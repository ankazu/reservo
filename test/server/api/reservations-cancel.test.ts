import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  db: {} as object | undefined,
  cancelReservation: vi.fn(),
  ReservationTransitionError: class ReservationTransitionError extends Error {
    constructor(readonly code: string) {
      super(code)
    }
  },
}))

vi.mock('h3', () => ({
  defineEventHandler: (handler: unknown) => handler,
  getHeader: (event: Event, name: string) => event.headers?.[name],
  getRouterParam: (event: Event) => event.params?.reservationId,
  setResponseStatus: (event: Event, status: number) => {
    event.status = status
  },
}))

vi.mock('../../../server/services/reservation/transition', () => ({
  cancelReservation: state.cancelReservation,
  ReservationTransitionError: state.ReservationTransitionError,
}))

vi.mock('../../../server/utils/db', () => state)

import handler from '../../../server/api/reservations/[reservationId]/cancel.post'

type Event = {
  params?: Record<string, string>
  headers?: Record<string, string>
  status?: number
}

const reservationId = '00000000-0000-4000-8000-000000000001'
const accessToken = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

describe('POST /api/reservations/:reservationId/cancel', () => {
  beforeEach(() => {
    state.db = {}
    state.cancelReservation.mockReset()
  })

  it('passes a bearer access token to cancellation', async () => {
    state.cancelReservation.mockResolvedValue({
      id: reservationId,
      status: 'CANCELLED',
    })
    const event: Event = {
      params: { reservationId },
      headers: { authorization: `Bearer ${accessToken}` },
    }

    await expect(handler(event as never)).resolves.toMatchObject({
      success: true,
      data: { status: 'CANCELLED' },
    })
    expect(event.status).toBeUndefined()
    expect(state.cancelReservation).toHaveBeenCalledWith(
      {},
      reservationId,
      accessToken,
    )
  })

  it.each([undefined, 'Basic credential'])(
    'returns not-found without exposing data for authorization %s',
    async (authorization) => {
      const event: Event = {
        params: { reservationId },
        headers: authorization ? { authorization } : undefined,
      }

      await expect(handler(event as never)).resolves.toEqual({
        success: false,
        error: {
          code: 'RESERVATION_NOT_FOUND',
          message: 'RESERVATION_NOT_FOUND',
        },
      })
      expect(event.status).toBe(404)
      expect(state.cancelReservation).not.toHaveBeenCalled()
    },
  )

  it('maps a wrong-reservation token to the same not-found response', async () => {
    state.cancelReservation.mockRejectedValue(
      new state.ReservationTransitionError('RESERVATION_NOT_FOUND'),
    )
    const event: Event = {
      params: { reservationId },
      headers: { authorization: `Bearer ${accessToken}` },
    }

    await expect(handler(event as never)).resolves.toMatchObject({
      success: false,
      error: { code: 'RESERVATION_NOT_FOUND' },
    })
    expect(event.status).toBe(404)
  })

  it('returns stable validation, database, conflict, and failure responses', async () => {
    const invalid: Event = {
      params: { reservationId: 'invalid' },
      headers: { authorization: `Bearer ${accessToken}` },
    }
    await expect(handler(invalid as never)).resolves.toMatchObject({
      success: false,
      error: { code: 'INVALID_RESERVATION_ID' },
    })
    expect(invalid.status).toBe(400)

    state.db = undefined
    const unavailable: Event = {
      params: { reservationId },
      headers: { authorization: `Bearer ${accessToken}` },
    }
    await expect(handler(unavailable as never)).resolves.toMatchObject({
      success: false,
      error: { code: 'DATABASE_UNAVAILABLE' },
    })
    expect(unavailable.status).toBe(503)

    state.db = {}
    state.cancelReservation.mockRejectedValueOnce(
      new state.ReservationTransitionError('INVALID_STATUS_TRANSITION'),
    )
    const conflict: Event = {
      params: { reservationId },
      headers: { authorization: `Bearer ${accessToken}` },
    }
    await expect(handler(conflict as never)).resolves.toMatchObject({
      success: false,
      error: { code: 'INVALID_STATUS_TRANSITION' },
    })
    expect(conflict.status).toBe(409)

    state.cancelReservation.mockRejectedValueOnce(new Error('database failure'))
    const failed: Event = {
      params: { reservationId },
      headers: { authorization: `Bearer ${accessToken}` },
    }
    await expect(handler(failed as never)).resolves.toMatchObject({
      success: false,
      error: { code: 'RESERVATION_TRANSITION_FAILED' },
    })
    expect(failed.status).toBe(500)
  })
})
