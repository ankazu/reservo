import { defineEventHandler, getHeader, getQuery, setResponseStatus } from 'h3'

import { inventoryOperationsQuerySchema } from '../../../shared/schemas/inventory-operations'
import type { ApiResponse } from '../../../shared/types/api'
import {
  inspectDailyInventory,
  InventoryOperationError,
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

    const parsed = inventoryOperationsQuerySchema.safeParse(getQuery(event))
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
        data: await inspectDailyInventory(db, parsed.data),
      }
    } catch (error) {
      if (
        error instanceof InventoryOperationError &&
        error.code === 'ROOM_TYPE_NOT_FOUND'
      ) {
        setResponseStatus(event, 404)
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
