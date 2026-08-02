import { createAvailabilityApi } from './availability'
import { useApiClient, type ApiClient } from './client'
import { createReservationsApi } from './reservations'

export function createApiModules(client: ApiClient) {
  return {
    availability: createAvailabilityApi(client),
    reservations: createReservationsApi(client),
  }
}

export function useApiModules() {
  return createApiModules(useApiClient())
}
