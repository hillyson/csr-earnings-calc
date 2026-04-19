<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { YearlyTaxReport, RealizedGain } from '../lib/types'
import { downloadReport } from '../lib/calculator/report-export'
import { lookupAllNames } from '../lib/stock-names'
import ValidationCard from './ValidationCard.vue'

const props = defineProps<{
  report: YearlyTaxReport
}>()

function fmt(n: number): string {
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function gainClass(n: number): string {
  return n >= 0 ? 'text-red-600' : 'text-green-600'
}

const expandedStocks = ref<Set<string>>(new Set())
const expandedFunds = ref<Set<string>>(new Set())
const stockNames = ref<Map<string, string>>(new Map())

function toggleStock(symbol: string) {
  const s = new Set(expandedStocks.value)
  s.has(symbol) ? s.delete(symbol) : s.add(symbol)
  expandedStocks.value = s
}

function toggleFund(symbol: string) {
  const s = new Set(expandedFunds.value)
  s.has(symbol) ? s.delete(symbol) : s.add(symbol)
  expandedFunds.value = s
}

function displayName(symbol: string): string {
  const name = stockNames.value.get(symbol)
  if (!name || name === symbol) return symbol
  return `${name}(${symbol})`
}

watch(() => props.report, async (report) => {
  const symbols: Array<{ symbol: string; market: string }> = []
  for (const g of report.stock.realizedGains) {
    symbols.push({ symbol: g.symbol, market: g.market })
  }
  for (const pos of report.stock.unrealizedPositions) {
    symbols.push({ symbol: pos.symbol, market: pos.market })
  }
  for (const g of report.fund.gains) {
    symbols.push({ symbol: g.symbol, market: '-' })
  }
  stockNames.value = await lookupAllNames(symbols)
}, { immediate: true })

interface StockGroup {
  symbol: string
  trades: RealizedGain[]
  totalGain: number
  totalGainCny: number
  totalFees: number
  tradeCount: number
}

const stockGroups = computed<StockGroup[]>(() => {
  const map = new Map<string, RealizedGain[]>()
  for (const g of props.report.stock.realizedGains) {
    const arr = map.get(g.symbol) || []
    arr.push(g)
    map.set(g.symbol, arr)
  }
  return Array.from(map.entries()).map(([symbol, trades]) => ({
    symbol,
    trades,
    totalGain: trades.reduce((s, t) => s + t.gain, 0),
    totalGainCny: trades.reduce((s, t) => s + t.gainCny, 0),
    totalFees: trades.reduce((s, t) => s + t.fees, 0),
    tradeCount: trades.length,
  })).sort((a, b) => Math.abs(b.totalGainCny) - Math.abs(a.totalGainCny))
})
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
        <p class="text-2xl font-bold mt-1" :class="gainClass(report.stock.totalGainCny)">
          ¥{{ fmt(report.stock.totalGainCny) }}
        </p>
      </div>
      <div class="bg-white rounded-lg border border-gray-200 p-4">
        <p class="text-sm text-gray-500">基金收益 (CNY)</p>
        <p class="text-2xl font-bold mt-1" :class="gainClass(report.fund.totalGainCny)">
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

    <!-- Stock Details — Grouped by Symbol -->
    <div class="bg-white rounded-lg border border-gray-200">
      <div class="px-4 py-3 border-b border-gray-200">
        <h3 class="text-base font-semibold text-gray-900">股票交易明细</h3>
        <p class="text-xs text-gray-500 mt-0.5">
          应纳税所得额 = 卖出收入 − 移动加权平均成本 − 手续费（年度内盈亏互抵）
        </p>
      </div>
      <div v-if="stockGroups.length > 0">
        <div v-for="group in stockGroups" :key="group.symbol" class="border-b border-gray-100 last:border-b-0">
          <button
            class="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors text-left"
            @click="toggleStock(group.symbol)"
          >
            <div class="flex items-center gap-3">
              <svg
                class="h-4 w-4 text-gray-400 transition-transform"
                :class="{ 'rotate-90': expandedStocks.has(group.symbol) }"
                viewBox="0 0 20 20" fill="currentColor"
              >
                <path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clip-rule="evenodd" />
              </svg>
              <span class="font-medium text-gray-900">{{ displayName(group.symbol) }}</span>
              <span class="text-xs text-gray-400">{{ group.tradeCount }}笔交易</span>
            </div>
            <span class="text-sm font-semibold" :class="gainClass(group.totalGainCny)">
              ¥{{ fmt(group.totalGainCny) }}
            </span>
          </button>
          <div v-if="expandedStocks.has(group.symbol)" class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-4 py-2 text-left text-xs font-medium text-gray-500">卖出日期</th>
                  <th class="px-4 py-2 text-right text-xs font-medium text-gray-500">数量</th>
                  <th class="px-4 py-2 text-right text-xs font-medium text-gray-500">卖出单价</th>
                  <th class="px-4 py-2 text-right text-xs font-medium text-gray-500">卖出金额</th>
                  <th class="px-4 py-2 text-right text-xs font-medium text-gray-500">成本单价</th>
                  <th class="px-4 py-2 text-right text-xs font-medium text-gray-500">成本</th>
                  <th class="px-4 py-2 text-right text-xs font-medium text-gray-500">手续费</th>
                  <th class="px-4 py-2 text-right text-xs font-medium text-gray-500">收益</th>
                  <th class="px-4 py-2 text-right text-xs font-medium text-gray-500">收益(CNY)</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                <tr v-for="(g, i) in group.trades" :key="i">
                  <td class="px-4 py-2 text-gray-600">{{ g.sellDate }}</td>
                  <td class="px-4 py-2 text-right text-gray-600">{{ g.sellQuantity }}</td>
                  <td class="px-4 py-2 text-right text-gray-600">{{ fmt(g.sellPrice) }}</td>
                  <td class="px-4 py-2 text-right text-gray-600">{{ fmt(g.sellAmount) }}</td>
                  <td class="px-4 py-2 text-right text-gray-600">{{ g.sellQuantity > 0 ? fmt(g.costBasis / g.sellQuantity) : '-' }}</td>
                  <td class="px-4 py-2 text-right text-gray-600">{{ fmt(g.costBasis) }}</td>
                  <td class="px-4 py-2 text-right text-gray-600">{{ fmt(g.fees) }}</td>
                  <td class="px-4 py-2 text-right" :class="gainClass(g.gain)">
                    {{ fmt(g.gain) }} {{ g.currency }}
                  </td>
                  <td class="px-4 py-2 text-right font-medium" :class="gainClass(g.gainCny)">
                    ¥{{ fmt(g.gainCny) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div class="bg-gray-50 px-4 py-3 space-y-1">
          <div v-if="report.stock.totalGainHkd !== 0" class="flex justify-between text-sm">
            <span class="text-gray-500">年度股票净收益 (HKD)</span>
            <span :class="gainClass(report.stock.totalGainHkd)">HK${{ fmt(report.stock.totalGainHkd) }}</span>
          </div>
          <div v-if="report.stock.totalGainUsd !== 0" class="flex justify-between text-sm">
            <span class="text-gray-500">年度股票净收益 (USD)</span>
            <span :class="gainClass(report.stock.totalGainUsd)">US${{ fmt(report.stock.totalGainUsd) }}</span>
          </div>
          <div class="flex justify-between text-sm font-semibold">
            <span class="text-gray-700">年度股票净收益 (CNY)</span>
            <span :class="gainClass(report.stock.totalGainCny)">¥{{ fmt(report.stock.totalGainCny) }}</span>
          </div>
          <div class="flex justify-between text-sm font-semibold">
            <span class="text-gray-700">应纳税所得额 (CNY)</span>
            <span class="text-red-700">¥{{ fmt(report.stock.netTaxableIncomeCny) }}</span>
          </div>
          <div class="flex justify-between text-sm font-semibold">
            <span class="text-gray-700">预估税额 (20%)</span>
            <span class="text-red-700">¥{{ fmt(report.stock.estimatedTax) }}</span>
          </div>
        </div>
      </div>
      <p v-else class="px-4 py-8 text-center text-gray-400 text-sm">
        该年度无股票卖出交易
      </p>
    </div>

    <!-- Fund Details — Grouped by Symbol -->
    <div v-if="report.fund.gains.length > 0" class="bg-white rounded-lg border border-gray-200">
      <div class="px-4 py-3 border-b border-gray-200">
        <h3 class="text-base font-semibold text-gray-900">基金收益明细</h3>
        <p class="text-xs text-gray-500 mt-0.5">
          收益 = (赎回金额 + 期末市值) − (申购金额 + 期初市值)，与股票不可互抵
        </p>
      </div>
      <div>
        <div v-for="g in report.fund.gains" :key="g.symbol" class="border-b border-gray-100 last:border-b-0">
          <button
            class="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors text-left"
            @click="toggleFund(g.symbol)"
          >
            <div class="flex items-center gap-3">
              <svg
                class="h-4 w-4 text-gray-400 transition-transform"
                :class="{ 'rotate-90': expandedFunds.has(g.symbol) }"
                viewBox="0 0 20 20" fill="currentColor"
              >
                <path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clip-rule="evenodd" />
              </svg>
              <span class="font-medium text-gray-900">{{ displayName(g.symbol) }}</span>
            </div>
            <span class="text-sm font-semibold" :class="gainClass(g.gainCny)">
              ¥{{ fmt(g.gainCny) }}
            </span>
          </button>
          <div v-if="expandedFunds.has(g.symbol)" class="px-4 py-3 bg-gray-50">
            <div class="grid grid-cols-2 gap-x-8 gap-y-2 text-sm max-w-md">
              <div class="text-gray-500">期初持仓市值</div>
              <div class="text-right text-gray-700">{{ fmt(g.startValue) }} HKD</div>
              <div class="text-gray-500">年内申购</div>
              <div class="text-right text-gray-700">{{ fmt(g.buyAmount) }} HKD</div>
              <div class="text-gray-500">年内赎回</div>
              <div class="text-right text-gray-700">{{ fmt(g.sellAmount) }} HKD</div>
              <div class="text-gray-500">期末持仓市值</div>
              <div class="text-right text-gray-700">{{ fmt(g.endValue) }} HKD</div>
              <div class="font-medium text-gray-700 border-t border-gray-200 pt-2">收益 (HKD)</div>
              <div class="text-right font-semibold border-t border-gray-200 pt-2" :class="gainClass(g.gain)">
                {{ fmt(g.gain) }}
              </div>
              <div class="font-medium text-gray-700">收益 (CNY)</div>
              <div class="text-right font-semibold" :class="gainClass(g.gainCny)">
                ¥{{ fmt(g.gainCny) }}
              </div>
            </div>
          </div>
        </div>
        <div class="bg-gray-50 px-4 py-3">
          <div class="flex justify-between text-sm font-semibold">
            <span class="text-gray-700">基金总收益 (CNY)</span>
            <span :class="gainClass(report.fund.totalGainCny)">¥{{ fmt(report.fund.totalGainCny) }}</span>
          </div>
        </div>
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
              <th class="px-4 py-2 text-right text-xs font-medium text-gray-500">原始金额</th>
              <th class="px-4 py-2 text-right text-xs font-medium text-gray-500">金额(CNY)</th>
              <th class="px-4 py-2 text-right text-xs font-medium text-gray-500">已代扣税率</th>
              <th class="px-4 py-2 text-right text-xs font-medium text-gray-500">已代扣税额</th>
              <th class="px-4 py-2 text-right text-xs font-medium text-gray-500">应补缴税额</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-for="(d, i) in report.dividend.details" :key="i">
              <td class="px-4 py-2 text-gray-900">{{ d.source }}</td>
              <td class="px-4 py-2 text-right text-gray-600">{{ fmt(d.amount) }} {{ d.currency }}</td>
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
              <td class="px-4 py-2 font-medium text-gray-900">
                {{ displayName(pos.symbol) }}
                <span v-if="pos.isOptionStock" class="ml-1 text-xs text-amber-600 font-normal">(期权)</span>
              </td>
              <td class="px-4 py-2 text-right text-gray-600">{{ pos.quantity.toFixed(0) }}</td>
              <td class="px-4 py-2 text-right text-gray-600">{{ fmt(pos.avgCost) }}</td>
              <td class="px-4 py-2 text-right text-gray-600">{{ fmt(pos.totalCost) }}</td>
              <td class="px-4 py-2 text-right text-gray-600">{{ pos.currency }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Option Stock Trades -->
    <div v-if="report.stock.optionStockGains.length > 0" class="bg-white rounded-lg border border-gray-200">
      <div class="px-4 py-3 border-b border-gray-200">
        <h3 class="text-base font-semibold text-gray-900">期权行权股票交易（已单独完税）</h3>
        <p class="text-xs text-gray-500 mt-0.5">期权行权获得的股票，其收益已单独完税，不计入本年度应纳税所得额</p>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500">代码</th>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500">卖出日期</th>
              <th class="px-4 py-2 text-right text-xs font-medium text-gray-500">数量</th>
              <th class="px-4 py-2 text-right text-xs font-medium text-gray-500">卖出金额</th>
              <th class="px-4 py-2 text-right text-xs font-medium text-gray-500">成本</th>
              <th class="px-4 py-2 text-right text-xs font-medium text-gray-500">收益</th>
              <th class="px-4 py-2 text-right text-xs font-medium text-gray-500">收益(CNY)</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-for="(g, i) in report.stock.optionStockGains" :key="i">
              <td class="px-4 py-2 text-gray-900">{{ displayName(g.symbol) }}</td>
              <td class="px-4 py-2 text-gray-600">{{ g.sellDate }}</td>
              <td class="px-4 py-2 text-right text-gray-600">{{ g.sellQuantity }}</td>
              <td class="px-4 py-2 text-right text-gray-600">{{ fmt(g.sellAmount) }} {{ g.currency }}</td>
              <td class="px-4 py-2 text-right text-gray-600">{{ fmt(g.costBasis) }}</td>
              <td class="px-4 py-2 text-right" :class="gainClass(g.gain)">{{ fmt(g.gain) }} {{ g.currency }}</td>
              <td class="px-4 py-2 text-right font-medium" :class="gainClass(g.gainCny)">¥{{ fmt(g.gainCny) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="bg-gray-50 px-4 py-3">
        <div class="flex justify-between text-sm font-semibold">
          <span class="text-gray-700">期权股票收益合计 (CNY)</span>
          <span :class="gainClass(report.stock.optionStockTotalGainCny)">¥{{ fmt(report.stock.optionStockTotalGainCny) }}</span>
        </div>
        <p class="text-xs text-gray-400 mt-1">此部分仅用于对账，不计入应纳税额</p>
      </div>
    </div>

    <!-- Validation Card -->
    <ValidationCard v-if="report.validation" :validation="report.validation" />
  </div>
</template>
