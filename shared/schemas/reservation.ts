import { z } from 'zod'

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'invalid_date_format')
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`)
    return (
      !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value)
    )
  }, 'invalid_date')

export const reservationSearchSchema = z
  .object({
    roomTypeId: z.string().uuid(),
    checkInDate: isoDate,
    checkOutDate: isoDate,
    quantity: z.number().int().positive().max(10).default(1),
    guests: z.number().int().positive().max(10).default(1),
  })
  .refine((input) => input.checkOutDate > input.checkInDate, {
    path: ['checkOutDate'],
    message: 'check_out_must_be_after_check_in',
  })

export const createReservationSchema = z
  .object({
    propertyId: z.string().uuid(),
    roomTypeId: z.string().uuid(),
    checkInDate: isoDate,
    checkOutDate: isoDate,
    quantity: z.number().int().positive().max(10).default(1),
    guests: z.number().int().positive().max(10).default(1),
    guestName: z.string().trim().min(1).max(120),
    guestEmail: z.email(),
    ratePlanName: z.literal('Standard').default('Standard'),
  })
  .refine((input) => input.checkOutDate > input.checkInDate, {
    path: ['checkOutDate'],
    message: 'check_out_must_be_after_check_in',
  })
