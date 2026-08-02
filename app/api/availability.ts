import type { ApiResponse } from '~~/shared/types/api'
import { API_ENDPOINTS } from '~~/shared/constants/api'
import type {
  AvailabilityResponse,
  ReservationSearchInput,
} from '~~/shared/types/availability'
import { AppError } from './errors'
import type { ApiClient, RequestOptions } from './client'

export function createAvailabilityApi(client: ApiClient) {
  return {
    async getAvailability(
      input: ReservationSearchInput,
      options?: RequestOptions,
    ): Promise<AvailabilityResponse> {
      const response = await client.get<ApiResponse<AvailabilityResponse>>(
        API_ENDPOINTS.availability,
        { ...options, query: input },
      )
      if (!response.success) {
        throw new AppError(response.error.code, response.error.details)
      }
      return response.data
    },
  }
}
