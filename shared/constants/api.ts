export const API_ENDPOINTS = {
  availability: '/api/availability',
  reservations: '/api/reservations',
  reservation: (id: string) => `/api/reservations/${id}`,
  cancelReservation: (id: string) => `/api/reservations/${id}/cancel`,
} as const
