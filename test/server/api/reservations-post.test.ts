import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  db: {} as object | undefined,
  body: '{}',
  ip: '203.0.113.10',
  ipSequence: 10,
  createReservationHold: vi.fn(),
}))

vi.mock('h3', () => ({
  defineEventHandler: (handler: unknown) => handler,
  getHeader: (event: Event, name: string) => event.headers?.[name],
  getRequestIP: () => state.ip,
  getRequestWebStream: () =>
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(state.body))
        controller.close()
      },
    }),
  setResponseHeader: (event: Event, name: string, value: string) => {
    event.responseHeaders = { ...event.responseHeaders, [name]: value }
  },
  setResponseStatus: (event: Event, status: number) => {
    event.status = status
  },
}))

vi.mock('../../../server/services/reservation/create-hold', () => ({
  createReservationHold: state.createReservationHold,
  ReservationServiceError: class ReservationServiceError extends Error {},
}))

vi.mock('../../../server/utils/db', () => state)

import handler from '../../../server/api/reservations.post'

type Event = {
  headers?: Record<string, string>
  status?: number
  responseHeaders?: Record<string, string>
}

describe('POST /api/reservations request guards', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-05T12:00:00+08:00'))
    state.db = {}
    state.body = '{}'
    state.ip = `203.0.113.${++state.ipSequence}`
    state.createReservationHold.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('rejects an oversized JSON body before parsing it', async () => {
    const event: Event = {
      headers: {
        'content-length': '9000',
        'idempotency-key': 'request-1',
        'x-request-fingerprint': 'fingerprint',
      },
    }

    await expect(handler(event as never)).resolves.toMatchObject({
      success: false,
      error: { code: 'REQUEST_BODY_TOO_LARGE' },
    })
    expect(event.status).toBe(413)
    expect(state.createReservationHold).not.toHaveBeenCalled()
  })

  it('stops an oversized streamed body without relying on content-length', async () => {
    state.body = JSON.stringify({ padding: 'x'.repeat(9_000) })
    const event: Event = {
      headers: {
        'idempotency-key': 'request-streamed',
        'x-request-fingerprint': 'fingerprint',
      },
    }

    await expect(handler(event as never)).resolves.toMatchObject({
      success: false,
      error: { code: 'REQUEST_BODY_TOO_LARGE' },
    })
    expect(event.status).toBe(413)
  })

  it('rejects idempotency keys larger than the public limit', async () => {
    const event: Event = {
      headers: {
        'idempotency-key': 'x'.repeat(129),
        'x-request-fingerprint': 'fingerprint',
      },
    }

    await expect(handler(event as never)).resolves.toMatchObject({
      success: false,
      error: { code: 'IDEMPOTENCY_KEY_INVALID' },
    })
    expect(event.status).toBe(400)
  })

  it('rejects oversized fingerprint headers', async () => {
    const event: Event = {
      headers: {
        'idempotency-key': 'request-fingerprint',
        'x-request-fingerprint': 'x'.repeat(2_049),
      },
    }

    await expect(handler(event as never)).resolves.toMatchObject({
      success: false,
      error: { code: 'REQUEST_FINGERPRINT_INVALID' },
    })
    expect(event.status).toBe(400)
  })

  it('rejects a hold with a past check-in date before calling the service', async () => {
    state.body = JSON.stringify({
      propertyId: '11111111-1111-4111-8111-111111111111',
      roomTypeId: '22222222-2222-4222-8222-222222222222',
      checkInDate: '2000-01-01',
      checkOutDate: '2000-01-02',
      quantity: 1,
      guests: 1,
      guestName: 'Guest',
      guestEmail: 'guest@example.com',
    })
    const event: Event = {
      headers: {
        'idempotency-key': 'request-past',
        'x-request-fingerprint': 'fingerprint',
      },
    }

    await expect(handler(event as never)).resolves.toMatchObject({
      success: false,
      error: { code: 'INVALID_REQUEST' },
    })
    expect(event.status).toBe(400)
    expect(state.createReservationHold).not.toHaveBeenCalled()
  })

  it('does not charge same-key retries repeatedly against hold quotas', async () => {
    const input = {
      propertyId: '11111111-1111-4111-8111-111111111111',
      roomTypeId: '22222222-2222-4222-8222-222222222222',
      checkInDate: '2026-08-10',
      checkOutDate: '2026-08-12',
      quantity: 1,
      guests: 1,
      guestName: 'Guest',
      guestEmail: 'guest@example.com',
      ratePlanName: 'Standard',
    } as const
    state.body = JSON.stringify(input)
    state.createReservationHold.mockResolvedValue({ id: 'reservation-1' })
    const event = (): Event => ({
      headers: {
        'idempotency-key': 'same-request',
        'x-request-fingerprint': JSON.stringify(input),
      },
    })

    for (let attempt = 0; attempt < 6; attempt += 1) {
      await expect(handler(event() as never)).resolves.toMatchObject({
        success: true,
        data: { id: 'reservation-1' },
      })
    }
    expect(state.createReservationHold).toHaveBeenCalledTimes(6)
  })
})
