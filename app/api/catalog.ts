import { API_ENDPOINTS } from '~~/shared/constants/api'
import type { ApiResponse } from '~~/shared/types/api'
import type {
  Catalog,
  PropertyCatalog,
  RoomTypeCatalogItem,
} from '~~/shared/types/catalog'
import type { ApiClient } from './client'
import { AppError } from './errors'

function unwrap<T>(response: ApiResponse<T>): T {
  if (!response.success) {
    throw new AppError(response.error.code, response.error.details)
  }
  return response.data
}

export function createCatalogApi(client: ApiClient) {
  return {
    async getCatalog(): Promise<Catalog> {
      const [propertyResponse, roomTypesResponse] = await Promise.all([
        client.get<ApiResponse<PropertyCatalog>>(API_ENDPOINTS.property),
        client.get<ApiResponse<RoomTypeCatalogItem[]>>(API_ENDPOINTS.roomTypes),
      ])
      return {
        property: unwrap(propertyResponse),
        roomTypes: unwrap(roomTypesResponse),
      }
    },
  }
}
