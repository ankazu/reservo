// @vitest-environment happy-dom

import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, ref } from 'vue'

import AvailabilitySearch from '../../../app/components/AvailabilitySearch.vue'

const messages: Record<string, string> = {
  'search.eyebrow': 'Find your stay',
  'search.title': 'Choose your dates',
  'search.checkIn': 'Check in',
  'search.checkOut': 'Check out',
  'search.guests': 'Guests',
  'search.guestUnit': 'guests',
  'search.submit': 'Search rooms',
  'search.loading': 'Searching…',
  'search.retry': 'Retry search',
  'search.errors.dateRange': 'Choose a valid date range.',
  'search.success': 'Rooms found.',
}

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => messages[key] ?? key,
  }),
}))

describe('availability search', () => {
  it('retries the current search after an availability failure', async () => {
    const search = vi.fn()
    const Harness = defineComponent({
      components: { AvailabilitySearch },
      setup() {
        const apiError = ref<string | null>(null)
        const hasSearched = ref(false)
        let attempt = 0

        async function runSearch(input: unknown) {
          search(input)
          attempt += 1
          if (attempt === 1) {
            apiError.value = 'Availability is temporarily unavailable.'
            return
          }
          apiError.value = null
          hasSearched.value = true
        }

        return { apiError, hasSearched, runSearch }
      },
      template: `
        <AvailabilitySearch
          today="2026-08-05"
          :loading="false"
          :api-error="apiError"
          :has-searched="hasSearched"
          @search="runSearch"
        />
      `,
    })
    const wrapper = mount(Harness)
    await wrapper.get('[data-test="check-in"]').setValue('2026-08-10')
    await wrapper.get('[data-test="check-out"]').setValue('2026-08-12')

    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[data-test="retry-search"]').exists()).toBe(true)

    await wrapper.get('[data-test="retry-search"]').trigger('click')
    await flushPromises()

    expect(search).toHaveBeenNthCalledWith(1, {
      checkInDate: '2026-08-10',
      checkOutDate: '2026-08-12',
      guests: 2,
    })
    expect(search).toHaveBeenNthCalledWith(2, {
      checkInDate: '2026-08-10',
      checkOutDate: '2026-08-12',
      guests: 2,
    })
    expect(wrapper.find('[data-test="retry-search"]').exists()).toBe(false)
    expect(wrapper.get('[role="status"]').text()).toBe('Rooms found.')
  })

  it('shows date validation without a stale Retry action', async () => {
    const wrapper = mount(AvailabilitySearch, {
      props: {
        today: '2026-08-05',
        loading: false,
        apiError: 'Availability is temporarily unavailable.',
        hasSearched: false,
      },
    })
    await wrapper.get('[data-test="check-in"]').setValue('2026-08-10')
    await wrapper.get('[data-test="check-out"]').setValue('2026-08-10')

    await wrapper.get('form').trigger('submit')

    expect(wrapper.get('[role="alert"]').text()).toBe(
      'Choose a valid date range.',
    )
    expect(wrapper.find('[data-test="retry-search"]').exists()).toBe(false)
    expect(wrapper.emitted('clear-error')).toHaveLength(1)
    expect(wrapper.emitted('search')).toBeUndefined()
  })
})
