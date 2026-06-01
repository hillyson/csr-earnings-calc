<script setup lang="ts">
import { ref, computed } from 'vue'
import { saveAs } from 'file-saver'
import {
  parseAeoiPdf,
  tryFetchIrdRate,
  buildWorkbookArray,
  outputFilename,
  irdUrlForYear,
  type AeoiParseResult,
} from '../lib/aeoi/pdf-converter'

const expanded = ref(false)
const isDragging = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

const pdfName = ref('')
const parsing = ref(false)
const error = ref('')
const result = ref<AeoiParseResult | null>(null)

const usdToHkd = ref<number | null>(null)
const rmb100 = ref<number | null>(null)
const fetchingRate = ref(false)
const rateMsg = ref('')

const generating = ref(false)

const irdUrl = computed(() => (result.value?.year ? irdUrlForYear(result.value.year) : ''))
const rateReady = computed(
  () => !!usdToHkd.value && usdToHkd.value > 0 && !!rmb100.value && rmb100.value > 0,
)
const canDownload = computed(
  () => !!result.value && result.value.rows.length > 0 && rateReady.value,
)

function fmt(n: number): string {
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function reset() {
  pdfName.value = ''
  error.value = ''
  result.value = null
  usdToHkd.value = null
  rmb100.value = null
  rateMsg.value = ''
}

function openPicker() {
  fileInput.value?.click()
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  isDragging.value = false
  const f = e.dataTransfer?.files?.[0]
  if (f) handleFile(f)
}

function onSelect(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (f) handleFile(f)
}

async function handleFile(file: File) {
  reset()
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    error.value = '请上传 PDF 格式的「自动交换财务账户资料」文件。'
    return
  }
  pdfName.value = file.name
  parsing.value = true
  try {
    const buffer = await file.arrayBuffer()
    const parsed = await parseAeoiPdf(buffer)
    if (!parsed.year) {
      error.value = '无法识别年份，请确认这是富途「自动交换财务账户资料」PDF。'
      parsing.value = false
      return
    }
    if (parsed.rows.length === 0) {
      error.value = '未能从 PDF 提取到账户财务信息，请确认文件内容。'
      parsing.value = false
      return
    }
    result.value = parsed
    parsing.value = false
    autoFetchRate()
  } catch (e) {
    error.value = `解析失败：${e instanceof Error ? e.message : String(e)}`
    parsing.value = false
  }
}

async function autoFetchRate() {
  if (!result.value?.year) return
  fetchingRate.value = true
  rateMsg.value = ''
  try {
    const rate = await tryFetchIrdRate(result.value.year)
    usdToHkd.value = rate.usdToHkd
    rmb100.value = rate.rmb100
    rateMsg.value = `已自动获取 IRD Dec ${result.value.year} 汇率`
  } catch {
    rateMsg.value = '自动获取失败（浏览器跨域限制），请点击下方链接查看 IRD 官方汇率后手动填写。'
  } finally {
    fetchingRate.value = false
  }
}

