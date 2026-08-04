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
  ReservationHold,
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
  const currentReservation = ref<ReservationHold | Reservation | null>(null)
  const reservationDetails = ref<ReservationDetails | null>(null)
  const isAvailabilityLoading = ref(false)
  const isLoading = ref(false)
  const isLookupLoading = ref(false)
  const errorCode = ref<string | null>(null)
  const errorDetails = ref<unknown>(undefined)
  const lookupErrorCode = ref<string | null>(null)
  const lookupErrorDetails = ref<unknown>(undefined)
  const idempotencyKey = ref<string | null>(null)
  const requestFingerprint = ref<string | null>(null)
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

  async function runAvailabilitySearch(
    inputs: ReservationSearchInput[],
  ): Promise<void> {
    availabilityController?.abort()
    const controller = new AbortController()
    availabilityController = controller
    const requestId = ++availabilityRequest
    isAvailabilityLoading.value = true
    errorCode.value = null
    errorDetails.value = undefined

    try {
      const results = await Promise.allSettled(
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
        const successfulResults = results
          .filter(
            (
              result,
            ): result is PromiseFulfilledResult<
              readonly [string, AvailabilityResponse]
            > => result.status === 'fulfilled',
          )
          .map((result) => result.value)
        availabilityByRoomTypeId.value = Object.fromEntries(successfulResults)

        const blockingError = results.find(
          (result) =>
            result.status === 'rejected' &&
            !(
              result.reason instanceof AppError &&
              result.reason.code === 'GUEST_LIMIT_EXCEEDED'
            ),
        )
        if (blockingError?.status === 'rejected')
          captureError(blockingError.reason)
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
    }
    try {
      const result = await api.reservations.createReservationHold(
        input,
        idempotencyKey.value ?? crypto.randomUUID(),
      )
      currentReservation.value = result
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
  ): Promise<ReservationDetails | null> {
    if (isLookupLoading.value) return null
    isLookupLoading.value = true
    lookupErrorCode.value = null
    lookupErrorDetails.value = undefined
    try {
      const result = await api.reservations.getReservation(id)
      reservationDetails.value = result
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

  const confirmReservation = (id: string) =>
    transition(id, (reservationId) =>
      api.reservations.confirmReservation(reservationId),
    )
  const cancelReservation = (id: string) =>
    transition(id, (reservationId) =>
      api.reservations.cancelReservation(reservationId),
    )
  const expireReservation = (id: string) =>
    transition(id, (reservationId) =>
      api.reservations.expireReservation(reservationId),
    )

  function clearReservation() {
    currentReservation.value = null
    reservationDetails.value = null
    errorCode.value = null
    errorDetails.value = undefined
    lookupErrorCode.value = null
    lookupErrorDetails.value = undefined
    idempotencyKey.value = null
    requestFingerprint.value = null
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
    errorCode,
    errorDetails,
    lookupErrorCode,
    lookupErrorDetails,
    setSearch,
    searchAvailability,
    searchAvailabilityForRooms,
    clearAvailability,
    cancelAvailability,
    createHold,
    confirmReservation,
    cancelReservation,
    expireReservation,
    getReservation,
    clearReservation,
  }
}

export const useReservationStore = defineStore('reservation', () =>
  createReservationStore(useApiModules()),
)
