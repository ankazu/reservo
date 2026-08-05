// @vitest-environment happy-dom

import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import {
  computed,
  defineComponent,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue'

import type { Component } from 'vue'

const searchInput = {
  checkInDate: '2026-08-10',
  checkOutDate: '2026-08-12',
  guests: 2,
}

let IndexPage: Component
let reservationStore: ReturnType<typeof createReservationStore>
const getCatalog = vi.hoisted(() => vi.fn())

vi.mock('../../../app/api', () => ({
  useApiModules: () => ({ catalog: { getCatalog } }),
}))

const catalog = {
  property: {
    id: 'dynamic-property',
    name: 'Dynamic Hotel',
    timezone: 'Asia/Taipei',
    currency: 'TWD',
  },
  roomTypes: [
    {
      id: 'dynamic-room-a',
      code: 'garden-room',
      propertyId: 'dynamic-property',
      name: 'Untranslated database garden',
      description: 'Untranslated database description',
      maxGuests: 2,
      nightlyPrice: 5800,
    },
    {
      id: 'dynamic-room-b',
      code: 'blank-space-suite',
      propertyId: 'dynamic-property',
      name: 'Dynamic Suite',
      description: 'Another catalog room',
      maxGuests: 4,
      nightlyPrice: 8800,
    },
  ],
}

enableAutoUnmount(afterEach)

function createReservationStore() {
  return reactive({
    availabilityByRoomTypeId: {},
    availabilityErrorCode: null as string | null,
    availabilityErrorDetails: null,
    isAvailabilityLoading: false,
    isLoading: false,
    isLookupLoading: false,
    currentReservation: null,
    reservationDetails: null,
    reservationAccessUrl: null,
    clearReservation: vi.fn(),
    clearAvailability: vi.fn(),
    cancelAvailability: vi.fn(),
    createHold: vi.fn(),
    cancelReservation: vi.fn(),
    getReservation: vi.fn(),
    searchAvailabilityForRooms: vi.fn(async () => {
      reservationStore.availabilityErrorCode = 'AVAILABILITY_FAILED'
      reservationStore.availabilityByRoomTypeId = {}
    }),
  })
}

beforeAll(async () => {
  vi.stubGlobal('computed', computed)
  vi.stubGlobal('onBeforeUnmount', onBeforeUnmount)
  vi.stubGlobal('onMounted', onMounted)
  vi.stubGlobal('watch', watch)
  vi.stubGlobal('useI18n', () => ({
    locale: ref('zh-TW'),
    setLocale: vi.fn(),
    t: (key: string) =>
      ({
        'roomTypes.garden-room.name': 'Translated Garden',
        'roomTypes.garden-room.description': 'Translated garden description',
        'roomTypes.blank-space-suite.name': 'Translated Suite',
        'roomTypes.blank-space-suite.description':
          'Translated suite description',
      })[key] ?? key,
  }))
  vi.stubGlobal('useReservationStore', () => reservationStore)
  IndexPage = (await import('../../../app/pages/index.vue')).default
})

beforeEach(() => {
  reservationStore = createReservationStore()
  getCatalog.mockReset()
  getCatalog.mockResolvedValue(catalog)
})

describe('availability results', () => {
  it('does not search an empty room list while the catalog is loading', async () => {
    let resolveCatalog!: (value: typeof catalog) => void
    getCatalog.mockReturnValue(
      new Promise((resolve) => {
        resolveCatalog = resolve
      }),
    )
    const AvailabilitySearchStub = defineComponent({
      emits: ['search'],
      template:
        '<button data-test="search" @click="$emit(\'search\', input)" />',
      setup() {
        return { input: searchInput }
      },
    })
    const wrapper = mount(IndexPage, {
      global: {
        components: { AvailabilitySearch: AvailabilitySearchStub },
      },
    })

    await wrapper.get('[data-test="search"]').trigger('click')
    await flushPromises()
    expect(reservationStore.searchAvailabilityForRooms).not.toHaveBeenCalled()

    resolveCatalog(catalog)
    await flushPromises()
    await wrapper.get('[data-test="search"]').trigger('click')
    await flushPromises()
    expect(reservationStore.searchAvailabilityForRooms).toHaveBeenCalledTimes(1)
  })

  it('searches every room type returned by the catalog API', async () => {
    const AvailabilitySearchStub = defineComponent({
      emits: ['search'],
      template:
        '<button data-test="search" @click="$emit(\'search\', input)" />',
      setup() {
        return { input: searchInput }
      },
    })
    const wrapper = mount(IndexPage, {
      global: {
        components: { AvailabilitySearch: AvailabilitySearchStub },
      },
    })
    await flushPromises()

    expect(wrapper.findAll('#rooms article')).toHaveLength(2)
    expect(wrapper.text()).toContain('Translated Garden')
    expect(wrapper.text()).not.toContain('Untranslated database garden')
    await wrapper.get('[data-test="search"]').trigger('click')
    await flushPromises()

    expect(reservationStore.searchAvailabilityForRooms).toHaveBeenCalledWith([
      expect.objectContaining({ roomTypeId: 'dynamic-room-a' }),
      expect.objectContaining({ roomTypeId: 'dynamic-room-b' }),
    ])
  })

  it('does not show room cards when any availability request fails', async () => {
    const AvailabilitySearchStub = defineComponent({
      emits: ['search'],
      template:
        '<button data-test="search" @click="$emit(\'search\', input)" />',
      setup() {
        return { input: searchInput }
      },
    })
    const wrapper = mount(IndexPage, {
      global: {
        components: { AvailabilitySearch: AvailabilitySearchStub },
      },
    })

    await flushPromises()

    expect(wrapper.findAll('#rooms article')).toHaveLength(2)

    await wrapper.get('[data-test="search"]').trigger('click')
    await flushPromises()

    expect(reservationStore.availabilityErrorCode).toBe('AVAILABILITY_FAILED')
    expect(wrapper.findAll('#rooms article')).toHaveLength(0)
  })

  it('copies the secure reservation URL explicitly', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    reservationStore.currentReservation = {
      id: 'reservation-1',
      status: 'PENDING_PAYMENT',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }
    reservationStore.reservationAccessUrl =
      '/#reservationId=reservation-1&accessToken=secret-token'
    const wrapper = mount(IndexPage, {
      global: {
        components: {
          AvailabilitySearch: { template: '<div />' },
        },
      },
    })

    await wrapper.get('[data-test="copy-access-link"]').trigger('click')
    await flushPromises()

    expect(writeText).toHaveBeenCalledWith(
      'http://localhost:3000/#reservationId=reservation-1&accessToken=secret-token',
    )
  })
})
