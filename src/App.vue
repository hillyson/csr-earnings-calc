<script setup lang="ts">
import { ref, computed } from 'vue'
import { parseAnnualStatement, parseDividendReport } from './lib/parser'
import { calculateYearlyReport } from './lib/calculator'
import type { ParsedData, YearlyTaxReport } from './lib/types'
import FileUploader from './components/FileUploader.vue'
import YearSelector from './components/YearSelector.vue'
import ResultDashboard from './components/ResultDashboard.vue'
import DataSourceInfo from './components/DataSourceInfo.vue'
import YearComparison from './components/YearComparison.vue'

const parsedData = ref<ParsedData>({ annualStatements: [], dividendReports: [] })
const selectedYear = ref<number>(0)
const report = ref<YearlyTaxReport | null>(null)
const allReports = ref<Map<number, YearlyTaxReport>>(new Map())
const parseError = ref<string>('')

const availableYears = computed(() => {
  const years = new Set<number>()
  for (const s of parsedData.value.annualStatements) {
    if (s.year) years.add(s.year)
  }
  return Array.from(years).sort((a, b) => b - a)
})

const hasData = computed(() => parsedData.value.annualStatements.length > 0)

async function handleFilesUploaded(files: File[]) {
  parseError.value = ''
  try {
    const data: ParsedData = { annualStatements: [], dividendReports: [] }

    for (const file of files) {
      const buffer = await file.arrayBuffer()
      const name = file.name

      if (name.includes('年度账单')) {
        data.annualStatements.push(parseAnnualStatement(buffer, name))
      } else if (name.includes('利息股息') || name.includes('其他收入')) {
        data.dividendReports.push(parseDividendReport(buffer, name))
      }
    }

    data.annualStatements.sort((a, b) => a.year - b.year)
    data.dividendReports.sort((a, b) => a.year - b.year)

    parsedData.value = data

    const reports = new Map<number, YearlyTaxReport>()
    for (const stmt of data.annualStatements) {
      if (stmt.year) {
        reports.set(stmt.year, calculateYearlyReport(data, stmt.year))
      }
    }
    allReports.value = reports

    if (availableYears.value.length > 0 && !selectedYear.value) {
      selectedYear.value = availableYears.value[0]
    }

    recalculate()
  } catch (e) {
    parseError.value = e instanceof Error ? e.message : String(e)
  }
}

function handleYearChange(year: number) {
  selectedYear.value = year
  recalculate()
}

function recalculate() {
  if (!selectedYear.value || !hasData.value) {
    report.value = null
    return
  }
  report.value = allReports.value.get(selectedYear.value) ?? null
}
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <header class="bg-white border-b border-gray-200 sticky top-0 z-10">
      <div class="max-w-5xl mx-auto px-4 py-4 sm:px-6">
        <h1 class="text-xl sm:text-2xl font-bold text-gray-900">
          境外证券收益个税计算器
        </h1>
        <p class="text-sm text-gray-500 mt-1">
          基于中国居民个人所得税规则，自动解析富途年度结单
        </p>
      </div>
    </header>

    <main class="max-w-5xl mx-auto px-4 py-6 sm:px-6 space-y-6">
      <FileUploader @files-uploaded="handleFilesUploaded" />

      <div v-if="parseError" class="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700" data-testid="parse-error">
        解析出错：{{ parseError }}
      </div>

      <template v-if="hasData">
        <YearSelector
          :years="availableYears"
          :selected-year="selectedYear"
          @change="handleYearChange"
        />

        <ResultDashboard v-if="report" :report="report" />

        <YearComparison
          v-if="allReports.size > 1"
          :reports="allReports"
        />

        <DataSourceInfo v-if="report" :report="report" />
      </template>
    </main>

    <footer class="border-t border-gray-200 mt-12 py-6 text-center text-xs text-gray-400">
      <p>本工具仅供参考，不构成税务建议。实际申报请咨询专业税务顾问。</p>
    </footer>
  </div>
</template>
