import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  db: {} as object | undefined,
  getPropertyCatalog: vi.fn(),
}))

vi.mock('h3', () => ({
  defineEventHandler: (handler: unknown) => handler,
  setResponseStatus: (event: { status?: number }, status: number) => {
    event.status = status
  },
}))

vi.mock('../../../server/services/catalog', () => ({
  getPropertyCatalog: state.getPropertyCatalog,
}))

vi.mock('../../../server/utils/db', () => state)

import handler from '../../../server/api/property.get'

describe('GET /api/property', () => {
  beforeEach(() => {
    state.db = {}
    state.getPropertyCatalog.mockReset()
  })

  it('returns the configured property', async () => {
    const property = {
      id: 'property-1',
      name: 'Reservo Hotel',
      timezone: 'Asia/Taipei',
      currency: 'TWD',
    }
    state.getPropertyCatalog.mockResolvedValue(property)

    await expect(handler({} as never)).resolves.toEqual({
      success: true,
      data: property,
    })
    expect(state.getPropertyCatalog).toHaveBeenCalledWith({})
  })

  it('returns 404 when no property is configured', async () => {
    const event: { status?: number } = {}
    state.getPropertyCatalog.mockResolvedValue(null)

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
    expect(state.getPropertyCatalog).not.toHaveBeenCalled()
  })

  it('returns a stable error when catalog lookup fails', async () => {
    const event: { status?: number } = {}
    state.getPropertyCatalog.mockRejectedValue(new Error('database detail'))

    await expect(handler(event as never)).resolves.toMatchObject({
      success: false,
      error: { code: 'CATALOG_FAILED', message: 'CATALOG_FAILED' },
    })
    expect(event.status).toBe(500)
  })
})
