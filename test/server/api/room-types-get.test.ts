import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  db: {} as object | undefined,
  getConfiguredRoomTypeCatalog: vi.fn(),
}))

vi.mock('h3', () => ({
  defineEventHandler: (handler: unknown) => handler,
  setResponseStatus: (event: { status?: number }, status: number) => {
    event.status = status
  },
}))

vi.mock('../../../server/services/catalog', () => ({
  getConfiguredRoomTypeCatalog: state.getConfiguredRoomTypeCatalog,
}))

vi.mock('../../../server/utils/db', () => state)

import handler from '../../../server/api/room-types.get'

describe('GET /api/room-types', () => {
  beforeEach(() => {
    state.db = {}
    state.getConfiguredRoomTypeCatalog.mockReset()
  })

  it('returns room types for the configured property', async () => {
    const roomTypes = [
      {
        id: 'room-type-1',
        code: 'garden-room',
        propertyId: 'property-1',
        name: 'Garden Room',
        description: 'Garden view',
        maxGuests: 2,
        nightlyPrice: 5800,
      },
    ]
    state.getConfiguredRoomTypeCatalog.mockResolvedValue(roomTypes)
    const event: { status?: number } = {}

    await expect(handler(event as never)).resolves.toEqual({
      success: true,
      data: roomTypes,
    })
    expect(event.status).toBeUndefined()
  })

  it('returns an empty catalog when the property has no room types', async () => {
    state.getConfiguredRoomTypeCatalog.mockResolvedValue([])
    const event: { status?: number } = {}

    await expect(handler(event as never)).resolves.toEqual({
      success: true,
      data: [],
    })
    expect(event.status).toBeUndefined()
  })

  it('returns 404 when no property is configured', async () => {
    const event: { status?: number } = {}
    state.getConfiguredRoomTypeCatalog.mockResolvedValue(null)

    await expect(handler(event as never)).resolves.toMatchObject({
      success: false,
      error: { code: 'PROPERTY_NOT_FOUND' },
    })
    expect(event.status).toBe(404)
  })

  it('returns 503 when the database is unavailable', async () => {
    const event: { status?: number } = {}
    state.db = undefined

    await expect(handler(event as never)).resolves.toMatchObject({
      success: false,
      error: { code: 'DATABASE_UNAVAILABLE' },
    })
    expect(event.status).toBe(503)
    expect(state.getConfiguredRoomTypeCatalog).not.toHaveBeenCalled()
  })

  it('returns a stable error when catalog lookup fails', async () => {
    const event: { status?: number } = {}
    state.getConfiguredRoomTypeCatalog.mockRejectedValue(
      new Error('database detail'),
    )

    await expect(handler(event as never)).resolves.toMatchObject({
      success: false,
      error: { code: 'CATALOG_FAILED', message: 'CATALOG_FAILED' },
    })
    expect(event.status).toBe(500)
  })
})
