<script setup lang="ts">
import { ref } from 'vue'
import type { ValidationResult } from '../lib/types'

defineProps<{
  validation: ValidationResult
}>()

const showCashFlowBreakdown = ref(false)

const categoryLabels: Record<string, string> = {
  DEPOSIT_WITHDRAWAL: '存入/取出',
  IPO: 'IPO申购',
  DIVIDEND: '股息/分红',
  FEE: '手续费',
  INTEREST: '利息',
  OPTION_FEE: '期权行权费',
  ACCOUNT_UPGRADE: '账户升级',
  CURRENCY_EXCHANGE: '货币兑换',
  SETTLEMENT: '统一结算',
  REFUND: '退款',
}

function fmt(n: number): string {
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function pct(n: number): string {
  return (n * 100).toFixed(1) + '%'
}
</script>

<template>
  <div class="bg-white rounded-lg border border-gray-200">
    <div class="px-4 py-3 border-b border-gray-200">
      <h3 class="text-base font-semibold text-gray-900">期初期末对账验证</h3>
      <p class="text-xs text-gray-500 mt-0.5">
        将计算收益（含未实现盈亏、期权股票）与账户净值变化交叉验证
      </p>
    </div>

    <div v-if="validation.startTotalCny === 0 && validation.endTotalCny === 0" class="px-4 py-8 text-center text-gray-400 text-sm">
      持仓数据不足，无法对账
    </div>

    <div v-else class="p-4 space-y-4">
      <!-- Reconciliation table -->
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500">项目</th>
              <th class="px-4 py-2 text-right text-xs font-medium text-gray-500">HKD</th>
              <th class="px-4 py-2 text-right text-xs font-medium text-gray-500">CNY</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr>
              <td class="px-4 py-2 text-gray-600">期初总资产</td>
              <td class="px-4 py-2 text-right text-gray-600">HK${{ fmt(validation.startTotalHkd) }}</td>
              <td class="px-4 py-2 text-right text-gray-900">¥{{ fmt(validation.startTotalCny) }}</td>
            </tr>
            <tr>
              <td class="px-4 py-2 text-gray-600">期末总资产</td>
              <td class="px-4 py-2 text-right text-gray-600">HK${{ fmt(validation.endTotalHkd) }}</td>
              <td class="px-4 py-2 text-right text-gray-900">¥{{ fmt(validation.endTotalCny) }}</td>
            </tr>
            <tr>
              <td class="px-4 py-2 text-gray-600">净资金流入（外部）</td>
              <td class="px-4 py-2 text-right text-gray-600">HK${{ fmt(validation.netCashFlowHkd) }}</td>
              <td class="px-4 py-2 text-right text-gray-900">¥{{ fmt(validation.netCashFlowCny) }}</td>
            </tr>
            <tr v-if="validation.internalCashFlowCny != null">
              <td class="px-4 py-2 text-gray-400 text-xs">内部资金流动（已排除）</td>
              <td class="px-4 py-2 text-right text-gray-400 text-xs"></td>
              <td class="px-4 py-2 text-right text-gray-400 text-xs">¥{{ fmt(validation.internalCashFlowCny) }}</td>
            </tr>
            <tr class="bg-gray-50 font-medium">
              <td class="px-4 py-2 text-gray-700">净值变化</td>
              <td class="px-4 py-2 text-right text-gray-700">HK${{ fmt(validation.netAssetChangeHkd) }}</td>
              <td class="px-4 py-2 text-right text-gray-900">¥{{ fmt(validation.netAssetChange) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Comparison result -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm px-4">
        <div>
          <p class="text-gray-500 text-xs">已实现收益</p>
          <p class="font-medium text-gray-900 mt-0.5">¥{{ fmt(validation.calculatedIncome) }}</p>
        </div>
        <div v-if="validation.unrealizedPnlCny != null">
          <p class="text-gray-500 text-xs">未实现盈亏</p>
          <p class="font-medium mt-0.5" :class="validation.unrealizedPnlCny >= 0 ? 'text-red-600' : 'text-green-600'">
            ¥{{ fmt(validation.unrealizedPnlCny) }}
          </p>
        </div>
        <div v-if="validation.optionStockGainCny">
          <p class="text-gray-500 text-xs">期权股票收益</p>
          <p class="font-medium text-gray-600 mt-0.5">¥{{ fmt(validation.optionStockGainCny) }}</p>
        </div>
        <div>
          <p class="text-gray-500 text-xs">差额</p>
          <p class="font-medium text-gray-900 mt-0.5">¥{{ fmt(validation.difference) }}</p>
        </div>
        <div>
          <p class="text-gray-500 text-xs">差异率</p>
          <p
            class="font-semibold mt-0.5"
            :class="validation.isReasonable ? 'text-green-600' : 'text-amber-600'"
          >
            {{ pct(validation.differenceRate) }}
          </p>
        </div>
      </div>

      <!-- Cash flow classification breakdown -->
      <div v-if="validation.cashFlowCategoryCounts && Object.keys(validation.cashFlowCategoryCounts).length > 0" class="px-4">
        <button
          @click="showCashFlowBreakdown = !showCashFlowBreakdown"
          class="text-xs text-blue-600 hover:text-blue-800 hover:underline"
        >
          {{ showCashFlowBreakdown ? '收起' : '查看' }}资金流分类明细
        </button>
        <div v-if="showCashFlowBreakdown" class="mt-2 text-xs space-y-1">
          <div
            v-for="(count, cat) in validation.cashFlowCategoryCounts"
            :key="cat"
            class="flex justify-between text-gray-500"
          >
            <span>{{ categoryLabels[cat as string] || cat }}</span>
            <span>{{ count }} 笔</span>
          </div>
        </div>
      </div>

      <!-- Status badge -->
      <div
        class="rounded-lg px-3 py-2 text-sm"
        :class="validation.isReasonable
          ? 'bg-green-50 border border-green-200 text-green-700'
          : 'bg-amber-50 border border-amber-200 text-amber-700'"
      >
        <template v-if="validation.isReasonable">
          计算结果与账户净值变化基本吻合，差异在合理范围内
        </template>
        <template v-else>
          差异率较大，可能存在未计入的资产变动（期权、转仓等），建议人工核实
        </template>
      </div>
    </div>
  </div>
</template>
