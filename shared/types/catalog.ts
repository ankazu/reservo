export type PropertyCatalog = {
  id: string
  name: string
  timezone: string
  currency: string
}

export type RoomTypeCatalogItem = {
  id: string
  propertyId: string
  name: string
  description: string
  maxGuests: number
  nightlyPrice: number
}

export type Catalog = {
  property: PropertyCatalog
  roomTypes: RoomTypeCatalogItem[]
}
