<script setup lang="ts">
defineProps<{
  years: number[]
  selectedYear: number
}>()

const emit = defineEmits<{
  change: [year: number]
}>()
</script>

<template>
  <div class="flex flex-wrap gap-2">
    <button
      v-for="year in years"
      :key="year"
      class="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
      :class="year === selectedYear
        ? 'bg-blue-600 text-white'
        : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'"
      @click="emit('change', year)"
    >
      {{ year }} 年
    </button>
  </div>
</template>
