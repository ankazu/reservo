<script setup lang="ts">
const { t } = useI18n()
</script>

<template>
  <main>
    <h1>{{ t('app.name') }}</h1>
    <p>{{ t('app.description') }}</p>
  </main>
</template>
