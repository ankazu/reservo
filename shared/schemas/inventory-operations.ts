import { z } from 'zod'

import { MAX_STAY_NIGHTS } from '../constants/reservation-policy'
import { getNightCount } from '../types/reservation'

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`)
    return (
      !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value)
    )
  })

export const inventoryOperationsQuerySchema = z
  .object({
    roomTypeId: z.string().uuid(),
    checkInDate: isoDate,
    checkOutDate: isoDate,
  })
  .superRefine((input, context) => {
    if (input.checkOutDate <= input.checkInDate) {
      context.addIssue({
        code: 'custom',
        path: ['checkOutDate'],
        message: 'check_out_must_be_after_check_in',
      })
      return
    }
    if (getNightCount(input) > MAX_STAY_NIGHTS) {
      context.addIssue({
        code: 'custom',
        path: ['checkOutDate'],
        message: 'date_range_too_long',
      })
    }
  })

export const setBlockedInventorySchema = z.object({
  roomTypeId: z.string().uuid(),
  stayDate: isoDate,
  blockedQuantity: z.number().int().nonnegative().max(10_000),
})
