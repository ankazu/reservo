import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  db: {} as object | undefined,
  inspectDailyInventory: vi.fn(),
  setBlockedInventory: vi.fn(),
  InventoryOperationError: class InventoryOperationError extends Error {
    constructor(readonly code: string) {
      super(code)
    }
  },
}))

vi.mock('h3', () => ({
  defineEventHandler: (handler: unknown) => handler,
  getHeader: (event: Event, name: string) => event.headers?.[name],
  getQuery: (event: Event) => event.query ?? {},
  readBody: (event: Event) => Promise.resolve(event.body),
  setResponseStatus: (event: Event, status: number) => {
    event.status = status
  },
}))

vi.mock('../../../server/services/inventory-operations', () => ({
  inspectDailyInventory: state.inspectDailyInventory,
  setBlockedInventory: state.setBlockedInventory,
  InventoryOperationError: state.InventoryOperationError,
}))

vi.mock('../../../server/utils/db', () => state)

import getHandler from '../../../server/api/internal/inventory.get'
import putHandler from '../../../server/api/internal/inventory.put'

type Event = {
  headers?: Record<string, string>
  query?: Record<string, string>
  body?: unknown
  status?: number
}

const roomTypeId = '00000000-0000-4000-8000-000000000001'

describe('internal inventory API', () => {
  beforeEach(() => {
    process.env.RESERVATION_MAINTENANCE_SECRET = 'configured-secret'
    vi.resetAllMocks()
  })

  afterEach(() => {
    delete process.env.RESERVATION_MAINTENANCE_SECRET
  })

  it('does not expose inventory operations without the maintenance secret', async () => {
    const event: Event = {
      query: {
        roomTypeId,
        checkInDate: '2026-08-10',
        checkOutDate: '2026-08-12',
      },
    }

    await expect(getHandler(event as never)).resolves.toMatchObject({
      success: false,
      error: { code: 'MAINTENANCE_UNAUTHORIZED' },
    })
    expect(event.status).toBe(401)
    expect(state.inspectDailyInventory).not.toHaveBeenCalled()
  })

  it('returns operational inventory for a validated date range', async () => {
    state.inspectDailyInventory.mockResolvedValue([
      {
        stayDate: '2026-08-10',
        totalQuantity: 3,
        reservedQuantity: 1,
        blockedQuantity: 1,
        availableQuantity: 1,
      },
    ])
    const event: Event = {
      headers: { 'x-maintenance-secret': 'configured-secret' },
      query: {
        roomTypeId,
        checkInDate: '2026-08-10',
        checkOutDate: '2026-08-11',
      },
    }

    await expect(getHandler(event as never)).resolves.toMatchObject({
      success: true,
      data: [{ availableQuantity: 1 }],
    })
    expect(state.inspectDailyInventory).toHaveBeenCalledWith({}, event.query)
  })

  it('rejects invalid block operations before calling the service', async () => {
    const event: Event = {
      headers: { 'x-maintenance-secret': 'configured-secret' },
      body: { roomTypeId, stayDate: 'not-a-date', blockedQuantity: -1 },
    }

    await expect(putHandler(event as never)).resolves.toMatchObject({
      success: false,
      error: { code: 'INVALID_REQUEST' },
    })
    expect(event.status).toBe(400)
    expect(state.setBlockedInventory).not.toHaveBeenCalled()
  })

  it('sets the desired blocked quantity and reports capacity conflicts', async () => {
    const body = { roomTypeId, stayDate: '2026-08-10', blockedQuantity: 2 }
    state.setBlockedInventory.mockResolvedValueOnce({
      stayDate: body.stayDate,
      totalQuantity: 3,
      reservedQuantity: 1,
      blockedQuantity: 2,
      availableQuantity: 0,
    })
    const successEvent: Event = {
      headers: { 'x-maintenance-secret': 'configured-secret' },
      body,
    }

    await expect(putHandler(successEvent as never)).resolves.toMatchObject({
      success: true,
      data: { blockedQuantity: 2, availableQuantity: 0 },
    })

    state.setBlockedInventory.mockRejectedValueOnce(
      new state.InventoryOperationError('BLOCKED_QUANTITY_EXCEEDS_CAPACITY'),
    )
    const conflictEvent: Event = {
      headers: { 'x-maintenance-secret': 'configured-secret' },
      body,
    }
    await expect(putHandler(conflictEvent as never)).resolves.toMatchObject({
      success: false,
      error: { code: 'BLOCKED_QUANTITY_EXCEEDS_CAPACITY' },
    })
    expect(conflictEvent.status).toBe(409)
  })
})
