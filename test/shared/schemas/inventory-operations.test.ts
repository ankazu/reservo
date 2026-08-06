import { describe, expect, it } from 'vitest'

import { inventoryOperationsQuerySchema } from '../../../shared/schemas/inventory-operations'

const roomTypeId = '00000000-0000-4000-8000-000000000001'

describe('inventory operations schemas', () => {
  it('accepts a half-open range of exactly 30 stay dates', () => {
    expect(
      inventoryOperationsQuerySchema.safeParse({
        roomTypeId,
        checkInDate: '2026-08-01',
        checkOutDate: '2026-08-31',
      }).success,
    ).toBe(true)
  })

  it('rejects a range that expands beyond 30 stay dates', () => {
    expect(
      inventoryOperationsQuerySchema.safeParse({
        roomTypeId,
        checkInDate: '2026-08-01',
        checkOutDate: '2026-09-01',
      }).success,
    ).toBe(false)
  })
})
