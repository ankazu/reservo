<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { StaySearchInput } from '~~/shared/types/availability'

const props = defineProps<{
  today: string
  loading: boolean
  apiError: string | null
  hasSearched: boolean
}>()

const emit = defineEmits<{
  search: [input: StaySearchInput]
  'clear-error': []
}>()

const { t } = useI18n()
const checkIn = ref(props.today)
const checkOut = ref('')
const guests = ref(2)
const validationError = ref('')

const displayedError = computed(
  () => validationError.value || props.apiError || '',
)
const canRetry = computed(
  () => Boolean(props.apiError) && !validationError.value,
)

function submitSearch() {
  validationError.value = ''
  if (!checkIn.value || !checkOut.value || checkOut.value <= checkIn.value) {
    emit('clear-error')
    validationError.value = t('search.errors.dateRange')
    return
  }

  emit('search', {
    checkInDate: checkIn.value,
    checkOutDate: checkOut.value,
    guests: guests.value,
  })
}
</script>

<template>
  <section
    class="mx-auto grid w-[calc(100%-48px)] max-w-[1180px] gap-6 bg-ink px-5 py-7 text-paper md:grid-cols-[210px_1fr] md:px-9"
    aria-labelledby="search-title"
  >
    <div>
      <p class="mb-2.5 text-[11px] uppercase tracking-[0.14em] text-peach">
        {{ t('search.eyebrow') }}
      </p>
      <h2 id="search-title" class="font-serif text-[25px] font-medium">
        {{ t('search.title') }}
      </h2>
    </div>
    <form
      class="grid grid-cols-2 gap-3 md:grid-cols-[repeat(3,1fr)_auto]"
      :aria-busy="loading"
      @submit.prevent="submitSearch"
    >
      <label
        class="flex flex-col gap-2 text-[10px] uppercase tracking-[0.1em] text-[#aeb9b0]"
        ><span>{{ t('search.checkIn') }}</span
        ><input
          v-model="checkIn"
          data-test="check-in"
          class="border-0 border-b border-[#647169] bg-transparent px-0 py-1.5 text-paper outline-none focus:border-peach"
          type="date"
          :min="today"
          required
      /></label>
      <label
        class="flex flex-col gap-2 text-[10px] uppercase tracking-[0.1em] text-[#aeb9b0]"
        ><span>{{ t('search.checkOut') }}</span
        ><input
          v-model="checkOut"
          data-test="check-out"
          class="border-0 border-b border-[#647169] bg-transparent px-0 py-1.5 text-paper outline-none focus:border-peach"
          type="date"
          :min="checkIn || today"
          required
      /></label>
      <label
        class="flex flex-col gap-2 text-[10px] uppercase tracking-[0.1em] text-[#aeb9b0]"
        ><span>{{ t('search.guests') }}</span
        ><select
          v-model="guests"
          data-test="guests"
          class="border-0 border-b border-[#647169] bg-transparent px-0 py-1.5 text-paper outline-none focus:border-peach"
        >
          <option
            v-for="count in 6"
            :key="count"
            :value="count"
            class="text-ink"
          >
            {{ count }} {{ t('search.guestUnit') }}
          </option>
        </select></label
      >
      <button
        class="col-span-2 self-end bg-clay px-5 py-3 text-white transition hover:bg-[#ad593b] focus:outline-none focus:ring-2 focus:ring-peach/60 disabled:cursor-not-allowed disabled:opacity-50 md:col-span-1"
        type="submit"
        :disabled="loading"
      >
        {{ loading ? t('search.loading') : t('search.submit') }}
        <span v-if="!loading" class="ml-3">↗</span>
      </button>
    </form>
    <div
      v-if="displayedError"
      class="flex flex-wrap items-center gap-3 text-xs text-peach md:col-start-2"
    >
      <p role="alert">{{ displayedError }}</p>
      <button
        v-if="canRetry"
        data-test="retry-search"
        type="button"
        class="border border-peach px-3 py-1.5 text-paper transition hover:bg-peach hover:text-ink focus:outline-none focus:ring-2 focus:ring-peach/60 disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="loading"
        @click="submitSearch"
      >
        {{ t('search.retry') }}
      </button>
    </div>
    <p
      v-else-if="hasSearched"
      class="text-xs text-[#c2d3bd] md:col-start-2"
      role="status"
    >
      {{ t('search.success', { guests }) }}
    </p>
  </section>
</template>
