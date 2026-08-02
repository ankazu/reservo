import { describe, expect, it, vi } from 'vitest'

const repository = vi.hoisted(() => ({
  findRoomType: vi.fn(),
  findInventoryForStay: vi.fn(),
  provisionInventoryForStay: vi.fn(),
}))

vi.mock('../../../../server/repositories/reservation', () => repository)

import { getAvailability } from '../../../../server/services/reservation/availability'

describe('availability service pricing', () => {
  it('passes the room type nightly price into the availability quote', async () => {
    repository.findRoomType.mockResolvedValue({
      id: 'room-type-1',
      maxGuests: 2,
      nightlyPrice: 5800,
    })
    repository.findInventoryForStay.mockResolvedValue([
      {
        stayDate: '2026-08-10',
        totalQuantity: 2,
        reservedQuantity: 0,
        blockedQuantity: 0,
      },
      {
        stayDate: '2026-08-11',
        totalQuantity: 2,
        reservedQuantity: 0,
        blockedQuantity: 0,
      },
    ])

    const database = {
      transaction: async (callback: (tx: object) => Promise<unknown>) =>
        callback({}),
    }

    const result = await getAvailability(database as never, {
      roomTypeId: 'room-type-1',
      checkInDate: '2026-08-10',
      checkOutDate: '2026-08-12',
      quantity: 1,
      guests: 2,
    })

    expect(result.price).toMatchObject({
      currency: 'TWD',
      nightlyPrice: 5800,
      subtotal: 11600,
      total: 11600,
    })
    expect(repository.findRoomType).toHaveBeenCalledWith({}, 'room-type-1')
  })
})
