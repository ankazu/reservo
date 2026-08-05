import { createAvailabilityApi } from './availability'
import { createCatalogApi } from './catalog'
import { useApiClient, type ApiClient } from './client'
import { createReservationsApi } from './reservations'

export function createApiModules(client: ApiClient) {
  return {
    availability: createAvailabilityApi(client),
    catalog: createCatalogApi(client),
    reservations: createReservationsApi(client),
  }
}

export function useApiModules() {
  return createApiModules(useApiClient())
}
