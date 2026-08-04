<script setup lang="ts">
const { t, locale, setLocale } = useI18n()

const today = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date())
const checkIn = ref(today)
const checkOut = ref('')
const guests = ref(2)
const hasSearched = ref(false)
const formError = ref('')
const selectedRoomId = ref<string | null>(null)
const guestName = ref('')
const guestEmail = ref('')
const reservationFormError = ref('')
const reservationLookupId = ref('')
const reservationLookupError = ref('')
const reservationStore = useReservationStore()
const propertyId = '00000000-0000-4000-8000-000000000001'
const now = ref(Date.now())
let expiryTimer: ReturnType<typeof setInterval> | undefined
let expirationRequestId: string | null = null

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

const reservationSecondsRemaining = computed(() => {
  const expiresAt = reservationStore.currentReservation?.expiresAt
  if (!expiresAt) return null
  return Math.max(
    0,
    Math.floor((new Date(expiresAt).getTime() - now.value) / 1000),
  )
})

const reservationTimeRemaining = computed(() => {
  const seconds = reservationSecondsRemaining.value
  if (seconds === null) return ''
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = String(seconds % 60).padStart(2, '0')
  return `${minutes}:${remainingSeconds}`
})

async function expireHold() {
  const reservation = reservationStore.currentReservation
  if (
    reservationSecondsRemaining.value !== 0 ||
    !reservation ||
    reservation.status !== 'PENDING_PAYMENT' ||
    expirationRequestId === reservation.id ||
    reservationStore.isLoading
  ) {
    return
  }

  expirationRequestId = reservation.id
  const result = await reservationStore.expireReservation(reservation.id)
  if (!result) expirationRequestId = null
}

watch(
  () =>
    [reservationSecondsRemaining.value, reservationStore.isLoading] as const,
  ([seconds]) => {
    if (seconds === 0) void expireHold()
  },
)

const rooms = [
  {
    key: 'standard',
    icon: '01',
    size: 28,
    beds: 1,
    roomTypeId: '00000000-0000-4000-8000-000000000101',
    accent: 'bg-[#d2b99e]',
  },
  {
    key: 'garden',
    icon: '02',
    size: 36,
    beds: 1,
    roomTypeId: '00000000-0000-4000-8000-000000000102',
    accent: 'bg-[#a8b9a5]',
  },
  {
    key: 'suite',
    icon: '03',
    size: 52,
    beds: 2,
    roomTypeId: '00000000-0000-4000-8000-000000000103',
    accent: 'bg-[#c78062]',
  },
]

async function toggleLocale() {
  const nextLocale = locale.value === 'zh-TW' ? 'en' : 'zh-TW'
  await setLocale(nextLocale)
  locale.value = nextLocale
}

async function submitSearch() {
  formError.value = ''
  hasSearched.value = false
  selectedRoomId.value = null
  reservationFormError.value = ''
  reservationStore.clearReservation()
  reservationStore.clearAvailability()
  if (!checkIn.value || !checkOut.value || checkOut.value <= checkIn.value) {
    formError.value = t('search.errors.dateRange')
    hasSearched.value = false
    return
  }
  await reservationStore.searchAvailabilityForRooms(
    rooms.map((room) => ({
      roomTypeId: room.roomTypeId,
      checkInDate: checkIn.value,
      checkOutDate: checkOut.value,
      quantity: 1,
      guests: guests.value,
    })),
  )
  if (reservationStore.errorCode) {
    formError.value = t(
      `errors.${reservationStore.errorCode}`,
      {},
      t('errors.UNKNOWN'),
    )
    hasSearched.value = false
  } else {
    hasSearched.value = true
  }
}

function selectRoom(roomId: string) {
  if (!hasSearched.value) return
  if (!reservationStore.availabilityByRoomTypeId[roomId]?.available) return
  selectedRoomId.value = roomId
  reservationFormError.value = ''
}

onBeforeUnmount(reservationStore.cancelAvailability)
onMounted(() => {
  expiryTimer = setInterval(() => {
    now.value = Date.now()
  }, 1000)
})
onBeforeUnmount(() => {
  if (expiryTimer) clearInterval(expiryTimer)
})

async function createHold() {
  reservationFormError.value = ''
  if (!selectedRoomId.value) return
  if (!guestName.value.trim() || !guestEmail.value.trim()) {
    reservationFormError.value = t('reservation.errors.required')
    return
  }
  await reservationStore.createHold({
    propertyId,
    roomTypeId: selectedRoomId.value,
    checkInDate: checkIn.value,
    checkOutDate: checkOut.value,
    quantity: 1,
    guests: guests.value,
    guestName: guestName.value.trim(),
    guestEmail: guestEmail.value.trim(),
    ratePlanName: 'Standard',
  })
}