function download() {
  if (!result.value || !rateReady.value) return
  generating.value = true
  error.value = ''
  try {
    const bytes = buildWorkbookArray({
      year: result.value.year,
      nnid: result.value.nnid,
      name: result.value.name,
      rows: result.value.rows,
      rate: { usdToHkd: usdToHkd.value!, rmb100: rmb100.value! },
    })
    const blob = new Blob([bytes as unknown as BlobPart], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    saveAs(blob, outputFilename(result.value.year, result.value.nnid))
  } catch (e) {
    error.value = `生成失败：${e instanceof Error ? e.message : String(e)}`
  } finally {
    generating.value = false
  }
}
</script>

<template>
  <div class="bg-white rounded-lg border border-gray-200">
    <!-- 入口按钮 -->
    <button
      class="w-full px-6 py-3 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
      @click="expanded = !expanded"
    >
      <div class="flex items-center gap-2">
        <svg
          class="h-4 w-4 text-gray-400 transition-transform"
          :class="{ 'rotate-90': expanded }"
          viewBox="0 0 20 20" fill="currentColor"
        >
          <path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clip-rule="evenodd" />
        </svg>
        <span class="text-sm font-medium text-gray-700">
          AEOI PDF 转换工具
        </span>
        <span class="text-xs text-gray-400">（2025 年起：自动交换财务账户资料 PDF → 标准 xlsx）</span>
      </div>
      <span class="text-xs text-blue-600">{{ expanded ? '收起' : '展开' }}</span>
    </button>

    <div v-if="expanded" class="px-6 pb-6 pt-0 border-t border-gray-100">
      <p class="text-xs text-gray-500 my-3">
        富途自 2025 年起将「利息股息及其他收入汇总」改为 AEOI PDF。上传该 PDF，工具会按历史模板生成
        可直接上传计算的标准 xlsx，汇率取目标年度 12 月香港税务局(IRD)官方汇率。
      </p>

      <!-- 上传区 -->
      <div
        class="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors"
        :class="isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'"
        @dragover.prevent="isDragging = true"
        @dragleave="isDragging = false"
        @drop="onDrop"
        @click="openPicker"
      >
        <input ref="fileInput" type="file" accept=".pdf" class="hidden" @change="onSelect" />
        <div class="text-gray-500">
          <svg class="mx-auto h-10 w-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <p class="mt-2 text-sm">
            拖拽 PDF 到此处，或
            <span class="text-blue-600 font-medium">点击选择文件</span>
          </p>
          <p class="mt-1 text-xs text-gray-400">仅支持「自动交换财务账户资料」PDF</p>
        </div>
      </div>

      <p v-if="pdfName" class="mt-2 text-xs text-gray-500 truncate">已选择：{{ pdfName }}</p>

      <div v-if="parsing" class="mt-3 text-sm text-gray-500">正在解析 PDF…</div>

      <div v-if="error" class="mt-3 bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700">
        {{ error }}
      </div>

      <!-- 解析结果 + 汇率 -->
      <div v-if="result" class="mt-4 space-y-4">
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-sm">
          <div><span class="text-gray-500 text-xs">年份</span><p class="font-medium text-gray-900">{{ result.year }}</p></div>
          <div><span class="text-gray-500 text-xs">牛牛号</span><p class="font-medium text-gray-900">{{ result.nnid || '—' }}</p></div>
          <div><span class="text-gray-500 text-xs">持有人</span><p class="font-medium text-gray-900">{{ result.name || '—' }}</p></div>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500">账户</th>
                <th class="px-3 py-2 text-right text-xs font-medium text-gray-500">股息</th>
                <th class="px-3 py-2 text-right text-xs font-medium text-gray-500">利息</th>
                <th class="px-3 py-2 text-right text-xs font-medium text-gray-500">其他收入</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr v-for="(r, i) in result.rows" :key="i">
                <td class="px-3 py-2 text-gray-700">{{ r.label }}</td>
                <td class="px-3 py-2 text-right text-gray-900">{{ fmt(r.dividends) }}</td>
                <td class="px-3 py-2 text-right text-gray-900">{{ fmt(r.interest) }}</td>
                <td class="px-3 py-2 text-right text-gray-900">{{ fmt(r.otherIncome) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- 汇率 -->
        <div class="rounded-lg border border-gray-200 p-3 space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-gray-700">IRD Dec {{ result.year }} 参考汇率</span>
            <button
              class="text-xs text-blue-600 hover:underline disabled:text-gray-400"
              :disabled="fetchingRate"
              @click="autoFetchRate"
            >
              {{ fetchingRate ? '获取中…' : '尝试自动获取' }}
            </button>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <label class="text-xs text-gray-500">
              USD → HKD
              <input
                v-model.number="usdToHkd" type="number" step="0.0001" placeholder="如 7.7967"
                class="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
              />
            </label>
            <label class="text-xs text-gray-500">
              HK$100 → 人民币(RMB)
              <input
                v-model.number="rmb100" type="number" step="0.0001" placeholder="如 91.6403"
                class="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
              />
            </label>
          </div>
          <p class="text-xs" :class="rateMsg.includes('失败') ? 'text-amber-600' : 'text-gray-500'">
            {{ rateMsg }}
          </p>
          <a
            v-if="irdUrl" :href="irdUrl" target="_blank" rel="noopener"
            class="text-xs text-blue-600 hover:underline inline-flex items-center gap-1"
          >
            打开 IRD 官方汇率页面查看 Dec {{ result.year }}
            <svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
          </a>
        </div>

        <button
          class="w-full rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors"
          :class="canDownload && !generating ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-300 cursor-not-allowed'"
          :disabled="!canDownload || generating"
          @click="download"
        >
          {{ generating ? '生成中…' : '生成并下载 xlsx' }}
        </button>
        <p v-if="!rateReady" class="text-xs text-gray-400 text-center -mt-2">请先填写有效的汇率后再下载</p>
      </div>
    </div>
  </div>
</template>
