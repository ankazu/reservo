import { defineEventHandler, getHeader, readBody, setResponseStatus } from 'h3'

import { setBlockedInventorySchema } from '../../../shared/schemas/inventory-operations'
import type { ApiResponse } from '../../../shared/types/api'
import {
  InventoryOperationError,
  setBlockedInventory,
} from '../../services/inventory-operations'
import { db } from '../../utils/db'
import { isMaintenanceSecretValid } from '../../utils/maintenance-auth'

export default defineEventHandler(
  async (event): Promise<ApiResponse<unknown>> => {
    if (
      !isMaintenanceSecretValid(
        getHeader(event, 'x-maintenance-secret'),
        process.env.RESERVATION_MAINTENANCE_SECRET,
      )
    ) {
      setResponseStatus(event, 401)
      return {
        success: false,
        error: {
          code: 'MAINTENANCE_UNAUTHORIZED',
          message: 'MAINTENANCE_UNAUTHORIZED',
        },
      }
    }

    const parsed = setBlockedInventorySchema.safeParse(await readBody(event))
    if (!parsed.success) {
      setResponseStatus(event, 400)
      return {
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'INVALID_REQUEST',
          details: parsed.error.flatten(),
        },
      }
    }
    if (!db) {
      setResponseStatus(event, 503)
      return {
        success: false,
        error: {
          code: 'DATABASE_UNAVAILABLE',
          message: 'DATABASE_UNAVAILABLE',
        },
      }
    }

    try {
      return {
        success: true,
        data: await setBlockedInventory(db, parsed.data),
      }
    } catch (error) {
      if (error instanceof InventoryOperationError) {
        const status =
          error.code === 'BLOCKED_QUANTITY_EXCEEDS_CAPACITY' ? 409 : 404
        setResponseStatus(event, status)
        return {
          success: false,
          error: { code: error.code, message: error.code },
        }
      }
      setResponseStatus(event, 500)
      return {
        success: false,
        error: {
          code: 'INVENTORY_OPERATION_FAILED',
          message: 'INVENTORY_OPERATION_FAILED',
        },
      }
    }
  },
)
