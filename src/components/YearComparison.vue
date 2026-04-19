<script setup lang="ts">
import { computed } from 'vue'
import type { YearlyTaxReport } from '../lib/types'

const props = defineProps<{
  reports: Map<number, YearlyTaxReport>
}>()

function fmt(n: number): string {
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const years = computed(() =>
  Array.from(props.reports.keys()).sort((a, b) => a - b)
)

const maxAbsValue = computed(() => {
  let max = 1
  for (const r of props.reports.values()) {
    max = Math.max(max, Math.abs(r.stock.totalGainCny), Math.abs(r.fund.totalGainCny), Math.abs(r.dividend.totalDividendCny))
  }
  return max
})

function barWidth(value: number): string {
  return `${Math.min(100, (Math.abs(value) / maxAbsValue.value) * 100)}%`
}
</script>

<template>
  <div class="bg-white rounded-lg border border-gray-200 p-4">
    <h3 class="text-base font-semibold text-gray-900 mb-4">历年对比</h3>

    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500">年度</th>
            <th class="px-4 py-2 text-right text-xs font-medium text-gray-500">股票收益(CNY)</th>
            <th class="px-4 py-2 text-right text-xs font-medium text-gray-500">基金收益(CNY)</th>
            <th class="px-4 py-2 text-right text-xs font-medium text-gray-500">分红利息(CNY)</th>
            <th class="px-4 py-2 text-right text-xs font-medium text-gray-500">预估税额(CNY)</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          <tr v-for="year in years" :key="year">
            <td class="px-4 py-3 font-medium text-gray-900">{{ year }}</td>
            <td class="px-4 py-3 text-right">
              <div class="flex items-center justify-end gap-2">
                <div class="w-20 h-2 bg-gray-100 rounded-full overflow-hidden hidden sm:block">
                  <div
                    class="h-full rounded-full"
                    :class="reports.get(year)!.stock.totalGainCny >= 0 ? 'bg-red-400' : 'bg-green-400'"
                    :style="{ width: barWidth(reports.get(year)!.stock.totalGainCny) }"
                  />
                </div>
                <span :class="reports.get(year)!.stock.totalGainCny >= 0 ? 'text-red-600' : 'text-green-600'">
                  ¥{{ fmt(reports.get(year)!.stock.totalGainCny) }}
                </span>
              </div>
            </td>
            <td class="px-4 py-3 text-right" :class="reports.get(year)!.fund.totalGainCny >= 0 ? 'text-red-600' : 'text-green-600'">
              ¥{{ fmt(reports.get(year)!.fund.totalGainCny) }}
            </td>
            <td class="px-4 py-3 text-right text-gray-900">
              ¥{{ fmt(reports.get(year)!.dividend.totalDividendCny) }}
            </td>
            <td class="px-4 py-3 text-right font-semibold text-red-700">
              ¥{{ fmt(reports.get(year)!.totalEstimatedTax) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
