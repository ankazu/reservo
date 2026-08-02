import { getNightCount } from '../../../shared/types/reservation'
import { getAvailableQuantity } from './rules'

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
  },
  inventory: InventoryRow[],
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
    available: inventoryReady && availableQuantity >= input.quantity,
    inventoryReady,
  }
}
