<script setup lang="ts">
const { t, locale } = useI18n()
const route = useRoute()
const reservationStore = useReservationStore()
const accessToken = ref('')
const hasLoaded = ref(false)

function reservationId() {
  const value = route.params.reservationId
  return Array.isArray(value) ? (value[0] ?? '') : value
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat(locale.value === 'zh-TW' ? 'zh-TW' : 'en-US', {
    style: 'currency',
    currency: 'TWD',
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat(locale.value, {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(`${date}T00:00:00+08:00`))
}

const details = computed(() => reservationStore.reservationDetails)
const errorMessage = computed(() => {
  const code = reservationStore.lookupErrorCode
  return code
    ? t(`errors.${code}`, {}, t('errors.UNKNOWN'))
    : t('errors.RESERVATION_NOT_FOUND')
})
const statusMessage = computed(() => {
  const status = details.value?.status
  return status ? t(`reservation.status.${status}`) : ''
})
const canCancel = computed(() =>
  ['PENDING_PAYMENT', 'CONFIRMED'].includes(details.value?.status ?? ''),
)

async function loadReservation() {
  const id = reservationId()
  const token = new URLSearchParams(window.location.hash.slice(1)).get(
    'accessToken',
  )
  accessToken.value = token ?? ''
  if (!id || !accessToken.value) {
    reservationStore.reservationDetails = null
    reservationStore.lookupErrorCode = 'RESERVATION_NOT_FOUND'
    hasLoaded.value = true
    return
  }
  await reservationStore.getReservation(id, accessToken.value)
  hasLoaded.value = true
}

async function cancelReservation() {
  const id = reservationId()
  if (!id || !accessToken.value) return
  await reservationStore.cancelReservation(id, accessToken.value)
}

onMounted(() => {
  void loadReservation()
})
</script>

<template>
  <main class="mx-auto min-h-screen w-[calc(100%-48px)] max-w-[760px] py-10">
    <header
      class="flex items-center justify-between border-b border-stone-300 pb-6"
    >
      <NuxtLink to="/" class="text-[22px] font-bold tracking-[-0.07em]">
        reservo<span class="text-clay">.</span>
      </NuxtLink>
      <NuxtLink to="/" class="text-xs text-moss hover:text-clay">
        {{ t('reservation.details.back') }}
      </NuxtLink>
    </header>

    <section class="py-16">
      <p class="mb-4 text-[11px] uppercase tracking-[0.14em] text-clay">
        {{ t('reservation.details.eyebrow') }}
      </p>
      <h1
        class="font-serif text-[clamp(42px,7vw,70px)] leading-none tracking-[-0.06em]"
      >
        {{ t('reservation.details.title') }}
      </h1>

      <p
        v-if="reservationStore.isLookupLoading"
        class="mt-8 text-sm text-moss"
        role="status"
      >
        {{ t('reservation.lookup.loading') }}
      </p>
      <div
        v-else-if="hasLoaded && !details"
        class="mt-8 border border-stone-300 bg-[#eeece5] p-6"
        role="alert"
      >
        <p class="text-sm text-clay">{{ errorMessage }}</p>
        <p class="mt-2 text-xs leading-5 text-moss">
          {{ t('reservation.details.accessRequired') }}
        </p>
      </div>

      <div v-else-if="details" class="mt-8 space-y-6">
        <div class="border-l-2 border-clay bg-[#eeece5] p-6">
          <div
            class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"
          >
            <div>
              <p class="text-xl font-medium text-ink">{{ statusMessage }}</p>
              <p class="mt-2 text-xs text-moss">
                {{ t('reservation.idLabel') }}
                <span class="font-mono text-ink">{{ details.id }}</span>
              </p>
            </div>
            <button
              v-if="canCancel"
              type="button"
              data-test="cancel-reservation"
              class="border border-clay px-4 py-2 text-xs text-clay disabled:opacity-50"
              :disabled="reservationStore.isLoading"
              @click="cancelReservation"
            >
              {{ t('reservation.cancel') }}
            </button>
          </div>
          <p
            v-if="reservationStore.errorCode"
            class="mt-4 text-xs text-clay"
            role="alert"
          >
            {{
              t(`errors.${reservationStore.errorCode}`, {}, t('errors.UNKNOWN'))
            }}
          </p>
        </div>

        <dl
          class="grid gap-4 border-y border-stone-300 py-6 text-sm md:grid-cols-2"
        >
          <div>
            <dt class="text-xs text-moss">{{ t('reservation.name') }}</dt>
            <dd class="mt-1 text-ink">{{ details.guestName }}</dd>
          </div>
          <div>
            <dt class="text-xs text-moss">{{ t('reservation.email') }}</dt>
            <dd class="mt-1 text-ink">{{ details.guestEmail }}</dd>
          </div>
          <div>
            <dt class="text-xs text-moss">
              {{ t('reservation.details.guests') }}
            </dt>
            <dd class="mt-1 text-ink">{{ details.guestCount }}</dd>
          </div>
          <div>
            <dt class="text-xs text-moss">
              {{ t('reservation.details.nights') }}
            </dt>
            <dd class="mt-1 text-ink">{{ details.nights }}</dd>
          </div>
          <div class="md:col-span-2">
            <dt class="text-xs text-moss">
              {{ t('reservation.lookup.dates') }}
            </dt>
            <dd class="mt-1 text-ink">
              {{
                t('reservation.lookup.dateRange', {
                  checkIn: formatDate(details.checkInDate),
                  checkOut: formatDate(details.checkOutDate),
                })
              }}
            </dd>
          </div>
        </dl>

        <section>
          <h2 class="mb-3 text-xs uppercase tracking-[0.12em] text-clay">
            {{ t('reservation.details.items') }}
          </h2>
          <div
            v-for="item in details.items"
            :key="item.id"
            class="flex flex-col gap-2 border-b border-stone-300 py-4 text-sm md:flex-row md:items-center md:justify-between"
          >
            <div>
              <p class="text-ink">{{ item.roomTypeNameSnapshot }}</p>
              <p class="mt-1 text-xs text-moss">
                {{ item.ratePlanNameSnapshot }} ·
                {{
                  t('reservation.details.quantity', { count: item.quantity })
                }}
              </p>
            </div>
            <p class="text-ink">
              {{
                formatCurrency(
                  item.nightlyPrice * item.quantity * details.nights,
                )
              }}
            </p>
          </div>
        </section>

        <dl
          class="ml-auto max-w-xs space-y-2 border-t border-stone-300 pt-4 text-sm"
        >
          <div class="flex justify-between gap-4">
            <dt class="text-moss">{{ t('reservation.details.subtotal') }}</dt>
            <dd>{{ formatCurrency(details.price.subtotal) }}</dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="text-moss">{{ t('reservation.details.taxes') }}</dt>
            <dd>{{ formatCurrency(details.price.taxes) }}</dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="text-moss">{{ t('reservation.details.discounts') }}</dt>
            <dd>{{ formatCurrency(details.price.discounts) }}</dd>
          </div>
          <div
            class="flex justify-between gap-4 border-t border-stone-300 pt-3 text-base font-medium"
          >
            <dt>{{ t('reservation.lookup.total') }}</dt>
            <dd>{{ formatCurrency(details.price.total) }}</dd>
          </div>
        </dl>
      </div>
    </section>
  </main>
</template>
