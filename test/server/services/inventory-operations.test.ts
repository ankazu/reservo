import { beforeEach, describe, expect, it, vi } from 'vitest'

const repository = vi.hoisted(() => ({
  findRoomType: vi.fn(),
  findInventoryForStay: vi.fn(),
  lockInventoryForStay: vi.fn(),
  provisionInventoryForStay: vi.fn(),
  setBlockedInventoryQuantity: vi.fn(),
}))

vi.mock('../../../server/repositories/reservation', () => repository)

import {
  InventoryOperationError,
  inspectDailyInventory,
  setBlockedInventory,
} from '../../../server/services/inventory-operations'

function createDatabase() {
  return {
    transaction: async (callback: (tx: object) => Promise<unknown>) =>
      callback({}),
  }
}

describe('inventory operations service', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    repository.findRoomType.mockResolvedValue({ id: 'room-type-1' })
  })

  it('reports reserved, blocked, and available quantities for each date', async () => {
    repository.findInventoryForStay.mockResolvedValue([
      {
        id: 'inventory-1',
        stayDate: '2026-08-10',
        totalQuantity: 5,
        reservedQuantity: 2,
        blockedQuantity: 1,
      },
      {
        id: 'inventory-2',
        stayDate: '2026-08-11',
        totalQuantity: 5,
        reservedQuantity: 1,
        blockedQuantity: 3,
      },
    ])

    await expect(
      inspectDailyInventory(createDatabase() as never, {
        roomTypeId: 'room-type-1',
        checkInDate: '2026-08-10',
        checkOutDate: '2026-08-12',
      }),
    ).resolves.toEqual([
      {
        stayDate: '2026-08-10',
        totalQuantity: 5,
        reservedQuantity: 2,
        blockedQuantity: 1,
        availableQuantity: 2,
      },
      {
        stayDate: '2026-08-11',
        totalQuantity: 5,
        reservedQuantity: 1,
        blockedQuantity: 3,
        availableQuantity: 1,
      },
    ])
    expect(repository.provisionInventoryForStay).toHaveBeenCalledWith(
      {},
      'room-type-1',
      ['2026-08-10', '2026-08-11'],
    )
  })

  it('sets an absolute blocked quantity while holding the inventory row lock', async () => {
    repository.lockInventoryForStay.mockResolvedValue([
      {
        id: 'inventory-1',
        stayDate: '2026-08-10',
        totalQuantity: 3,
        reservedQuantity: 1,
        blockedQuantity: 0,
      },
    ])
    repository.setBlockedInventoryQuantity.mockResolvedValue({
      id: 'inventory-1',
      stayDate: '2026-08-10',
      totalQuantity: 3,
      reservedQuantity: 1,
      blockedQuantity: 2,
    })

    await expect(
      setBlockedInventory(createDatabase() as never, {
        roomTypeId: 'room-type-1',
        stayDate: '2026-08-10',
        blockedQuantity: 2,
      }),
    ).resolves.toMatchObject({ blockedQuantity: 2, availableQuantity: 0 })
    expect(repository.setBlockedInventoryQuantity).toHaveBeenCalledWith(
      {},
      'inventory-1',
      2,
    )
  })

  it('rejects a blocked quantity that would consume reserved inventory', async () => {
    repository.lockInventoryForStay.mockResolvedValue([
      {
        id: 'inventory-1',
        stayDate: '2026-08-10',
        totalQuantity: 3,
        reservedQuantity: 2,
        blockedQuantity: 0,
      },
    ])

    await expect(
      setBlockedInventory(createDatabase() as never, {
        roomTypeId: 'room-type-1',
        stayDate: '2026-08-10',
        blockedQuantity: 2,
      }),
    ).rejects.toEqual(
      new InventoryOperationError('BLOCKED_QUANTITY_EXCEEDS_CAPACITY'),
    )
    expect(repository.setBlockedInventoryQuantity).not.toHaveBeenCalled()
  })
})