async function confirmHold() {
  const reservation = reservationStore.currentReservation
  if (!reservation || reservation.status !== 'PENDING_PAYMENT') return
  await reservationStore.confirmReservation(reservation.id)
}

async function cancelHold() {
  const reservation = reservationStore.currentReservation
  if (!reservation) return
  await reservationStore.cancelReservation(reservation.id)
}

async function retryExpiration() {
  expirationRequestId = null
  await expireHold()
}

async function lookupReservation() {
  reservationLookupError.value = ''
  if (!reservationLookupId.value.trim()) {
    reservationLookupError.value = t('reservation.lookup.errors.required')
    return
  }
  const result = await reservationStore.getReservation(
    reservationLookupId.value.trim(),
  )
  if (!result) {
    reservationLookupError.value = t(
      `errors.${reservationStore.lookupErrorCode}`,
      {},
      t('errors.UNKNOWN'),
    )
  }
}
</script>

<template>
  <main class="overflow-hidden">
    <header
      class="mx-auto flex h-[88px] w-[calc(100%-48px)] max-w-[1180px] items-center justify-between border-b border-stone-300"
    >
      <a
        href="#top"
        class="text-[22px] font-bold tracking-[-0.07em]"
        :aria-label="t('app.name')"
        >reservo<span class="text-clay">.</span></a
      >
      <nav
        class="hidden gap-9 text-[12px] uppercase tracking-[0.08em] text-moss md:flex"
        :aria-label="t('navigation.label')"
      >
        <a href="#rooms" class="hover:text-clay">{{ t('navigation.rooms') }}</a>
        <a href="#story" class="hover:text-clay">{{ t('navigation.story') }}</a>
        <a href="#contact" class="hover:text-clay">{{
          t('navigation.contact')
        }}</a>
      </nav>
      <button
        class="rounded-full border border-stone-300 px-3.5 py-2 text-xs text-moss"
        type="button"
        :aria-label="t('navigation.language')"
        @click="toggleLocale"
      >
        {{ t('navigation.switchTo') }} <span class="ml-1.5">⌄</span>
      </button>
    </header>

    <section
      id="top"
      class="mx-auto grid min-h-[510px] w-[calc(100%-48px)] max-w-[1180px] items-center gap-14 py-16 md:grid-cols-2 md:py-0"
    >
      <div>
        <p class="mb-5 text-[11px] uppercase tracking-[0.14em] text-clay">
          {{ t('hero.eyebrow') }}
        </p>
        <h1
          class="text-[clamp(54px,7vw,94px)] font-medium leading-[0.92] tracking-[-0.075em]"
        >
          {{ t('hero.title') }}<br /><em
            class="font-serif font-medium not-italic text-clay"
            >{{ t('hero.titleAccent') }}</em
          >
        </h1>
        <p class="mt-7 max-w-[365px] leading-7 text-moss">
          {{ t('hero.description') }}
        </p>
      </div>
      <div
        class="relative h-[250px] overflow-hidden bg-sage md:h-[365px]"
        aria-hidden="true"
      >
        <div
          class="absolute right-20 top-10 h-[180px] w-[180px] rounded-full bg-[#e7ae65]"
        ></div>
        <div
          class="absolute bottom-[-70px] left-[calc(50%-75px)] h-[330px] w-[280px] rounded-t-[150px] bg-[#a9b7a1]"
        ></div>
        <div
          class="absolute bottom-[-30px] left-[calc(50%-64px)] h-[268px] w-[205px] rounded-t-[120px] bg-[#657b6c]"
        ></div>
        <span
          class="absolute left-6 top-6 text-[11px] uppercase leading-[1.4] tracking-[0.13em] text-[#53655a]"
          >{{ t('hero.artLineOne') }}<br />{{ t('hero.artLineTwo') }}</span
        >
      </div>
    </section>

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
        :aria-busy="reservationStore.isAvailabilityLoading"
        @submit.prevent="submitSearch"
      >
        <label
          class="flex flex-col gap-2 text-[10px] uppercase tracking-[0.1em] text-[#aeb9b0]"
          ><span>{{ t('search.checkIn') }}</span
          ><input
            v-model="checkIn"
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
          class="col-span-2 self-end bg-clay px-5 py-3 text-white transition hover:bg-[#ad593b] md:col-span-1"
          type="submit"
          :disabled="reservationStore.isAvailabilityLoading"
        >
          {{
            reservationStore.isAvailabilityLoading
              ? t('search.loading')
              : t('search.submit')
          }}
          <span v-if="!reservationStore.isAvailabilityLoading" class="ml-3"
            >↗</span
          >
        </button>
      </form>
      <div
        v-if="formError"
        class="flex flex-wrap items-center gap-3 text-xs text-peach md:col-start-2"
      >
        <p role="alert">{{ formError }}</p>
        <button
          v-if="reservationStore.errorCode"
          type="button"
          class="border border-peach px-3 py-1.5 text-paper transition hover:bg-peach hover:text-ink focus:outline-none focus:ring-2 focus:ring-peach/60 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="reservationStore.isAvailabilityLoading"
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

    <section
      id="rooms"
      class="mx-auto w-[calc(100%-48px)] max-w-[1180px] py-[100px] md:py-[104px]"
    >
      <div
        class="mb-[30px] flex flex-col gap-5 border-b border-stone-300 pb-6 md:flex-row md:items-end md:justify-between"
      >
        <div>
          <p class="mb-5 text-[11px] uppercase tracking-[0.14em] text-clay">
            {{ t('rooms.eyebrow') }}
          </p>
          <h2 class="font-serif text-[44px] font-medium tracking-[-0.04em]">
            {{ t('rooms.title') }}
          </h2>
        </div>
        <p class="max-w-[290px] text-sm leading-6 text-moss">
          {{ t('rooms.description') }}
        </p>
      </div>
      <div class="grid gap-[18px] md:grid-cols-3">
        <article
          v-for="room in rooms"
          :key="room.key"
          class="border border-stone-300 bg-[#eeece5]"
        >
          <div class="relative h-[200px] overflow-hidden" :class="room.accent">
            <span class="absolute left-4 top-4 text-[11px] text-ink/70">{{
              room.icon
            }}</span
            ><i
              class="absolute bottom-[-42px] left-[calc(50%-75px)] block h-[180px] w-[150px] rounded-t-[100px] bg-white/25"
            ></i>
          </div>
          <div class="p-[23px_22px_20px]">
            <div class="flex items-baseline justify-between gap-3">
              <h3 class="font-serif text-[23px] font-medium">
                {{ t(`rooms.${room.key}.name`) }}
              </h3>
              <span
                v-if="
                  reservationStore.availabilityByRoomTypeId[room.roomTypeId]
                "
                class="whitespace-nowrap text-xs"
              >
                {{
                  reservationStore.availabilityByRoomTypeId[room.roomTypeId]
                    .available
                    ? t('rooms.available')
                    : t('rooms.unavailable')
                }}
              </span>
            </div>
            <p class="min-h-[42px] text-[13px] leading-6 text-moss">
              {{ t(`rooms.${room.key}.description`) }}
            </p>
            <div
              v-if="reservationStore.availabilityByRoomTypeId[room.roomTypeId]"
              class="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-clay"
            >
              <span>
                {{
                  t('rooms.pricePerNight', {
                    price: formatCurrency(
                      reservationStore.availabilityByRoomTypeId[room.roomTypeId]
                        .price.nightlyPrice,
                    ),
                  })
                }}
              </span>
              <span>
                {{
                  t('rooms.stayTotal', {
                    price: formatCurrency(
                      reservationStore.availabilityByRoomTypeId[room.roomTypeId]
                        .price.total,
                    ),
                  })
                }}
              </span>
            </div>
            <div
              class="flex gap-3 border-t border-stone-300 pt-4 text-[10px] text-moss"
            >
              <span>{{ t('rooms.area', { size: room.size }) }}</span
              ><span>{{ t('rooms.beds', { count: room.beds }) }}</span
              ><span>{{ t('rooms.guests', { count: guests }) }}</span>
            </div>
            <button
              class="pt-5 text-xs text-clay hover:underline"
              type="button"
              :disabled="
                !hasSearched ||
                !reservationStore.availabilityByRoomTypeId[room.roomTypeId]
                  ?.available
              "
              @click="selectRoom(room.roomTypeId)"
            >
              {{
                reservationStore.availabilityByRoomTypeId[room.roomTypeId]
                  ?.available
                  ? t('rooms.choose')
                  : t('rooms.unavailable')
              }}
              <span class="ml-3">↗</span>
            </button>
          </div>
        </article>
      </div>
      <p
        v-if="
          hasSearched &&
          !reservationStore.isAvailabilityLoading &&
          !rooms.some(
            (room) =>
              reservationStore.availabilityByRoomTypeId[room.roomTypeId]
                ?.available,
          )
        "
        class="mt-8 border border-stone-300 bg-[#eeece5] p-5 text-sm text-moss"
        role="status"
      >
        {{ t('rooms.empty') }}
      </p>
      <form
        v-if="selectedRoomId"
        class="mt-8 grid gap-3 border border-stone-300 bg-[#eeece5] p-5 md:grid-cols-[1fr_1fr_auto]"
        @submit.prevent="createHold"
      >
        <p
          v-if="reservationStore.availabilityByRoomTypeId[selectedRoomId]"
          class="col-span-full text-sm text-moss"
        >
          {{
            t('rooms.stayTotal', {
              price: formatCurrency(
                reservationStore.availabilityByRoomTypeId[selectedRoomId].price
                  .total,
              ),
            })
          }}
        </p>
        <label class="flex flex-col gap-1 text-xs text-moss">
          {{ t('reservation.name') }}
          <input
            v-model="guestName"
            required
            autocomplete="name"
            class="border-b border-stone-300 bg-transparent p-2 text-sm text-ink outline-none"
          />
        </label>
        <label class="flex flex-col gap-1 text-xs text-moss">
          {{ t('reservation.email') }}
          <input
            v-model="guestEmail"
            type="email"
            required
            autocomplete="email"
            class="border-b border-stone-300 bg-transparent p-2 text-sm text-ink outline-none"
          />
        </label>
        <button
          type="submit"
          class="bg-clay px-5 py-3 text-white"
          :disabled="reservationStore.isLoading"
        >
          {{
            reservationStore.isLoading
              ? t('reservation.loading')
              : t('reservation.submit')
          }}
        </button>
        <p
          v-if="reservationFormError"
          class="col-span-full text-xs text-clay"
          role="alert"
        >
          {{ reservationFormError }}
        </p>
      </form>
      <div
        v-if="reservationStore.currentReservation"
        class="mt-4 flex flex-col gap-3 border-l-2 border-clay bg-[#eeece5] p-4 text-sm text-moss md:flex-row md:items-center md:justify-between"
        role="status"
      >
        <div>
          <p class="font-medium text-ink">
            {{
              t(
                `reservation.status.${reservationStore.currentReservation.status}`,
              )
            }}
          </p>
          <p class="mt-1 text-xs text-moss">
            {{ t('reservation.idLabel') }}
            <span class="font-mono text-ink">
              {{ reservationStore.currentReservation.id }}
            </span>
          </p>
          <p
            v-if="
              reservationStore.currentReservation.status === 'PENDING_PAYMENT'
            "
          >
            {{ t('reservation.success') }}
            <span
              v-if="reservationTimeRemaining"
              class="ml-1 font-medium text-clay"
            >
              {{
                t('reservation.expiresIn', { time: reservationTimeRemaining })
              }}
            </span>
          </p>
        </div>
        <button
          v-if="
            reservationStore.currentReservation.status === 'PENDING_PAYMENT'
          "
          type="button"
          class="border border-stone-400 px-4 py-2 text-xs text-moss transition hover:border-clay hover:text-clay focus:outline-none focus:ring-2 focus:ring-clay/50 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="
            reservationStore.isLoading || reservationSecondsRemaining === 0
          "
          @click="cancelHold"
        >
          {{ t('reservation.cancel') }}
        </button>
        <button
          v-if="
            reservationStore.currentReservation.status === 'PENDING_PAYMENT' &&
            reservationSecondsRemaining !== 0
          "
          type="button"
          class="bg-clay px-4 py-2 text-xs text-white transition hover:bg-[#ad593b] focus:outline-none focus:ring-2 focus:ring-clay/50 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="reservationStore.isLoading"
          @click="confirmHold"
        >
          {{ t('reservation.confirm') }}
        </button>
        <button
          v-if="
            reservationStore.currentReservation.status === 'PENDING_PAYMENT' &&
            reservationSecondsRemaining === 0 &&
            reservationStore.errorCode
          "
          type="button"
          class="border border-clay px-4 py-2 text-xs text-clay transition hover:bg-clay hover:text-white focus:outline-none focus:ring-2 focus:ring-clay/50 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="reservationStore.isLoading"
          @click="retryExpiration"
        >
          {{ t('reservation.retryExpiration') }}
        </button>
        <p
          v-if="reservationStore.errorCode"
          class="text-xs text-clay md:col-span-2"
          role="alert"
        >
          {{
            t(`errors.${reservationStore.errorCode}`, {}, t('errors.UNKNOWN'))
          }}
        </p>
      </div>
      <p
        v-if="
          !reservationStore.currentReservation && reservationStore.errorCode
        "
        class="mt-4 text-sm text-clay"
        role="alert"
      >
        {{ t(`errors.${reservationStore.errorCode}`, {}, t('errors.UNKNOWN')) }}
      </p>
      <div class="mt-8 border border-stone-300 bg-[#eeece5] p-5">
        <div class="mb-4">
          <p class="text-sm font-medium text-ink">
            {{ t('reservation.lookup.title') }}
          </p>
          <p class="mt-1 text-xs leading-5 text-moss">
            {{ t('reservation.lookup.description') }}
          </p>
        </div>
        <form
          class="grid gap-3 md:grid-cols-[1fr_auto]"
          @submit.prevent="lookupReservation"
        >
          <label class="sr-only" for="reservation-lookup-id">
            {{ t('reservation.lookup.label') }}
          </label>
          <input
            id="reservation-lookup-id"
            v-model="reservationLookupId"
            class="border-b border-stone-300 bg-transparent p-2 text-sm text-ink outline-none focus:border-clay"
            :placeholder="t('reservation.lookup.placeholder')"
            autocomplete="off"
            inputmode="text"
          />
          <button
            type="submit"
            class="border border-clay px-5 py-3 text-xs text-clay transition hover:bg-clay hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="reservationStore.isLookupLoading"
          >
            {{
              reservationStore.isLookupLoading
                ? t('reservation.lookup.loading')
                : t('reservation.lookup.submit')
            }}
          </button>
        </form>
        <p
          v-if="reservationLookupError"
          class="mt-3 text-xs text-clay"
          role="alert"
        >
          {{ reservationLookupError }}
        </p>
        <div
          v-if="reservationStore.reservationDetails"
          class="mt-5 grid gap-2 border-t border-stone-300 pt-4 text-xs text-moss md:grid-cols-3"
          role="status"
        >
          <span>
            {{ t('reservation.lookup.status') }}:
            <strong class="font-medium text-ink">
              {{
                t(
                  `reservation.status.${reservationStore.reservationDetails.status}`,
                )
              }}
            </strong>
          </span>
          <span>
            {{ t('reservation.lookup.dates') }}:
            <strong class="font-medium text-ink">
              {{
                t('reservation.lookup.dateRange', {
                  checkIn: formatDate(
                    reservationStore.reservationDetails.checkInDate,
                  ),
                  checkOut: formatDate(
                    reservationStore.reservationDetails.checkOutDate,
                  ),
                })
              }}
            </strong>
          </span>
          <span>
            {{ t('reservation.lookup.total') }}:
            <strong class="font-medium text-ink">
              {{
                formatCurrency(reservationStore.reservationDetails.price.total)
              }}
            </strong>
          </span>
        </div>
      </div>
    </section>

    <section
      id="story"
      class="mx-auto grid w-[calc(100%-48px)] max-w-[1180px] gap-9 border-t border-stone-300 py-[72px] md:grid-cols-[1fr_2fr_1fr] md:pb-[90px]"
    >
      <div class="font-serif text-[90px] leading-[0.8] text-clay">
        R<span class="italic">/</span>
      </div>
      <div>
        <p class="mb-5 text-[11px] uppercase tracking-[0.14em] text-clay">
          {{ t('story.eyebrow') }}
        </p>
        <h2
          class="max-w-[570px] font-serif text-[42px] font-medium tracking-[-0.04em] md:text-[52px]"
        >
          {{ t('story.title') }}
        </h2>
        <p class="mt-6 max-w-[500px] leading-7 text-moss">
          {{ t('story.description') }}
        </p>
      </div>
      <div
        class="self-end border-l border-clay pl-4 text-[11px] uppercase leading-6 tracking-[0.08em] text-moss"
      >
        {{ t('story.note') }}
      </div>
    </section>

    <footer
      id="contact"
      class="mx-auto flex w-[calc(100%-48px)] max-w-[1180px] flex-col gap-3 border-t border-stone-300 py-6 text-[10px] uppercase tracking-[0.08em] text-moss md:flex-row md:justify-between"
    >
      <span class="text-[22px] font-bold lowercase tracking-[-0.07em] text-ink"
        >reservo<span class="text-clay">.</span></span
      ><span>{{ t('footer.address') }}</span
      ><span>{{ t('footer.rights') }}</span>
    </footer>
  </main>
</template>
