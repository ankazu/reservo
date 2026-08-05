import type { ApiClient, RequestOptions } from '../api/client'
import { API_ENDPOINTS } from '~~/shared/constants/api'
import type { ReservationSearchInput } from '~~/shared/types/availability'
import type { ReservationStatus } from '~~/shared/types/reservation'
import { createAvailabilityMock } from './availability'
import { createReservationsMock } from './reservations'

export type MockScenario =
  | 'success'
  | 'insufficient-inventory'
  | 'invalid-request'
  | 'server-error'
  | 'expired-reservation'

export function createMockApiClient(
  scenario: MockScenario = 'success',
): ApiClient {
  const availability = createAvailabilityMock(scenario)
  const reservations = createReservationsMock(scenario)

  return {
    async get<T>(path: string, options?: RequestOptions) {
      if (path !== API_ENDPOINTS.availability) {
        throw new Error(`Unknown mock GET endpoint: ${path}`)
      }
      return availability(
        options?.query as unknown as ReservationSearchInput,
      ) as Promise<T>
    },
    async post<T>(path: string, body: unknown, options?: RequestOptions) {
      if (path === API_ENDPOINTS.reservations) {
        return reservations.createHold(
          body as Parameters<typeof reservations.createHold>[0],
          options?.headers?.['Idempotency-Key'] ?? '',
        ) as Promise<T>
      }
      const statusByEndpoint: Record<string, ReservationStatus> = {
        [API_ENDPOINTS.confirmReservation('mock-1')]: 'CONFIRMED',
        [API_ENDPOINTS.cancelReservation('mock-1')]: 'CANCELLED',
        [API_ENDPOINTS.expireReservation('mock-1')]: 'EXPIRED',
      }
      const endpoint = path.replace(/mock-[^/]+/, 'mock-1')
      const targetStatus = statusByEndpoint[endpoint]
      if (!targetStatus) throw new Error(`Unknown mock POST endpoint: ${path}`)
      return reservations.transitionTo(targetStatus) as Promise<T>
    },
  }
}
