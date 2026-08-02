import { getNightCount, getStayDates } from '../../../shared/types/reservation'
import { getAvailableQuantity } from './rules'
import {
  findRoomType,
  findInventoryForStay,
  provisionInventoryForStay,
} from '../../repositories/reservation'
import type { db } from '../../utils/db'

type Database = NonNullable<typeof db>

export async function getAvailability(
  database: Database,
  input: {
    roomTypeId: string
    checkInDate: string
    checkOutDate: string
    quantity: number
    guests: number
  },
) {
  const inventory = await database.transaction(async (tx) => {
    const roomType = await findRoomType(tx, input.roomTypeId)
    if (!roomType) throw new Error('ROOM_TYPE_NOT_FOUND')
    await provisionInventoryForStay(tx, input.roomTypeId, getStayDates(input))
    const rows = await findInventoryForStay(
      tx,
      input.roomTypeId,
      input.checkInDate,
      input.checkOutDate,
    )
    return { maxGuests: roomType.maxGuests, rows }
  })
  return summarizeAvailability(input, inventory.rows, inventory.maxGuests)
}

type InventoryRow = {
  stayDate: string
  totalQuantity: number
  reservedQuantity: number
  blockedQuantity: number
}

export function summarizeAvailability(
  input: {
    checkInDate: string
    checkOutDate: string
    quantity: number
    guests?: number
  },
  inventory: InventoryRow[],
  maxGuests = Number.POSITIVE_INFINITY,
) {
  const nights = getNightCount(input)
  const inventoryReady = inventory.length === nights
  const availableQuantity = inventoryReady
    ? Math.min(
        ...inventory.map((row) =>
          getAvailableQuantity(
            row.totalQuantity,
            row.reservedQuantity,
            row.blockedQuantity,
          ),
        ),
      )
    : 0

  return {
    checkInDate: input.checkInDate,
    checkOutDate: input.checkOutDate,
    nights,
    requestedQuantity: input.quantity,
    availableQuantity: Math.max(0, availableQuantity),
    available:
      inventoryReady &&
      availableQuantity >= input.quantity &&
      (input.guests ?? 1) <= maxGuests,
    inventoryReady,
  }
}
