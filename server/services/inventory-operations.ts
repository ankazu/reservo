import { getStayDates } from '../../shared/types/reservation'
import {
  findInventoryForStay,
  findRoomType,
  lockInventoryForStay,
  provisionInventoryForStay,
  setBlockedInventoryQuantity,
} from '../repositories/reservation'
import type { db } from '../utils/db'
import { getAvailableQuantity } from './reservation/rules'

type Database = NonNullable<typeof db>

type InventoryOperationRow = {
  stayDate: string
  totalQuantity: number
  reservedQuantity: number
  blockedQuantity: number
}

export class InventoryOperationError extends Error {
  constructor(
    readonly code:
      | 'ROOM_TYPE_NOT_FOUND'
      | 'INVENTORY_NOT_FOUND'
      | 'BLOCKED_QUANTITY_EXCEEDS_CAPACITY',
  ) {
    super(code)
  }
}

function toOperationRow(row: InventoryOperationRow) {
  return {
    stayDate: row.stayDate,
    totalQuantity: row.totalQuantity,
    reservedQuantity: row.reservedQuantity,
    blockedQuantity: row.blockedQuantity,
    availableQuantity: getAvailableQuantity(
      row.totalQuantity,
      row.reservedQuantity,
      row.blockedQuantity,
    ),
  }
}

function nextDate(stayDate: string) {
  const date = new Date(`${stayDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

export async function inspectDailyInventory(
  database: Database,
  input: {
    roomTypeId: string
    checkInDate: string
    checkOutDate: string
  },
) {
  return database.transaction(async (tx) => {
    if (!(await findRoomType(tx, input.roomTypeId))) {
      throw new InventoryOperationError('ROOM_TYPE_NOT_FOUND')
    }
    await provisionInventoryForStay(tx, input.roomTypeId, getStayDates(input))
    const rows = await findInventoryForStay(
      tx,
      input.roomTypeId,
      input.checkInDate,
      input.checkOutDate,
    )
    return rows.map(toOperationRow)
  })
}

export async function setBlockedInventory(
  database: Database,
  input: {
    roomTypeId: string
    stayDate: string
    blockedQuantity: number
  },
) {
  return database.transaction(async (tx) => {
    if (!(await findRoomType(tx, input.roomTypeId))) {
      throw new InventoryOperationError('ROOM_TYPE_NOT_FOUND')
    }
    await provisionInventoryForStay(tx, input.roomTypeId, [input.stayDate])
    const [row] = await lockInventoryForStay(
      tx,
      input.roomTypeId,
      input.stayDate,
      nextDate(input.stayDate),
    )
    if (!row) throw new InventoryOperationError('INVENTORY_NOT_FOUND')
    if (input.blockedQuantity > row.totalQuantity - row.reservedQuantity) {
      throw new InventoryOperationError('BLOCKED_QUANTITY_EXCEEDS_CAPACITY')
    }

    const updated = await setBlockedInventoryQuantity(
      tx,
      row.id,
      input.blockedQuantity,
    )
    if (!updated) {
      throw new InventoryOperationError('BLOCKED_QUANTITY_EXCEEDS_CAPACITY')
    }
    return toOperationRow(updated)
  })
}
