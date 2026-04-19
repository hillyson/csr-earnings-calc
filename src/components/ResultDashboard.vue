<script setup lang="ts">
import { computed } from 'vue'
import type { YearlyTaxReport } from '../lib/types'
import { downloadReport } from '../lib/calculator/report-export'

const props = defineProps<{
  report: YearlyTaxReport
}>()

function fmt(n: number): string {
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const stockGainClass = computed(() =>
  props.report.stock.totalGainCny >= 0 ? 'text-red-600' : 'text-green-600'
)

const fundGainClass = computed(() =>
  props.report.fund.totalGainCny >= 0 ? 'text-red-600' : 'text-green-600'
)
</script>

<template>
  <div class="space-y-6">
    <!-- Export Button -->
    <div class="flex justify-end">
      <button
        class="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 active:bg-blue-800 transition-colors"
        @click="downloadReport(report)"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        导出报告
      </button>
    </div>

    <!-- Summary Cards -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div class="bg-white rounded-lg border border-gray-200 p-4">
        <p class="text-sm text-gray-500">股票已实现收益 (CNY)</p>
        <p class="text-2xl font-bold mt-1" :class="stockGainClass">
          ¥{{ fmt(report.stock.totalGainCny) }}
        </p>
      </div>
      <div class="bg-white rounded-lg border border-gray-200 p-4">
        <p class="text-sm text-gray-500">基金收益 (CNY)</p>
        <p class="text-2xl font-bold mt-1" :class="fundGainClass">
          ¥{{ fmt(report.fund.totalGainCny) }}
        </p>
      </div>
      <div class="bg-white rounded-lg border border-gray-200 p-4">
        <p class="text-sm text-gray-500">分红/利息 (CNY)</p>
        <p class="text-2xl font-bold mt-1 text-gray-900">
          ¥{{ fmt(report.dividend.totalDividendCny) }}
        </p>
      </div>
      <div class="bg-red-50 rounded-lg border border-red-200 p-4">
        <p class="text-sm text-red-600">预估应缴税额</p>
        <p class="text-2xl font-bold mt-1 text-red-700">
          ¥{{ fmt(report.totalEstimatedTax) }}
        </p>
      </div>
    </div>

    <!-- Warnings -->
    <div v-if="report.warnings.length > 0" class="bg-amber-50 border border-amber-200 rounded-lg p-4">
      <h3 class="text-sm font-semibold text-amber-800 mb-2">数据校验提示</h3>
      <ul class="space-y-1">
        <li
          v-for="(w, i) in report.warnings"
          :key="i"
          class="text-sm text-amber-700 flex items-start gap-2"
        >
          <span class="shrink-0 mt-0.5">⚠️</span>
          <span>{{ w.message }}</span>
        </li>
      </ul>
    </div>

    <!-- Stock Details -->
    <div class="bg-white rounded-lg border border-gray-200">
      <div class="px-4 py-3 border-b border-gray-200">
        <h3 class="text-base font-semibold text-gray-900">股票交易明细</h3>
        <p class="text-xs text-gray-500 mt-0.5">
          应纳税所得额 = 卖出收入 − 移动加权平均成本 − 手续费（年度内盈亏互抵）
        </p>
      </div>
      <div class="overflow-x-auto">
        <table v-if="report.stock.realizedGains.length > 0" class="w-full text-sm">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500">代码</th>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500">卖出日期</th>
              <th class="px-4 py-2 text-right text-xs font-medium text-gray-500">数量</th>
              <th class="px-4 py-2 text-right text-xs font-medium text-gray-500">卖出金额</th>
              <th class="px-4 py-2 text-right text-xs font-medium text-gray-500">成本</th>
              <th class="px-4 py-2 text-right text-xs font-medium text-gray-500">手续费</th>
              <th class="px-4 py-2 text-right text-xs font-medium text-gray-500">收益</th>
              <th class="px-4 py-2 text-right text-xs font-medium text-gray-500">收益(CNY)</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-for="(g, i) in report.stock.realizedGains" :key="i">
              <td class="px-4 py-2 font-medium text-gray-900">{{ g.symbol }}</td>
              <td class="px-4 py-2 text-gray-600">{{ g.sellDate }}</td>
              <td class="px-4 py-2 text-right text-gray-600">{{ g.sellQuantity }}</td>
              <td class="px-4 py-2 text-right text-gray-600">{{ fmt(g.sellAmount) }}</td>
              <td class="px-4 py-2 text-right text-gray-600">{{ fmt(g.costBasis) }}</td>
              <td class="px-4 py-2 text-right text-gray-600">{{ fmt(g.fees) }}</td>
              <td class="px-4 py-2 text-right" :class="g.gain >= 0 ? 'text-red-600' : 'text-green-600'">
                {{ fmt(g.gain) }} {{ g.currency }}
              </td>
              <td class="px-4 py-2 text-right font-medium" :class="g.gainCny >= 0 ? 'text-red-600' : 'text-green-600'">
                ¥{{ fmt(g.gainCny) }}
              </td>
            </tr>
          </tbody>
          <tfoot class="bg-gray-50 font-semibold">
            <tr>
              <td colspan="7" class="px-4 py-2 text-right text-gray-700">年度股票净收益 (CNY):</td>
              <td class="px-4 py-2 text-right" :class="stockGainClass">
                ¥{{ fmt(report.stock.totalGainCny) }}
              </td>
            </tr>
            <tr>
              <td colspan="7" class="px-4 py-2 text-right text-gray-700">应纳税所得额 (CNY):</td>
              <td class="px-4 py-2 text-right text-red-700">
                ¥{{ fmt(report.stock.netTaxableIncomeCny) }}
              </td>
            </tr>
            <tr>
              <td colspan="7" class="px-4 py-2 text-right text-gray-700">预估税额 (20%):</td>
              <td class="px-4 py-2 text-right text-red-700">
                ¥{{ fmt(report.stock.estimatedTax) }}
              </td>
            </tr>
          </tfoot>
        </table>
        <p v-else class="px-4 py-8 text-center text-gray-400 text-sm">
          该年度无股票卖出交易
        </p>
      </div>
    </div>

    <!-- Fund Details -->
    <div v-if="report.fund.gains.length > 0" class="bg-white rounded-lg border border-gray-200">
      <div class="px-4 py-3 border-b border-gray-200">
        <h3 class="text-base font-semibold text-gray-900">基金收益明细</h3>
        <p class="text-xs text-gray-500 mt-0.5">基金与股票属不同类型资产，单独计算，不可互抵</p>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500">基金代码</th>
              <th class="px-4 py-2 text-right text-xs font-medium text-gray-500">买入金额</th>
              <th class="px-4 py-2 text-right text-xs font-medium text-gray-500">卖出金额</th>
              <th class="px-4 py-2 text-right text-xs font-medium text-gray-500">收益(HKD)</th>
              <th class="px-4 py-2 text-right text-xs font-medium text-gray-500">收益(CNY)</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-for="(g, i) in report.fund.gains" :key="i">
              <td class="px-4 py-2 font-medium text-gray-900">{{ g.symbol }}</td>
              <td class="px-4 py-2 text-right text-gray-600">{{ fmt(g.buyAmount) }}</td>
              <td class="px-4 py-2 text-right text-gray-600">{{ fmt(g.sellAmount) }}</td>
              <td class="px-4 py-2 text-right" :class="g.gain >= 0 ? 'text-red-600' : 'text-green-600'">
                {{ fmt(g.gain) }}
              </td>
              <td class="px-4 py-2 text-right font-medium" :class="g.gainCny >= 0 ? 'text-red-600' : 'text-green-600'">
                ¥{{ fmt(g.gainCny) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Dividend Details -->
    <div v-if="report.dividend.details.length > 0" class="bg-white rounded-lg border border-gray-200">
      <div class="px-4 py-3 border-b border-gray-200">
        <h3 class="text-base font-semibold text-gray-900">分红/利息税务明细</h3>
        <p class="text-xs text-gray-500 mt-0.5">
          境外已缴税款可抵免，仅补缴差额。应补税额 = 分红总额 × 20% − 已在境外缴纳的税款
        </p>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500">来源</th>
              <th class="px-4 py-2 text-right text-xs font-medium text-gray-500">金额(CNY)</th>
              <th class="px-4 py-2 text-right text-xs font-medium text-gray-500">已代扣税率</th>
              <th class="px-4 py-2 text-right text-xs font-medium text-gray-500">已代扣税额</th>
              <th class="px-4 py-2 text-right text-xs font-medium text-gray-500">应补缴税额</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-for="(d, i) in report.dividend.details" :key="i">
              <td class="px-4 py-2 text-gray-900">{{ d.source }}</td>
              <td class="px-4 py-2 text-right text-gray-600">¥{{ fmt(d.amountCny) }}</td>
              <td class="px-4 py-2 text-right text-gray-600">{{ (d.withheldRate * 100).toFixed(0) }}%</td>
              <td class="px-4 py-2 text-right text-gray-600">¥{{ fmt(d.withheldAmount) }}</td>
              <td class="px-4 py-2 text-right font-medium text-red-600">¥{{ fmt(d.netPayable) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Unrealized Positions -->
    <div v-if="report.stock.unrealizedPositions.length > 0" class="bg-white rounded-lg border border-gray-200">
      <div class="px-4 py-3 border-b border-gray-200">
        <h3 class="text-base font-semibold text-gray-900">未实现持仓（不计税）</h3>
        <p class="text-xs text-gray-500 mt-0.5">浮盈浮亏不计税，仅在卖出时产生纳税义务</p>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500">代码</th>
              <th class="px-4 py-2 text-right text-xs font-medium text-gray-500">持仓数量</th>
              <th class="px-4 py-2 text-right text-xs font-medium text-gray-500">平均成本</th>
              <th class="px-4 py-2 text-right text-xs font-medium text-gray-500">总成本</th>
              <th class="px-4 py-2 text-right text-xs font-medium text-gray-500">币种</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-for="pos in report.stock.unrealizedPositions" :key="pos.symbol + pos.market">
              <td class="px-4 py-2 font-medium text-gray-900">{{ pos.symbol }}</td>
              <td class="px-4 py-2 text-right text-gray-600">{{ pos.quantity.toFixed(0) }}</td>
              <td class="px-4 py-2 text-right text-gray-600">{{ fmt(pos.avgCost) }}</td>
              <td class="px-4 py-2 text-right text-gray-600">{{ fmt(pos.totalCost) }}</td>
              <td class="px-4 py-2 text-right text-gray-600">{{ pos.currency }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
