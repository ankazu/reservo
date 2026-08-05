import { z } from 'zod'

import {
  BOOKING_WINDOW_DAYS,
  MAX_STAY_NIGHTS,
  MVP_TIME_ZONE,
} from '../constants/reservation-policy'
import { getNightCount } from '../types/reservation'

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'invalid_date_format')
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`)
    return (
      !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value)
    )
  }, 'invalid_date')

export const reservationIdSchema = z.string().uuid()

const reservationSearchObject = z.object({
  roomTypeId: z.string().uuid(),
  checkInDate: isoDate,
  checkOutDate: isoDate,
  quantity: z.number().int().positive().max(10).default(1),
  guests: z.number().int().positive().max(10).default(1),
})

const createReservationObject = z.object({
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

export function getTodayInTimeZone(
  now = new Date(),
  timeZone = MVP_TIME_ZONE,
): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

function addCalendarDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function applyDatePolicy<
  T extends z.ZodType<{ checkInDate: string; checkOutDate: string }>,
>(schema: T, today: string) {
  return schema.superRefine((input, context) => {
    if (input.checkOutDate <= input.checkInDate) {
      context.addIssue({
        code: 'custom',
        path: ['checkOutDate'],
        message: 'check_out_must_be_after_check_in',
      })
      return
    }
    if (input.checkInDate < today) {
      context.addIssue({
        code: 'custom',
        path: ['checkInDate'],
        message: 'check_in_must_not_be_in_the_past',
      })
    }
    if (input.checkInDate > addCalendarDays(today, BOOKING_WINDOW_DAYS)) {
      context.addIssue({
        code: 'custom',
        path: ['checkInDate'],
        message: 'check_in_outside_booking_window',
      })
    }
    const nights = getNightCount(input)
    // Public requests contain one room type, so this also caps inventory
    // expansion at 30 rows.
    if (nights > MAX_STAY_NIGHTS) {
      context.addIssue({
        code: 'custom',
        path: ['checkOutDate'],
        message: 'stay_too_long',
      })
    }
  })
}

export function createReservationSearchPolicySchema(
  today = getTodayInTimeZone(),
) {
  return applyDatePolicy(reservationSearchObject, today)
}

export function createReservationPolicySchema(today = getTodayInTimeZone()) {
  return applyDatePolicy(createReservationObject, today)
}

export const reservationSearchSchema = createReservationSearchPolicySchema()
export const createReservationSchema = createReservationPolicySchema()
