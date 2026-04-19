<script setup lang="ts">
import type { YearlyTaxReport } from '../lib/types'

defineProps<{
  report: YearlyTaxReport
}>()
</script>

<template>
  <div class="bg-white rounded-lg border border-gray-200 p-4">
    <h3 class="text-base font-semibold text-gray-900 mb-3">计算数据来源</h3>
    <ul class="space-y-1">
      <li
        v-for="source in report.dataSources"
        :key="source"
        class="text-sm text-gray-600 flex items-center gap-2"
      >
        <svg class="h-4 w-4 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        {{ source }}
      </li>
    </ul>
    <div class="mt-3 p-3 bg-blue-50 rounded text-xs text-blue-700">
      <p><strong>计算方式：</strong>移动加权平均成本法</p>
      <p><strong>汇率来源：</strong>富途年度结单参考汇率（年末汇率）</p>
      <p><strong>税率：</strong>财产转让所得 20%、股息红利所得 20%（境外已缴税可抵免）</p>
    </div>
  </div>
</template>
