// @vitest-environment happy-dom

import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { computed, onMounted, reactive, ref } from 'vue'
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

const route = { params: { reservationId: 'reservation-1' } }
const store = reactive({
  reservationDetails: null as Record<string, unknown> | null,
  lookupErrorCode: null as string | null,
  isLookupLoading: false,
  getReservation: vi.fn(),
})

vi.mock('vue-router', () => ({ useRoute: () => route }))
vi.mock('../../../app/api/errors', () => ({ AppError: class AppError {} }))

let ReservationDetailsPage: typeof import('../../../app/pages/reservations/[reservationId].vue').default

enableAutoUnmount(afterEach)

beforeAll(async () => {
  vi.stubGlobal('useRoute', () => route)
  vi.stubGlobal('useI18n', () => ({
    locale: ref('en'),
    t: (key: string, values?: Record<string, unknown>) => {
      const messages: Record<string, string> = {
        'reservation.details.title': 'Reservation details',
        'reservation.details.eyebrow': 'Your stay',
        'reservation.details.back': 'Back to home',
        'reservation.details.accessRequired': 'Use your secure link.',
        'reservation.details.guests': 'Guests',
        'reservation.details.nights': 'Nights',
        'reservation.details.items': 'Room details',
        'reservation.details.quantity': `${values?.count ?? ''} room(s)`,
        'reservation.details.subtotal': 'Subtotal',
        'reservation.details.taxes': 'Taxes',
        'reservation.details.discounts': 'Discounts',
        'reservation.name': 'Name',
        'reservation.email': 'Email',
        'reservation.idLabel': 'Reservation ID:',
        'reservation.lookup.loading': 'Looking up…',
        'reservation.lookup.dates': 'Stay dates',
        'reservation.lookup.dateRange': `${values?.checkIn} → ${values?.checkOut}`,
        'reservation.lookup.total': 'Total',
        'reservation.status.CONFIRMED': 'Reservation confirmed',
        'reservation.status.EXPIRED': 'Hold expired',
        'reservation.status.CANCELLED': 'Reservation cancelled',
        'errors.RESERVATION_NOT_FOUND': 'Not found',
        'errors.UNKNOWN': 'Unknown error',
      }
      return messages[key] ?? key
    },
  }))
  vi.stubGlobal('useReservationStore', () => store)
  vi.stubGlobal('computed', computed)
  vi.stubGlobal('onMounted', onMounted)
  ReservationDetailsPage = (
    await import('../../../app/pages/reservations/[reservationId].vue')
  ).default
})

beforeEach(() => {
  route.params.reservationId = 'reservation-1'
  window.location.hash = '#accessToken=secure-token'
  store.reservationDetails = null
  store.lookupErrorCode = null
  store.isLookupLoading = false
  store.getReservation.mockReset()
})

const details = {
  id: 'reservation-1',
  propertyId: 'property-1',
  status: 'CONFIRMED',
  guestName: 'Taylor Guest',
  guestEmail: 'taylor@example.com',
  guestCount: 2,
  checkInDate: '2026-08-10',
  checkOutDate: '2026-08-12',
  nights: 2,
  cancellableUntil: '2026-08-10T00:00:00+08:00',
  expiresAt: null,
  price: {
    currency: 'TWD',
    subtotal: 8400,
    taxes: 0,
    discounts: 0,
    total: 8400,
  },
  items: [
    {
      id: 'item-1',
      reservationId: 'reservation-1',
      roomTypeId: 'room-1',
      roomTypeNameSnapshot: 'Garden room',
      ratePlanNameSnapshot: 'Standard',
      nightlyPrice: 4200,
      taxes: 0,
      discounts: 0,
      quantity: 1,
    },
  ],
}

function mountPage() {
  return mount(ReservationDetailsPage, {
    global: { stubs: { NuxtLink: { template: '<a><slot /></a>' } } },
  })
}

function mockLookup(result: Record<string, unknown>) {
  store.getReservation.mockImplementation(async () => {
    store.isLookupLoading = true
    await Promise.resolve()
    store.reservationDetails = result
    store.isLookupLoading = false
    return result
  })
}

describe('reservation details page', () => {
  it('loads a secure link and renders the complete reservation summary', async () => {
    mockLookup(details)
    const wrapper = mountPage()
    await flushPromises()

    expect(store.getReservation).toHaveBeenCalledWith(
      'reservation-1',
      'secure-token',
    )
    expect(wrapper.text()).toContain('Taylor Guest')
    expect(wrapper.text()).toContain('Garden room')
    expect(wrapper.text()).toContain('Reservation confirmed')
    expect(wrapper.text()).toContain('NT$8,400')
    expect(wrapper.find('[data-test="cancel-reservation"]').exists()).toBe(
      false,
    )
  })

  it('renders loading while the secure-link API request is pending', async () => {
    let resolveLookup: ((value: typeof details) => void) | undefined
    store.getReservation.mockImplementation(() => {
      store.isLookupLoading = true
      return new Promise<typeof details>((resolve) => {
        resolveLookup = resolve
      }).finally(() => {
        store.isLookupLoading = false
      })
    })

    const wrapper = mountPage()
    await wrapper.vm.$nextTick()
    expect(wrapper.get('[role="status"]').text()).toBe('Looking up…')

    store.reservationDetails = details
    resolveLookup?.(details)
    await flushPromises()
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
  })

  it('renders the safe not-found state when the access token is unauthorized', async () => {
    store.getReservation.mockImplementation(async () => {
      store.lookupErrorCode = 'RESERVATION_NOT_FOUND'
      return null
    })
    const wrapper = mountPage()
    await flushPromises()

    expect(store.getReservation).toHaveBeenCalledWith(
      'reservation-1',
      'secure-token',
    )
    expect(wrapper.get('[role="alert"]').text()).toContain('Not found')
    expect(wrapper.text()).not.toContain('Taylor Guest')
  })

  it('renders an API error returned by the secure-link lookup', async () => {
    store.getReservation.mockImplementation(async () => {
      store.lookupErrorCode = 'UNKNOWN'
      return null
    })
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toContain('Unknown error')
  })

  it.each([
    ['EXPIRED', 'Hold expired'],
    ['CANCELLED', 'Reservation cancelled'],
  ])(
    'loads and renders the %s terminal state through the secure link',
    async (status, message) => {
      mockLookup({ ...details, status })
      const wrapper = mountPage()
      await flushPromises()

      expect(store.getReservation).toHaveBeenCalledWith(
        'reservation-1',
        'secure-token',
      )
      expect(wrapper.text()).toContain(message)
      expect(wrapper.text()).toContain('Taylor Guest')
    },
  )

  it('does not call the API without an access token', async () => {
    window.location.hash = ''
    const wrapper = mountPage()
    await flushPromises()

    expect(store.getReservation).not.toHaveBeenCalled()
    expect(wrapper.get('[role="alert"]').text()).toContain('Not found')
  })
})
