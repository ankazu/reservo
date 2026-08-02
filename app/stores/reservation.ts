import type { ApiResponse } from '../../shared/types/api'
import type { DateRange, ReservationHold } from '../../shared/types/reservation'

type SearchState = DateRange & {
  roomTypeId: string | null
  guests: number
}

type CreateHoldInput = DateRange & {
  propertyId: string
  roomTypeId: string
  quantity: number
  guestName: string
  guestEmail: string
  ratePlanName: string
  nightlyPrice: number
  taxes?: number
  discounts?: number
}

export const useReservationStore = defineStore('reservation', () => {
  const search = ref<SearchState>({
    checkInDate: '',
    checkOutDate: '',
    roomTypeId: null,
    guests: 2,
  })
  const currentReservation = ref<ReservationHold | null>(null)
  const isLoading = ref(false)
  const errorCode = ref<string | null>(null)

  function setSearch(values: Partial<SearchState>) {
    search.value = { ...search.value, ...values }
  }

  async function createHold(input: CreateHoldInput) {
    isLoading.value = true
    errorCode.value = null

    try {
      const response = await $fetch<ApiResponse<ReservationHold>>(
        '/api/reservations',
        {
          method: 'POST',
          headers: { 'Idempotency-Key': crypto.randomUUID() },
          body: input,
        },
      )
      if (!response.success) {
        errorCode.value = response.error.code
        return null
      }
      currentReservation.value = response.data
      return response.data
    } finally {
      isLoading.value = false
    }
  }

  function clearReservation() {
    currentReservation.value = null
    errorCode.value = null
  }

  return {
    search,
    currentReservation,
    isLoading,
    errorCode,
    setSearch,
    createHold,
    clearReservation,
  }
})
