export const API_ENDPOINTS = {
  property: '/api/property',
  roomTypes: '/api/room-types',
  availability: '/api/availability',
  reservations: '/api/reservations',
  reservation: (id: string) => `/api/reservations/${id}`,
  cancelReservation: (id: string) => `/api/reservations/${id}/cancel`,
} as const
