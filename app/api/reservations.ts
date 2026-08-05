import type { ApiResponse } from '~~/shared/types/api'
import { API_ENDPOINTS } from '~~/shared/constants/api'
import { getReservationRequestFingerprint } from '~~/shared/utils/reservation-request'
import type {
  CreateReservationHoldInput,
  Reservation,
  ReservationDetails,
  ReservationCreationResponse,
} from '~~/shared/types/reservation'
import { AppError } from './errors'
import type { ApiClient, RequestOptions } from './client'

async function unwrap<T>(request: Promise<ApiResponse<T>>): Promise<T> {
  const response = await request
  if (!response.success)
    throw new AppError(response.error.code, response.error.details)
  return response.data
}

export function createReservationsApi(client: ApiClient) {
  return {
    getReservation(
      id: string,
      accessToken: string,
      options?: RequestOptions,
    ): Promise<ReservationDetails> {
      return unwrap(
        client.get<ApiResponse<ReservationDetails>>(
          API_ENDPOINTS.reservation(id),
          {
            ...options,
            headers: {
              ...options?.headers,
              Authorization: `Bearer ${accessToken}`,
            },
          },
        ),
      )
    },
    createReservationHold(
      input: CreateReservationHoldInput,
      idempotencyKey: string,
      options?: RequestOptions,
    ): Promise<ReservationCreationResponse> {
      return unwrap(
        client.post<ApiResponse<ReservationCreationResponse>>(
          API_ENDPOINTS.reservations,
          input,
          {
            ...options,
            headers: {
              ...options?.headers,
              'Idempotency-Key': idempotencyKey,
              'X-Request-Fingerprint': getReservationRequestFingerprint(input),
            },
          },
        ),
      )
    },
    cancelReservation(
      id: string,
      accessToken: string,
      options?: RequestOptions,
    ): Promise<Reservation> {
      return unwrap(
        client.post<ApiResponse<Reservation>>(
          API_ENDPOINTS.cancelReservation(id),
          {},
          {
            ...options,
            headers: {
              ...options?.headers,
              Authorization: `Bearer ${accessToken}`,
            },
          },
        ),
      )
    },
  }
}
