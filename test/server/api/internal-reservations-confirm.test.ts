import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  db: {} as object | undefined,
  transitionReservation: vi.fn(),
  ReservationTransitionError: class ReservationTransitionError extends Error {},
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
  transitionReservation: state.transitionReservation,
  ReservationTransitionError: state.ReservationTransitionError,
}))

vi.mock('../../../server/utils/db', () => state)

import handler from '../../../server/api/internal/reservations/[reservationId]/confirm.post'

type Event = {
  params?: Record<string, string>
  headers?: Record<string, string>
  status?: number
}

const reservationId = '00000000-0000-4000-8000-000000000001'

describe('POST /api/internal/reservations/:reservationId/confirm', () => {
  beforeEach(() => {
    process.env.RESERVATION_MAINTENANCE_SECRET = 'configured-secret'
    state.transitionReservation.mockReset()
  })

  afterEach(() => {
    delete process.env.RESERVATION_MAINTENANCE_SECRET
  })

  it('rejects calls without the internal secret', async () => {
    const event: Event = { params: { reservationId } }

    await expect(handler(event as never)).resolves.toMatchObject({
      success: false,
      error: { code: 'MAINTENANCE_UNAUTHORIZED' },
    })
    expect(event.status).toBe(401)
    expect(state.transitionReservation).not.toHaveBeenCalled()
  })

  it('confirms through the protected internal boundary', async () => {
    state.transitionReservation.mockResolvedValue({
      id: reservationId,
      status: 'CONFIRMED',
    })
    const event: Event = {
      params: { reservationId },
      headers: { 'x-maintenance-secret': 'configured-secret' },
    }

    await expect(handler(event as never)).resolves.toMatchObject({
      success: true,
      data: { status: 'CONFIRMED' },
    })
    expect(state.transitionReservation).toHaveBeenCalledWith(
      {},
      reservationId,
      'CONFIRMED',
    )
  })
})
