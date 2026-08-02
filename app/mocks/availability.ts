import type { ApiResponse } from '~~/shared/types/api'
import type {
  AvailabilityResponse,
  ReservationSearchInput,
} from '~~/shared/types/availability'
import type { MockScenario } from './scenario'
import { getNightCount } from '~~/shared/types/reservation'
import { calculatePriceQuote } from '~~/shared/utils/pricing'

export function createAvailabilityMock(scenario: MockScenario) {
  return async function getAvailability(
    input: ReservationSearchInput,
  ): Promise<ApiResponse<AvailabilityResponse>> {
    if (scenario === 'invalid-request') {
      return {
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'INVALID_REQUEST' },
      }
    }
    if (scenario === 'server-error') {
      return {
        success: false,
        error: { code: 'AVAILABILITY_FAILED', message: 'AVAILABILITY_FAILED' },
      }
    }

    const available = scenario !== 'insufficient-inventory'
    const nightlyPrice = input.roomTypeId.endsWith('102')
      ? 5800
      : input.roomTypeId.endsWith('103')
        ? 8600
        : 4200
    return {
      success: true,
      data: {
        checkInDate: input.checkInDate,
        checkOutDate: input.checkOutDate,
        nights: getNightCount(input),
        requestedQuantity: input.quantity,
        availableQuantity: available ? 3 : 0,
        available,
        inventoryReady: true,
        price: calculatePriceQuote({
          nightlyPrice,
          nights: getNightCount(input),
          quantity: input.quantity,
        }),
      },
    }
  }
}
