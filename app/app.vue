<script setup lang="ts">
const { t } = useI18n()

useHead({
  title: () => t('app.name'),
  meta: [{ name: 'description', content: () => t('app.description') }],
})
</script>

<template>
  <NuxtRouteAnnouncer />
  <div class="app-shell">
    <NuxtPage />
  </div>
</template>
