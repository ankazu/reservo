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
const reservationStore = useReservationStore()
const propertyId = '00000000-0000-4000-8000-000000000001'

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
}

onBeforeUnmount(reservationStore.cancelAvailability)

async function createHold() {
  if (!selectedRoomId.value || !guestName.value || !guestEmail.value) return
  await reservationStore.createHold({
    propertyId,
    roomTypeId: selectedRoomId.value,
    checkInDate: checkIn.value,
    checkOutDate: checkOut.value,
    quantity: 1,
    guestName: guestName.value,
    guestEmail: guestEmail.value,
    ratePlanName: 'Standard',
  })
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
        >
          {{ t('search.submit') }} <span class="ml-3">↗</span>
        </button>
      </form>
      <p
        v-if="formError"
        class="text-xs text-peach md:col-start-2"
        role="alert"
      >
        {{ formError }}
      </p>
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
      <form
        v-if="selectedRoomId"
        class="mt-8 grid gap-3 border border-stone-300 bg-[#eeece5] p-5 md:grid-cols-[1fr_1fr_auto]"
        @submit.prevent="createHold"
      >
        <input
          v-model="guestName"
          :placeholder="t('reservation.name')"
          required
          class="border-b border-stone-300 bg-transparent p-2 outline-none"
        />
        <input
          v-model="guestEmail"
          :placeholder="t('reservation.email')"
          type="email"
          required
          class="border-b border-stone-300 bg-transparent p-2 outline-none"
        />
        <button
          type="submit"
          class="bg-clay px-5 py-3 text-white"
          :disabled="reservationStore.isLoading"
        >
          {{ t('reservation.submit') }}
        </button>
      </form>
      <p
        v-if="reservationStore.currentReservation"
        class="mt-4 text-sm text-moss"
        role="status"
      >
        {{ t('reservation.success') }}
      </p>
      <p
        v-else-if="reservationStore.errorCode"
        class="mt-4 text-sm text-clay"
        role="alert"
      >
        {{ t(`errors.${reservationStore.errorCode}`, {}, t('errors.UNKNOWN')) }}
      </p>
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
