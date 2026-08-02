import type { ApiClient } from '../api/client'
import { API_ENDPOINTS } from '~~/shared/constants/api'
import type { ReservationSearchInput } from '~~/shared/types/availability'
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
    async get<T>(path, options) {
      if (path !== API_ENDPOINTS.availability) {
        throw new Error(`Unknown mock GET endpoint: ${path}`)
      }
      return availability(
        options?.query as unknown as ReservationSearchInput,
      ) as Promise<T>
    },
    async post<T>(path, body, options) {
      if (path === API_ENDPOINTS.reservations) {
        return reservations.createHold(
          body as Parameters<typeof reservations.createHold>[0],
          options?.headers?.['Idempotency-Key'] ?? '',
        ) as Promise<T>
      }
      return reservations.transition(path) as Promise<T>
    },
  }
}
