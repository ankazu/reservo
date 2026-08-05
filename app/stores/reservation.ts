import { useApiModules } from '../api'
import { AppError, isAbortError } from '../api/errors'
import type {
  AvailabilityResponse,
  ReservationSearchInput,
} from '~~/shared/types/availability'
import { getReservationRequestFingerprint } from '~~/shared/utils/reservation-request'
import type {
  CreateReservationHoldInput,
  DateRange,
  Reservation,
  ReservationDetails,
  ReservationCreationResponse,
} from '~~/shared/types/reservation'

type SearchState = DateRange & {
  roomTypeId: string | null
  guests: number
}

export function createReservationStore(api: ReturnType<typeof useApiModules>) {
  const search = ref<SearchState>({
    checkInDate: '',
    checkOutDate: '',
    roomTypeId: null,
    guests: 2,
  })
  const availabilityByRoomTypeId = ref<Record<string, AvailabilityResponse>>({})
  const currentReservation = ref<
    ReservationCreationResponse | Reservation | null
  >(null)
  const reservationDetails = ref<ReservationDetails | null>(null)
  const isAvailabilityLoading = ref(false)
  const isLoading = ref(false)
  const isLookupLoading = ref(false)
  const availabilityErrorCode = ref<string | null>(null)
  const availabilityErrorDetails = ref<unknown>(undefined)
  const errorCode = ref<string | null>(null)
  const errorDetails = ref<unknown>(undefined)
  const lookupErrorCode = ref<string | null>(null)
  const lookupErrorDetails = ref<unknown>(undefined)
  const idempotencyKey = ref<string | null>(null)
  const requestFingerprint = ref<string | null>(null)
  const reservationAccessToken = ref<string | null>(null)
  const reservationAccessUrl = ref<string | null>(null)
  let availabilityController: AbortController | null = null
  let availabilityRequest = 0

  function setSearch(values: Partial<SearchState>) {
    search.value = { ...search.value, ...values }
  }

  function captureError(error: unknown) {
    if (isAbortError(error)) return
    if (error instanceof AppError) {
      errorCode.value = error.code
      errorDetails.value = error.details
      return
    }
    errorCode.value = 'UNKNOWN'
    errorDetails.value = undefined
  }

  function captureAvailabilityError(error: unknown) {
    if (isAbortError(error)) return
    if (error instanceof AppError) {
      availabilityErrorCode.value = error.code
      availabilityErrorDetails.value = error.details
      return
    }
    availabilityErrorCode.value = 'UNKNOWN'
    availabilityErrorDetails.value = undefined
  }

  async function runAvailabilitySearch(
    inputs: ReservationSearchInput[],
  ): Promise<void> {
    availabilityController?.abort()
    const controller = new AbortController()
    availabilityController = controller
    const requestId = ++availabilityRequest
    isAvailabilityLoading.value = true
    availabilityErrorCode.value = null
    availabilityErrorDetails.value = undefined

    try {
      const results = await Promise.all(
        inputs.map(
          async (input) =>
            [
              input.roomTypeId,
              await api.availability.getAvailability(input, {
                signal: controller.signal,
              }),
            ] as const,
        ),
      )
      if (requestId === availabilityRequest && !controller.signal.aborted) {
        availabilityByRoomTypeId.value = Object.fromEntries(results)
      }
    } catch (error) {
      if (!isAbortError(error) && requestId === availabilityRequest) {
        availabilityByRoomTypeId.value = {}
        captureAvailabilityError(error)
      }
    } finally {
      if (requestId === availabilityRequest) isAvailabilityLoading.value = false
    }
  }

  async function searchAvailability(
    input: ReservationSearchInput,
  ): Promise<void> {
    await runAvailabilitySearch([input])
  }

  async function searchAvailabilityForRooms(
    inputs: ReservationSearchInput[],
  ): Promise<void> {
    await runAvailabilitySearch(inputs)
  }

  function clearAvailability() {
    availabilityByRoomTypeId.value = {}
    availabilityController?.abort()
    availabilityController = null
    availabilityRequest += 1
    isAvailabilityLoading.value = false
    availabilityErrorCode.value = null
    availabilityErrorDetails.value = undefined
  }

  function cancelAvailability() {
    availabilityController?.abort()
    availabilityController = null
  }

  async function createHold(input: CreateReservationHoldInput) {
    if (isLoading.value) return null
    currentReservation.value = null
    isLoading.value = true
    errorCode.value = null
    errorDetails.value = undefined
    const fingerprint = getReservationRequestFingerprint(input)
    if (requestFingerprint.value !== fingerprint) {
      requestFingerprint.value = fingerprint
      idempotencyKey.value = crypto.randomUUID()
      reservationAccessToken.value = null
      reservationAccessUrl.value = null
    }
    try {
      const result = await api.reservations.createReservationHold(
        input,
        idempotencyKey.value ?? crypto.randomUUID(),
      )
      currentReservation.value = result
      if (result.accessToken) reservationAccessToken.value = result.accessToken
      if (result.accessUrl) reservationAccessUrl.value = result.accessUrl
      return result
    } catch (error) {
      captureError(error)
      return null
    } finally {
      isLoading.value = false
    }
  }

  async function transition(
    id: string,
    action: (id: string) => Promise<Reservation>,
  ): Promise<Reservation | null> {
    if (isLoading.value) return null
    isLoading.value = true
    errorCode.value = null
    errorDetails.value = undefined
    try {
      const result = await action(id)
      currentReservation.value = result
      if (reservationDetails.value?.id === result.id) {
        reservationDetails.value = {
          ...reservationDetails.value,
          status: result.status,
        }
      }
      return result
    } catch (error) {
      captureError(error)
      return null
    } finally {
      isLoading.value = false
    }
  }

  async function getReservation(
    id: string,
    accessToken: string,
  ): Promise<ReservationDetails | null> {
    if (isLookupLoading.value) return null
    isLookupLoading.value = true
    lookupErrorCode.value = null
    lookupErrorDetails.value = undefined
    try {
      const result = await api.reservations.getReservation(id, accessToken)
      reservationDetails.value = result
      reservationAccessToken.value = accessToken
      return result
    } catch (error) {
      reservationDetails.value = null
      if (error instanceof AppError) {
        lookupErrorCode.value = error.code
        lookupErrorDetails.value = error.details
      } else if (!isAbortError(error)) {
        lookupErrorCode.value = 'UNKNOWN'
        lookupErrorDetails.value = undefined
      }
      return null
    } finally {
      isLookupLoading.value = false
    }
  }

  const cancelReservation = (id: string, accessToken?: string) => {
    const token = accessToken ?? reservationAccessToken.value
    if (!token) {
      errorCode.value = 'RESERVATION_NOT_FOUND'
      return Promise.resolve(null)
    }
    return transition(id, (reservationId) =>
      api.reservations.cancelReservation(reservationId, token),
    )
  }

  function clearReservation() {
    currentReservation.value = null
    reservationDetails.value = null
    errorCode.value = null
    errorDetails.value = undefined
    lookupErrorCode.value = null
    lookupErrorDetails.value = undefined
    idempotencyKey.value = null
    requestFingerprint.value = null
    reservationAccessToken.value = null
    reservationAccessUrl.value = null
  }

  onScopeDispose(cancelAvailability)

  return {
    search,
    availabilityByRoomTypeId,
    currentReservation,
    reservationDetails,
    isAvailabilityLoading,
    isLoading,
    isLookupLoading,
    availabilityErrorCode,
    availabilityErrorDetails,
    errorCode,
    errorDetails,
    lookupErrorCode,
    lookupErrorDetails,
    reservationAccessToken,
    reservationAccessUrl,
    setSearch,
    searchAvailability,
    searchAvailabilityForRooms,
    clearAvailability,
    cancelAvailability,
    createHold,
    cancelReservation,
    getReservation,
    clearReservation,
  }
}

export const useReservationStore = defineStore('reservation', () =>
  createReservationStore(useApiModules()),
)
