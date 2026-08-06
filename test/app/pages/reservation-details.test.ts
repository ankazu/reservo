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
  isLoading: false,
  errorCode: null as string | null,
  getReservation: vi.fn(),
  cancelReservation: vi.fn(),
})

vi.mock('vue-router', () => ({
  useRoute: () => route,
}))

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
        'reservation.cancel': 'Cancel hold',
        'reservation.lookup.loading': 'Looking up…',
        'reservation.lookup.dates': 'Stay dates',
        'reservation.lookup.dateRange': `${values?.checkIn} → ${values?.checkOut}`,
        'reservation.lookup.total': 'Total',
        'reservation.status.CONFIRMED': 'Reservation confirmed',
        'reservation.status.EXPIRED': 'Hold expired',
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
  store.isLoading = false
  store.errorCode = null
  store.getReservation.mockReset()
  store.cancelReservation.mockReset()
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

describe('reservation details page', () => {
  it('loads a secure link and renders the complete reservation summary', async () => {
    store.getReservation.mockImplementation(async () => {
      store.reservationDetails = details
      return details
    })

    const wrapper = mount(ReservationDetailsPage, {
      global: { stubs: { NuxtLink: { template: '<a><slot /></a>' } } },
    })
    await flushPromises()

    expect(store.getReservation).toHaveBeenCalledWith(
      'reservation-1',
      'secure-token',
    )
    expect(wrapper.text()).toContain('Taylor Guest')
    expect(wrapper.text()).toContain('Garden room')
    expect(wrapper.text()).toContain('Reservation confirmed')
    expect(wrapper.text()).toContain('NT$8,400')
    expect(wrapper.get('[data-test="cancel-reservation"]').exists()).toBe(true)
  })

  it('does not look up without an access token and renders terminal states without cancel', async () => {
    window.location.hash = ''
    const wrapper = mount(ReservationDetailsPage, {
      global: { stubs: { NuxtLink: { template: '<a><slot /></a>' } } },
    })
    await flushPromises()

    expect(store.getReservation).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Not found')

    store.reservationDetails = { ...details, status: 'EXPIRED' }
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('Hold expired')
    expect(wrapper.find('[data-test="cancel-reservation"]').exists()).toBe(
      false,
    )
  })
})
