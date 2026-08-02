export const API_ENDPOINTS = {
  availability: '/api/availability',
  reservations: '/api/reservations',
  confirmReservation: (id: string) => `/api/reservations/${id}/confirm`,
  cancelReservation: (id: string) => `/api/reservations/${id}/cancel`,
  expireReservation: (id: string) => `/api/reservations/${id}/expire`,
} as const
